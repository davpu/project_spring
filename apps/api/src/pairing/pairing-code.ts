import { createHash, randomInt } from 'node:crypto';
import {
  PAIRING_CODE_ALPHABET,
  PAIRING_CODE_LENGTH,
  normalizePairingCode,
} from '@org/shared';

/** Uniformly random: `randomInt` avoids the modulo bias of `byte % alphabet.length`. */
export function generatePairingCode(): string {
  let code = '';
  for (let i = 0; i < PAIRING_CODE_LENGTH; i++) {
    code += PAIRING_CODE_ALPHABET[randomInt(PAIRING_CODE_ALPHABET.length)];
  }
  return code;
}

/**
 * Only this hash is stored. The code is short-lived, single-use and rate
 * limited, so an unsalted SHA-256 is enough; a leaked table holds nothing that
 * is still redeemable after ten minutes.
 */
export function hashPairingCode(code: string): string {
  return createHash('sha256').update(normalizePairingCode(code)).digest('hex');
}
