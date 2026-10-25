import { Inject, Injectable, Logger } from '@nestjs/common';
import { gateways, planters, readings, type Database } from '@org/db';
import {
  TelemetryPayloadSchema,
  parseTelemetryTopic,
  telemetryToReadings,
  topics,
} from '@org/shared';
import { eq, sql } from '@org/db';
import { PG_FOREIGN_KEY_VIOLATION, pgErrorCode } from '../common/pg-errors';
import { DB } from '../db/db.module';
import { DynsecService } from '../mqtt/dynsec.service';
import { MqttService } from '../mqtt/mqtt.service';

export type IngestOutcome =
  | 'stored'
  | 'bad-topic'
  | 'bad-json'
  | 'invalid-payload'
  | 'bad-timestamp'
  | 'unknown-gateway';

/** Telemetry is a handful of numbers; anything bigger is not from our gateway. */
const MAX_PAYLOAD_BYTES = 4096;
/**
 * A reading's own `ts` is trusted only within this window. Hypertable chunks
 * are created per timestamp, so an arbitrary date would create arbitrary chunks.
 */
const MAX_AGE_MS = 365 * 24 * 3_600_000;
const MAX_FUTURE_MS = 24 * 3_600_000;
const PLANTER_CACHE_LIMIT = 10_000;

/**
 * Persists telemetry the gateways publish. Which gateway a message belongs to
 * comes from its topic, and the broker ACL only lets a gateway publish under
 * its own id, so the topic is trustworthy without checking the sender again.
 */
@Injectable()
export class IngestService {
  private readonly logger = new Logger(IngestService.name);
  /** `gatewayId/sensorKey` -> planter id, to skip a lookup per message. */
  private readonly planterIds = new Map<string, string>();

  constructor(
    @Inject(DB) private readonly db: Database,
    mqtt: MqttService,
    dynsec: DynsecService,
  ) {
    mqtt.onConnect(async () => {
      await dynsec.ensureIngestAccess();
      await mqtt.subscribe([topics.telemetryFilter]);
      this.logger.log(`Subscribed to ${topics.telemetryFilter}`);
    });
    mqtt.onMessage(async (topic, payload) => {
      // The dynamic-security replies arrive through the same connection.
      if (topic.startsWith('$CONTROL/')) return;
      const outcome = await this.handleMessage(topic, payload);
      if (outcome !== 'stored') {
        this.logger.warn(`Dropped message on ${topic}: ${outcome}`);
      }
    });
  }

  async handleMessage(
    topic: string,
    payload: Buffer,
    receivedAt = new Date(),
  ): Promise<IngestOutcome> {
    const parsedTopic = parseTelemetryTopic(topic);
    if (!parsedTopic) return 'bad-topic';

    if (payload.length > MAX_PAYLOAD_BYTES) return 'invalid-payload';
    let json: unknown;
    try {
      json = JSON.parse(payload.toString('utf8'));
    } catch {
      return 'bad-json';
    }
    const body = TelemetryPayloadSchema.safeParse(json);
    if (!body.success) return 'invalid-payload';

    const rows = telemetryToReadings(body.data, receivedAt);
    const age = receivedAt.getTime() - rows[0].time.getTime();
    if (age > MAX_AGE_MS || -age > MAX_FUTURE_MS) return 'bad-timestamp';

    const { gatewayId, sensorKey } = parsedTopic;
    const stored = await this.store(gatewayId, sensorKey, rows);
    if (!stored) return 'unknown-gateway';

    await this.db
      .update(gateways)
      .set({ lastSeenAt: receivedAt })
      .where(eq(gateways.id, gatewayId));
    return 'stored';
  }

  private async store(
    gatewayId: string,
    sensorKey: string,
    rows: ReturnType<typeof telemetryToReadings>,
  ): Promise<boolean> {
    // A cached planter id goes stale if the planter was deleted meanwhile; the
    // foreign key then rejects the insert, and one retry re-resolves it.
    for (let attempt = 0; ; attempt++) {
      const planterId = await this.resolvePlanter(gatewayId, sensorKey);
      if (!planterId) return false;
      try {
        await this.db
          .insert(readings)
          .values(rows.map((row) => ({ planterId, ...row })))
          // QoS 1 can redeliver; the primary key makes that harmless.
          .onConflictDoNothing();
        return true;
      } catch (error) {
        if (pgErrorCode(error) !== PG_FOREIGN_KEY_VIOLATION || attempt > 0) {
          throw error;
        }
        this.planterIds.delete(`${gatewayId}/${sensorKey}`);
      }
    }
  }

  /**
   * Finds the planter for a sensor key, creating it on first sight so a new
   * node needs no setup. Returns null if the gateway itself does not exist.
   */
  private async resolvePlanter(
    gatewayId: string,
    sensorKey: string,
  ): Promise<string | null> {
    const cacheKey = `${gatewayId}/${sensorKey}`;
    const cached = this.planterIds.get(cacheKey);
    if (cached) return cached;

    try {
      const [row] = await this.db
        .insert(planters)
        .values({ gatewayId, sensorKey, name: sensorKey })
        .onConflictDoUpdate({
          target: [planters.gatewayId, planters.sensorKey],
          // A no-op update, only so RETURNING yields the existing row's id.
          set: { sensorKey: sql`excluded.sensor_key` },
        })
        .returning({ id: planters.id });
      if (this.planterIds.size >= PLANTER_CACHE_LIMIT) this.planterIds.clear();
      this.planterIds.set(cacheKey, row.id);
      return row.id;
    } catch (error) {
      if (pgErrorCode(error) === PG_FOREIGN_KEY_VIOLATION) return null;
      throw error;
    }
  }
}
