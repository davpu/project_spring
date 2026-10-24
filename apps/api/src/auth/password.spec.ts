import { hashPassword, verifyAgainstDummy, verifyPassword } from './password';

describe('password hashing', () => {
  it('verifies the right password and rejects others', async () => {
    const hash = await hashPassword('correct-horse-battery');
    expect(await verifyPassword('correct-horse-battery', hash)).toBe(true);
    expect(await verifyPassword('correct-horse-batterz', hash)).toBe(false);
    expect(await verifyPassword('', hash)).toBe(false);
  });

  it('salts: the same password hashes differently each time', async () => {
    const a = await hashPassword('same-password');
    const b = await hashPassword('same-password');
    expect(a).not.toBe(b);
  });

  it('records its parameters so they can be raised later', async () => {
    const [scheme, n, r, p] = (await hashPassword('x')).split('$');
    expect([scheme, Number(n), Number(r), Number(p)]).toEqual([
      'scrypt',
      32768,
      8,
      1,
    ]);
  });

  it('treats canonically equivalent unicode as the same password', async () => {
    const hash = await hashPassword('café-password'); // é as one code point
    expect(await verifyPassword('café-password', hash)).toBe(true); // e + combining accent
  });

  it('rejects malformed stored hashes instead of throwing', async () => {
    expect(await verifyPassword('x', '')).toBe(false);
    expect(await verifyPassword('x', 'plaintext')).toBe(false);
    expect(await verifyPassword('x', 'bcrypt$1$2$3$4$5')).toBe(false);
  });

  it('the dummy check never succeeds', async () => {
    expect(await verifyAgainstDummy('anything')).toBe(false);
  });
});
