import { z } from 'zod';
import { METRICS, type Metric } from './metrics.js';

/** Request and response contracts of the REST API, shared with the web app. */

// ---- auth ----------------------------------------------------------------

export const EmailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .max(254)
  .pipe(z.email());

export const RegisterRequestSchema = z.object({
  email: EmailSchema,
  /** Upper bound keeps the password hash from being a CPU/memory lever. */
  password: z.string().min(8).max(128),
});
export type RegisterRequest = z.infer<typeof RegisterRequestSchema>;

export const LoginRequestSchema = z.object({
  email: EmailSchema,
  password: z.string().min(1).max(128),
});
export type LoginRequest = z.infer<typeof LoginRequestSchema>;

export interface UserDto {
  id: string;
  email: string;
}

// ---- gateways, planters, plants -----------------------------------------

export interface GatewayDto {
  id: string;
  name: string;
  lastSeenAt: string | null;
  createdAt: string;
  planterCount: number;
}

export interface LatestReadingDto {
  value: number;
  time: string;
}

export interface PlanterDto {
  id: string;
  gatewayId: string;
  gatewayName: string;
  name: string;
  sensorKey: string;
  createdAt: string;
  /** Most recent value per metric; a metric is missing until it was first reported. */
  latest: Partial<Record<Metric, LatestReadingDto>>;
}

export const UpdatePlanterRequestSchema = z.object({
  name: z.string().trim().min(1).max(80),
});
export type UpdatePlanterRequest = z.infer<typeof UpdatePlanterRequestSchema>;

export const PLANT_LIFECYCLES = ['annual', 'biennial', 'perennial'] as const;
export type PlantLifecycle = (typeof PLANT_LIFECYCLES)[number];

export const CreatePlantRequestSchema = z.object({
  species: z.string().trim().min(1).max(120),
  lifecycle: z.enum(PLANT_LIFECYCLES),
  /** Calendar date, `YYYY-MM-DD`. */
  plantedAt: z.iso.date().nullable().optional(),
});
export type CreatePlantRequest = z.infer<typeof CreatePlantRequestSchema>;

export const UpdatePlantRequestSchema = CreatePlantRequestSchema.partial();
export type UpdatePlantRequest = z.infer<typeof UpdatePlantRequestSchema>;

export interface PlantDto {
  id: string;
  planterId: string;
  species: string;
  lifecycle: PlantLifecycle;
  plantedAt: string | null;
  createdAt: string;
}

// ---- readings ------------------------------------------------------------

export const READING_BUCKETS = ['raw', 'hour', 'day'] as const;
export type ReadingBucket = (typeof READING_BUCKETS)[number];

const IsoInstantSchema = z.iso.datetime({ offset: true });

export const ReadingsQuerySchema = z
  .object({
    metric: z.enum(METRICS),
    /** Defaults to 24 hours before `to`. */
    from: IsoInstantSchema.optional(),
    /** Defaults to now. */
    to: IsoInstantSchema.optional(),
    /** Defaults to a resolution that keeps the response small for the range. */
    bucket: z.enum(READING_BUCKETS).optional(),
  })
  .refine((q) => !q.from || !q.to || Date.parse(q.from) < Date.parse(q.to), {
    message: '`from` must be earlier than `to`',
    path: ['from'],
  });
export type ReadingsQuery = z.infer<typeof ReadingsQuerySchema>;

/** A raw reading has `min === max === avg` and `samples === 1`. */
export interface ReadingPointDto {
  time: string;
  avg: number;
  min: number;
  max: number;
  samples: number;
}

export interface ReadingsResponse {
  metric: Metric;
  bucket: ReadingBucket;
  from: string;
  to: string;
  points: ReadingPointDto[];
}

/** Picks the coarsest bucket that still gives a useful number of points. */
export function defaultBucket(from: Date, to: Date): ReadingBucket {
  const hours = (to.getTime() - from.getTime()) / 3_600_000;
  if (hours <= 6) return 'raw';
  if (hours <= 14 * 24) return 'hour';
  return 'day';
}

export interface PlanterDetailDto extends PlanterDto {
  plants: PlantDto[];
}
