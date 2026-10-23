import { z } from 'zod';

/** No I, L, O, 0 or 1 so codes survive being read aloud or typed from a screen. */
export const PAIRING_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const PAIRING_CODE_LENGTH = 8;
export const PAIRING_CODE_TTL_MINUTES = 10;

/** Uppercases and drops separators/whitespace, so `abcd-2345` equals `ABCD2345`. */
export function normalizePairingCode(input: string): string {
  return input.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

/** `ABCD2345` -> `ABCD-2345` */
export function formatPairingCode(code: string): string {
  return `${code.slice(0, 4)}-${code.slice(4)}`;
}

const codePattern = new RegExp(
  `^[${PAIRING_CODE_ALPHABET}]{${PAIRING_CODE_LENGTH}}$`,
);

export const PairingCodeSchema = z
  .string()
  .transform(normalizePairingCode)
  .pipe(z.string().regex(codePattern, 'Invalid pairing code'));

/** Web app -> API: start pairing (authenticated user). */
export const CreatePairingCodeRequestSchema = z.object({
  gatewayName: z.string().trim().min(1).max(80),
});
export type CreatePairingCodeRequest = z.infer<
  typeof CreatePairingCodeRequestSchema
>;

export const CreatePairingCodeResponseSchema = z.object({
  id: z.uuid(),
  /** Display format, e.g. `ABCD-2345`. */
  code: z.string(),
  expiresAt: z.iso.datetime(),
});
export type CreatePairingCodeResponse = z.infer<
  typeof CreatePairingCodeResponseSchema
>;

/** Web app polls this until the gateway has redeemed the code. */
export const PairingStatusResponseSchema = z.object({
  status: z.enum(['pending', 'redeemed', 'expired']),
  gatewayId: z.uuid().optional(),
});
export type PairingStatusResponse = z.infer<typeof PairingStatusResponseSchema>;

/** Gateway -> API over HTTPS: redeem a code. */
export const PairRequestSchema = z.object({
  code: PairingCodeSchema,
});
export type PairRequest = z.infer<typeof PairRequestSchema>;

export const PairResponseSchema = z.object({
  gatewayId: z.uuid(),
  mqtt: z.object({
    url: z.string(),
    username: z.string(),
    password: z.string(),
  }),
  topics: z.object({
    /** Replace `{sensorKey}` with the planter's key. */
    telemetry: z.string(),
    status: z.string(),
  }),
});
export type PairResponse = z.infer<typeof PairResponseSchema>;
