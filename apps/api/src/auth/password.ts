import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';

/**
 * scrypt from node:crypto, so there is no native dependency to build.
 * Stored as `scrypt$N$r$p$salt$hash`, which keeps old hashes verifiable if the
 * cost parameters are raised later.
 */
const N = 2 ** 15;
const R = 8;
const P = 1;
const KEY_LENGTH = 64;
/** scrypt needs about 128 * N * r bytes; allow headroom above that. */
const MAX_MEMORY = 128 * N * R * 2;

function derive(
  password: string,
  salt: Buffer,
  n: number,
  r: number,
  p: number,
  length: number,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(
      password.normalize('NFKC'),
      salt,
      length,
      { N: n, r, p, maxmem: Math.max(MAX_MEMORY, 128 * n * r * 2) },
      (err, key) => (err ? reject(err) : resolve(key)),
    );
  });
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await derive(password, salt, N, R, P, KEY_LENGTH);
  return [
    'scrypt',
    N,
    R,
    P,
    salt.toString('base64'),
    key.toString('base64'),
  ].join('$');
}

export async function verifyPassword(
  password: string,
  stored: string,
): Promise<boolean> {
  const [scheme, n, r, p, salt, hash] = stored.split('$');
  if (scheme !== 'scrypt' || !n || !r || !p || !salt || !hash) return false;
  const expected = Buffer.from(hash, 'base64');
  const actual = await derive(
    password,
    Buffer.from(salt, 'base64'),
    Number(n),
    Number(r),
    Number(p),
    expected.length,
  );
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

let dummyHash: Promise<string> | undefined;

/**
 * Verifies against a throwaway hash so that logging in with an unknown email
 * costs the same as a wrong password and does not reveal which accounts exist.
 */
export async function verifyAgainstDummy(password: string): Promise<false> {
  dummyHash ??= hashPassword(randomBytes(16).toString('hex'));
  await verifyPassword(password, await dummyHash);
  return false;
}
