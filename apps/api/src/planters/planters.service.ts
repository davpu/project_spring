import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { gateways, plants, planters, type Database } from '@org/db';
import {
  METRICS,
  defaultBucket,
  type CreatePlantRequest,
  type Metric,
  type PlanterDetailDto,
  type PlanterDto,
  type PlantDto,
  type ReadingPointDto,
  type ReadingsQuery,
  type ReadingsResponse,
  type UpdatePlantRequest,
  type UpdatePlanterRequest,
} from '@org/shared';
import { and, asc, eq, sql } from '@org/db';
import { DB } from '../db/db.module';

/** A raw response past this is a mistake in the query, not something to chart. */
const MAX_RAW_POINTS = 10_000;
const MAX_HOURLY_RANGE_DAYS = 92;
const DAY_MS = 24 * 3_600_000;

type PlanterRow = Omit<PlanterDto, 'latest' | 'createdAt'> & {
  createdAt: Date;
};
type PlantRow = typeof plants.$inferSelect;

const toPlantDto = (row: PlantRow): PlantDto => ({
  id: row.id,
  planterId: row.planterId,
  species: row.species,
  lifecycle: row.lifecycle,
  plantedAt: row.plantedAt,
  createdAt: row.createdAt.toISOString(),
});

@Injectable()
export class PlantersService {
  constructor(@Inject(DB) private readonly db: Database) {}

  // ---- planters ----------------------------------------------------------

  async list(userId: string): Promise<PlanterDto[]> {
    const rows = await this.planterQuery().where(eq(gateways.userId, userId));
    return this.withLatest(rows);
  }

  async get(userId: string, id: string): Promise<PlanterDetailDto> {
    const [planter] = await this.withLatest([
      await this.requirePlanter(userId, id),
    ]);
    const plantRows = await this.db
      .select()
      .from(plants)
      .where(eq(plants.planterId, id))
      .orderBy(asc(plants.createdAt));
    return { ...planter, plants: plantRows.map(toPlantDto) };
  }

  async rename(
    userId: string,
    id: string,
    { name }: UpdatePlanterRequest,
  ): Promise<PlanterDto> {
    await this.requirePlanter(userId, id);
    await this.db.update(planters).set({ name }).where(eq(planters.id, id));
    const [planter] = await this.withLatest([
      await this.requirePlanter(userId, id),
    ]);
    return planter;
  }

  /**
   * Deletes a planter with its plants and readings. A node that keeps
   * publishing under the same sensor key simply creates a fresh planter.
   */
  async remove(userId: string, id: string): Promise<void> {
    await this.requirePlanter(userId, id);
    await this.db.delete(planters).where(eq(planters.id, id));
  }

  // ---- plants ------------------------------------------------------------

  async createPlant(
    userId: string,
    planterId: string,
    body: CreatePlantRequest,
  ): Promise<PlantDto> {
    await this.requirePlanter(userId, planterId);
    const [row] = await this.db
      .insert(plants)
      .values({
        planterId,
        species: body.species,
        lifecycle: body.lifecycle,
        plantedAt: body.plantedAt ?? null,
      })
      .returning();
    return toPlantDto(row);
  }

  async updatePlant(
    userId: string,
    plantId: string,
    patch: UpdatePlantRequest,
  ): Promise<PlantDto> {
    const current = await this.requirePlant(userId, plantId);
    const changes = Object.fromEntries(
      Object.entries(patch).filter(([, value]) => value !== undefined),
    );
    // Drizzle rejects an empty SET, and an empty patch is a legitimate no-op.
    if (Object.keys(changes).length === 0) return toPlantDto(current);
    const [row] = await this.db
      .update(plants)
      .set(changes)
      .where(eq(plants.id, plantId))
      .returning();
    return toPlantDto(row);
  }

  async removePlant(userId: string, plantId: string): Promise<void> {
    await this.requirePlant(userId, plantId);
    await this.db.delete(plants).where(eq(plants.id, plantId));
  }

  // ---- readings ----------------------------------------------------------

  async readings(
    userId: string,
    planterId: string,
    query: ReadingsQuery,
  ): Promise<ReadingsResponse> {
    await this.requirePlanter(userId, planterId);

    const to = query.to ? new Date(query.to) : new Date();
    const from = query.from
      ? new Date(query.from)
      : new Date(to.getTime() - DAY_MS);
    if (from >= to) {
      throw new BadRequestException('`from` must be earlier than `to`');
    }
    const bucket = query.bucket ?? defaultBucket(from, to);
    if (
      bucket === 'hour' &&
      to.getTime() - from.getTime() > MAX_HOURLY_RANGE_DAYS * DAY_MS
    ) {
      throw new BadRequestException(
        `Hourly data is limited to ${MAX_HOURLY_RANGE_DAYS} days; use bucket=day`,
      );
    }

    const points = await this.queryPoints(
      planterId,
      query.metric,
      bucket,
      from,
      to,
    );
    return {
      metric: query.metric,
      bucket,
      from: from.toISOString(),
      to: to.toISOString(),
      points,
    };
  }

  private async queryPoints(
    planterId: string,
    metric: Metric,
    bucket: 'raw' | 'hour' | 'day',
    from: Date,
    to: Date,
  ): Promise<ReadingPointDto[]> {
    const range = { from: from.toISOString(), to: to.toISOString() };
    type Row = {
      time: Date;
      avg: number;
      min: number;
      max: number;
      samples: number;
    };

    if (bucket === 'raw') {
      const { rows } = await this.db.execute<Row>(sql`
        select "time", value as avg, value as min, value as max, 1 as samples
        from readings
        where planter_id = ${planterId} and metric = ${metric}
          and "time" >= ${range.from}::timestamptz and "time" < ${range.to}::timestamptz
        order by "time"
        limit ${MAX_RAW_POINTS + 1}`);
      if (rows.length > MAX_RAW_POINTS) {
        throw new BadRequestException(
          'Range is too large for raw data; use bucket=hour or bucket=day',
        );
      }
      return rows.map(toPoint);
    }

    // Both rollups read the hourly continuous aggregate, which includes the
    // not-yet-materialized tail (real-time aggregation).
    const { rows } =
      bucket === 'hour'
        ? await this.db.execute<Row>(sql`
            select bucket as "time", avg, min, max, samples::int as samples
            from readings_hourly
            where planter_id = ${planterId} and metric = ${metric}
              and bucket >= time_bucket(interval '1 hour', ${range.from}::timestamptz)
              and bucket < ${range.to}::timestamptz
            order by bucket`)
        : await this.db.execute<Row>(sql`
            select time_bucket(interval '1 day', bucket) as "time",
                   sum(avg * samples) / sum(samples) as avg,
                   min(min) as min, max(max) as max, sum(samples)::int as samples
            from readings_hourly
            where planter_id = ${planterId} and metric = ${metric}
              and bucket >= time_bucket(interval '1 day', ${range.from}::timestamptz)
              and bucket < ${range.to}::timestamptz
            group by 1
            order by 1`);
    return rows.map(toPoint);
  }

  // ---- helpers -----------------------------------------------------------

  private planterQuery() {
    return this.db
      .select({
        id: planters.id,
        gatewayId: planters.gatewayId,
        gatewayName: gateways.name,
        name: planters.name,
        sensorKey: planters.sensorKey,
        createdAt: planters.createdAt,
      })
      .from(planters)
      .innerJoin(gateways, eq(planters.gatewayId, gateways.id));
  }

  /** 404 for both "missing" and "someone else's", so ids cannot be probed. */
  private async requirePlanter(
    userId: string,
    id: string,
  ): Promise<PlanterRow> {
    const [row] = await this.planterQuery().where(
      and(eq(planters.id, id), eq(gateways.userId, userId)),
    );
    if (!row) throw new NotFoundException();
    return row;
  }

  private async requirePlant(userId: string, id: string): Promise<PlantRow> {
    const [row] = await this.db
      .select({ plant: plants })
      .from(plants)
      .innerJoin(planters, eq(plants.planterId, planters.id))
      .innerJoin(gateways, eq(planters.gatewayId, gateways.id))
      .where(and(eq(plants.id, id), eq(gateways.userId, userId)));
    if (!row) throw new NotFoundException();
    return row.plant;
  }

  /**
   * Attaches the newest value of each metric. One index-backed lookup per
   * planter and metric (LATERAL ... LIMIT 1) rather than scanning the whole
   * time series with DISTINCT ON.
   */
  private async withLatest(rows: PlanterRow[]): Promise<PlanterDto[]> {
    const latest = new Map<string, PlanterDto['latest']>();
    if (rows.length > 0) {
      const ids = sql.join(
        rows.map((r) => sql`${r.id}::uuid`),
        sql`, `,
      );
      const metrics = sql.join(
        METRICS.map((m) => sql`${m}`),
        sql`, `,
      );
      const { rows: found } = await this.db.execute<{
        planter_id: string;
        metric: Metric;
        value: number;
        time: Date;
      }>(sql`
        select p.id as planter_id, m.metric, r.value, r."time"
        from unnest(array[${ids}]) as p(id)
        cross join unnest(array[${metrics}]::text[]) as m(metric)
        cross join lateral (
          select value, "time" from readings
          where planter_id = p.id and metric = m.metric
          order by "time" desc limit 1
        ) r`);
      for (const row of found) {
        const entry = latest.get(row.planter_id) ?? {};
        entry[row.metric] = {
          value: Number(row.value),
          time: new Date(row.time).toISOString(),
        };
        latest.set(row.planter_id, entry);
      }
    }
    return rows.map((row) => ({
      ...row,
      createdAt: row.createdAt.toISOString(),
      latest: latest.get(row.id) ?? {},
    }));
  }
}

function toPoint(row: {
  time: Date;
  avg: number;
  min: number;
  max: number;
  samples: number;
}): ReadingPointDto {
  return {
    time: new Date(row.time).toISOString(),
    avg: Number(row.avg),
    min: Number(row.min),
    max: Number(row.max),
    samples: Number(row.samples),
  };
}
