import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { gateways, type Database } from '@org/db';
import type { GatewayDto } from '@org/shared';
import { and, desc, eq, sql } from '@org/db';
import { DB } from '../db/db.module';
import { DynsecService } from '../mqtt/dynsec.service';

@Injectable()
export class GatewaysService {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly dynsec: DynsecService,
  ) {}

  async list(userId: string): Promise<GatewayDto[]> {
    const rows = await this.db
      .select({
        id: gateways.id,
        name: gateways.name,
        lastSeenAt: gateways.lastSeenAt,
        createdAt: gateways.createdAt,
        planterCount: sql<number>`(
          select count(*)::int from planters p where p.gateway_id = gateways.id
        )`,
      })
      .from(gateways)
      .where(eq(gateways.userId, userId))
      .orderBy(desc(gateways.createdAt));
    return rows.map((row) => ({
      ...row,
      lastSeenAt: row.lastSeenAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
    }));
  }

  /**
   * Unpairs a gateway. The broker credentials are revoked first: if that fails
   * nothing is deleted and the call can be retried, whereas deleting the row
   * first could leave a working credential behind with no record of it.
   */
  async remove(userId: string, id: string): Promise<void> {
    const [owned] = await this.db
      .select({ id: gateways.id })
      .from(gateways)
      .where(and(eq(gateways.id, id), eq(gateways.userId, userId)));
    if (!owned) throw new NotFoundException();

    await this.dynsec.removeGateway(id);
    await this.db.delete(gateways).where(eq(gateways.id, id));
  }
}
