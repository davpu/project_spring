import { randomUUID } from 'node:crypto';
import {
  BadGatewayException,
  Inject,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { topics } from '@org/shared';
import { APP_CONFIG, type AppConfig } from '../config/config';
import { MqttService } from './mqtt.service';

const CONTROL_TOPIC = '$CONTROL/dynamic-security/v1';
const RESPONSE_TOPIC = `${CONTROL_TOPIC}/response`;
const REQUEST_TIMEOUT_MS = 5000;

/** Role the API itself needs: read every gateway's telemetry, nothing else. */
const INGEST_ROLE = 'api-ingest';

export type DynsecCommand = { command: string } & Record<string, unknown>;

interface DynsecResponse {
  command: string;
  error?: string;
  data?: unknown;
  correlationData?: string;
}

interface Pending {
  resolve: (responses: DynsecResponse[]) => void;
  timer: NodeJS.Timeout;
}

type AclType =
  'subscribePattern' | 'publishClientSend' | 'publishClientReceive';

const acl = (rolename: string, acltype: AclType, topic: string) => ({
  command: 'addRoleACL',
  rolename,
  acltype,
  topic,
  allow: true,
});

/**
 * Drives the broker's dynamic-security plugin over its `$CONTROL` topic. This
 * is how a paired gateway gets its credentials: the broker holds the password
 * hash, so the database never stores one.
 */
@Injectable()
export class DynsecService {
  private readonly logger = new Logger(DynsecService.name);
  private readonly pending = new Map<string, Pending>();

  constructor(
    private readonly mqtt: MqttService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {
    // Must be registered before anything sends a command; MqttService runs
    // connect handlers in registration order.
    mqtt.onConnect(() => mqtt.subscribe([RESPONSE_TOPIC]));
    mqtt.onMessage((topic, payload) => this.handleResponse(topic, payload));
  }

  /**
   * Sends commands as one batch and returns their responses in order. A
   * command the broker rejects makes this throw, unless its error matches
   * `tolerate` (used to make provisioning idempotent).
   */
  async run(
    commands: DynsecCommand[],
    tolerate?: RegExp,
  ): Promise<DynsecResponse[]> {
    if (!this.mqtt.connected) {
      throw new ServiceUnavailableException('MQTT broker is unavailable');
    }
    const correlationData = randomUUID();
    const responses = new Promise<DynsecResponse[]>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(correlationData);
        reject(new ServiceUnavailableException('MQTT broker did not answer'));
      }, REQUEST_TIMEOUT_MS);
      this.pending.set(correlationData, { resolve, timer });
    });
    try {
      await this.mqtt.publish(
        CONTROL_TOPIC,
        JSON.stringify({
          commands: commands.map((c) => ({ ...c, correlationData })),
        }),
      );
    } catch (error) {
      this.settle(correlationData);
      throw error;
    }
    const results = await responses;
    const failed = results.find((r) => r.error && !tolerate?.test(r.error));
    if (failed) {
      throw new BadGatewayException(
        `Broker rejected ${failed.command}: ${failed.error}`,
      );
    }
    return results;
  }

  /**
   * Creates the broker client a gateway connects with. It may publish only
   * under its own `gateways/<id>/` and consume what local nodes publish to
   * `planters/`. Anything it created is removed again if a later step fails.
   */
  async provisionGateway(gatewayId: string, password: string): Promise<void> {
    const rolename = gatewayRole(gatewayId);
    try {
      await this.run([
        { command: 'createRole', rolename },
        acl(rolename, 'subscribePattern', 'planters/+/telemetry'),
        acl(rolename, 'publishClientReceive', 'planters/#'),
        acl(rolename, 'publishClientSend', `gateways/${gatewayId}/#`),
        {
          command: 'createClient',
          username: gatewayId,
          password,
          roles: [{ rolename }],
        },
      ]);
    } catch (error) {
      await this.removeGateway(gatewayId).catch(() => undefined);
      throw error;
    }
  }

  /** Revokes a gateway's access. Missing client or role is fine. */
  async removeGateway(gatewayId: string): Promise<void> {
    await this.run(
      [
        { command: 'deleteClient', username: gatewayId },
        { command: 'deleteRole', rolename: gatewayRole(gatewayId) },
      ],
      /not found/i,
    );
  }

  /**
   * Gives the API's own client read access to telemetry. The bootstrap admin
   * created by the broker entrypoint can only administer the plugin, so this
   * grants it one extra role. Safe to run on every start.
   *
   * Granting the role makes the broker drop that client's connection, so it is
   * done only when missing: an unconditional call would disconnect the API on
   * every reconnect, and a repeated `addClientRole` fails with a bare
   * "Internal error" that cannot be told apart from a real fault.
   */
  async ensureIngestAccess(): Promise<void> {
    await this.run(
      [
        { command: 'createRole', rolename: INGEST_ROLE },
        acl(INGEST_ROLE, 'subscribePattern', topics.telemetryFilter),
        acl(
          INGEST_ROLE,
          'publishClientReceive',
          'gateways/+/planters/+/telemetry',
        ),
      ],
      /already exists/i,
    );

    const username = this.config.mqttAdminUser;
    const [client] = await this.run([{ command: 'getClient', username }]);
    const roles =
      (client.data as { client?: { roles?: { rolename: string }[] } })?.client
        ?.roles ?? [];
    if (roles.some((role) => role.rolename === INGEST_ROLE)) return;

    await this.run([
      { command: 'addClientRole', username, rolename: INGEST_ROLE },
    ]);
  }

  private handleResponse(topic: string, payload: Buffer): void {
    if (topic !== RESPONSE_TOPIC) return;
    let parsed: { responses?: DynsecResponse[] };
    try {
      parsed = JSON.parse(payload.toString());
    } catch {
      this.logger.warn('Unparseable dynamic-security response');
      return;
    }
    const responses = parsed.responses ?? [];
    const correlationData = responses[0]?.correlationData;
    if (!correlationData) return;
    const pending = this.settle(correlationData);
    pending?.resolve(responses);
  }

  private settle(correlationData: string): Pending | undefined {
    const pending = this.pending.get(correlationData);
    if (pending) {
      clearTimeout(pending.timer);
      this.pending.delete(correlationData);
    }
    return pending;
  }
}

const gatewayRole = (gatewayId: string) => `gateway-${gatewayId}`;
