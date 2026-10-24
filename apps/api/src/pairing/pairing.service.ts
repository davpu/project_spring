import { randomBytes, randomUUID } from 'node:crypto';
import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { gateways, pairingCodes, type Database } from '@org/db';
import {
  PAIRING_CODE_TTL_MINUTES,
  formatPairingCode,
  topics,
  type CreatePairingCodeResponse,
  type PairResponse,
  type PairingStatusResponse,
} from '@org/shared';
import { and, eq, gt, isNull, sql } from '@org/db';
import { PG_UNIQUE_VIOLATION, pgErrorCode } from '../common/pg-errors';
import { APP_CONFIG, type AppConfig } from '../config/config';
import { DB } from '../db/db.module';
import { DynsecService } from '../mqtt/dynsec.service';
import { generatePairingCode, hashPairingCode } from './pairing-code';

/** Stops a user from minting codes in a loop; expired and used ones do not count. */
const MAX_PENDING_CODES = 5;
const CODE_COLLISION_RETRIES = 5;
/** One message for every failure, so a caller cannot tell "wrong" from "expired" from "used". */
const INVALID_CODE = 'Invalid or expired pairing code';

@Injectable()
export class PairingService {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly dynsec: DynsecService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  async createCode(
    userId: string,
    gatewayName: string,
  ): Promise<CreatePairingCodeResponse> {
    const [{ pending }] = await this.db
      .select({ pending: sql<number>`count(*)::int` })
      .from(pairingCodes)
      .where(
        and(
          eq(pairingCodes.userId, userId),
          isNull(pairingCodes.redeemedAt),
          gt(pairingCodes.expiresAt, sql`now()`),
        ),
      );
    if (pending >= MAX_PENDING_CODES) {
      throw new HttpException(
        'Too many pending pairing codes, wait for one to expire',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    for (let attempt = 0; attempt < CODE_COLLISION_RETRIES; attempt++) {
      const code = generatePairingCode();
      try {
        const [row] = await this.db
          .insert(pairingCodes)
          .values({
            userId,
            gatewayName,
            codeHash: hashPairingCode(code),
            expiresAt: sql`now() + make_interval(mins => ${PAIRING_CODE_TTL_MINUTES})`,
          })
          .returning({
            id: pairingCodes.id,
            expiresAt: pairingCodes.expiresAt,
          });
        return {
          id: row.id,
          code: formatPairingCode(code),
          expiresAt: row.expiresAt.toISOString(),
        };
      } catch (error) {
        // Two live codes with the same hash would be ambiguous; draw again.
        if (pgErrorCode(error) !== PG_UNIQUE_VIOLATION) throw error;
      }
    }
    throw new HttpException(
      'Could not generate a pairing code',
      HttpStatus.SERVICE_UNAVAILABLE,
    );
  }

  async getStatus(userId: string, id: string): Promise<PairingStatusResponse> {
    const [row] = await this.db
      .select({
        redeemedAt: pairingCodes.redeemedAt,
        gatewayId: pairingCodes.gatewayId,
        expired: sql<boolean>`${pairingCodes.expiresAt} <= now()`,
      })
      .from(pairingCodes)
      .where(and(eq(pairingCodes.id, id), eq(pairingCodes.userId, userId)));
    if (!row) throw new NotFoundException();
    if (row.redeemedAt) {
      return { status: 'redeemed', gatewayId: row.gatewayId ?? undefined };
    }
    return { status: row.expired ? 'expired' : 'pending' };
  }

  /**
   * Turns a pairing code into a gateway and its broker credentials.
   *
   * The claim, the gateway row and the broker client succeed or fail together:
   * the broker call happens inside the transaction, so if it fails the code is
   * not consumed and the gateway can simply retry.
   */
  async redeem(code: string): Promise<PairResponse> {
    const gatewayId = randomUUID();
    const password = randomBytes(24).toString('base64url');
    let provisioned = false;

    try {
      await this.db.transaction(async (tx) => {
        // A single conditional UPDATE is what makes the code single-use even
        // when two requests race with it.
        const [claimed] = await tx
          .update(pairingCodes)
          .set({ redeemedAt: sql`now()` })
          .where(
            and(
              eq(pairingCodes.codeHash, hashPairingCode(code)),
              isNull(pairingCodes.redeemedAt),
              gt(pairingCodes.expiresAt, sql`now()`),
            ),
          )
          .returning({
            id: pairingCodes.id,
            userId: pairingCodes.userId,
            gatewayName: pairingCodes.gatewayName,
          });
        if (!claimed) throw new BadRequestException(INVALID_CODE);

        await tx.insert(gateways).values({
          id: gatewayId,
          userId: claimed.userId,
          name: claimed.gatewayName,
        });
        await tx
          .update(pairingCodes)
          .set({ gatewayId })
          .where(eq(pairingCodes.id, claimed.id));

        await this.dynsec.provisionGateway(gatewayId, password);
        provisioned = true;
      });
    } catch (error) {
      // The broker client outlives a rolled-back transaction, so remove it.
      if (provisioned) {
        await this.dynsec.removeGateway(gatewayId).catch(() => undefined);
      }
      throw error;
    }

    return {
      gatewayId,
      mqtt: {
        url: this.config.mqttPublicUrl,
        username: gatewayId,
        password,
      },
      topics: {
        telemetry: topics.telemetry(gatewayId, '{sensorKey}'),
        status: topics.status(gatewayId),
      },
    };
  }
}
