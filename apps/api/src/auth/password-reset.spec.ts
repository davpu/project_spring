import { eq, passwordResets, sql, users } from '@org/db';
import {
  PASSWORD,
  createTestApp,
  signUp,
  uniqueEmail,
  type TestApp,
} from '../test/harness';
import { MAX_PENDING_RESETS, hashResetToken } from './password-reset.service';

const NEW_PASSWORD = 'Brand-new-password2';

describe('password reset', () => {
  let t: TestApp;
  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(() => t.close());
  beforeEach(() => {
    t.mail.send.mockClear();
    t.mail.send.mockResolvedValue(undefined);
  });

  const forgot = (email: string) =>
    t.anonymous().post('/api/auth/forgot-password').send({ email });
  const reset = (token: string, password = NEW_PASSWORD) =>
    t.anonymous().post('/api/auth/reset-password').send({ token, password });
  const login = (email: string, password: string) =>
    t.anonymous().post('/api/auth/login').send({ email, password });

  /** The token in the link of the most recent email. */
  const lastToken = () => {
    const [message] = t.mail.send.mock.calls.at(-1) as [{ text: string }];
    const match = /token=([A-Za-z0-9_-]+)/.exec(message.text);
    if (!match) throw new Error(`no link in: ${message.text}`);
    return match[1];
  };
  const requestLink = async (email: string) => {
    await forgot(email).expect(202);
    return lastToken();
  };

  describe('asking for a link', () => {
    it('emails a link to the address of the account', async () => {
      const { email } = await signUp(t);
      await forgot(email).expect(202);

      expect(t.mail.send).toHaveBeenCalledTimes(1);
      const [message] = t.mail.send.mock.calls[0] as [
        { to: string; subject: string; text: string },
      ];
      expect(message.to).toBe(email);
      expect(message.subject).toMatch(/reset/i);
      expect(message.text).toMatch(
        /http:\/\/localhost:4200\/reset-password\?token=[A-Za-z0-9_-]{43}/,
      );
    });

    it('answers an unknown address exactly like a known one, and sends nothing', async () => {
      const { email } = await signUp(t);
      const known = await forgot(email);
      t.mail.send.mockClear();
      const unknown = await forgot(uniqueEmail());

      expect(unknown.status).toBe(known.status);
      expect(unknown.body).toEqual(known.body);
      expect(t.mail.send).not.toHaveBeenCalled();
    });

    it('is not case sensitive about the address', async () => {
      const { email } = await signUp(t);
      await forgot(` ${email.toUpperCase()} `).expect(202);
      expect(t.mail.send).toHaveBeenCalledTimes(1);
    });

    it('rejects something that is not an email address', async () => {
      await forgot('not-an-email').expect(400);
      await t
        .anonymous()
        .post('/api/auth/forgot-password')
        .send({})
        .expect(400);
      expect(t.mail.send).not.toHaveBeenCalled();
    });

    it('stores only a hash of the token', async () => {
      const { email, id } = await signUp(t);
      const token = await requestLink(email);
      const rows = await t.db
        .select()
        .from(passwordResets)
        .where(eq(passwordResets.userId, id));
      expect(rows).toHaveLength(1);
      expect(rows[0].tokenHash).toBe(hashResetToken(token));
      expect(JSON.stringify(rows)).not.toContain(token);
    });

    it('limits how many live links one account can have', async () => {
      const { email } = await signUp(t);
      for (let i = 0; i < MAX_PENDING_RESETS + 2; i++) {
        await forgot(email).expect(202);
      }
      expect(t.mail.send).toHaveBeenCalledTimes(MAX_PENDING_RESETS);
    });

    it('answers the same when the mail server fails', async () => {
      const { email } = await signUp(t);
      t.mail.send.mockRejectedValueOnce(new Error('connection refused'));
      await forgot(email).expect(202);
    });
  });

  describe('using a link', () => {
    it('sets the new password and retires the old one', async () => {
      const { email } = await signUp(t);
      const token = await requestLink(email);

      await reset(token).expect(204);

      await login(email, NEW_PASSWORD).expect(200);
      await login(email, PASSWORD).expect(401);
    });

    it('does not sign anyone in by itself', async () => {
      const { email } = await signUp(t);
      const res = await reset(await requestLink(email)).expect(204);
      expect(res.headers['set-cookie']).toBeUndefined();
    });

    it('works once', async () => {
      const { email } = await signUp(t);
      const token = await requestLink(email);
      await reset(token).expect(204);

      const second = await reset(token, 'Another-password3').expect(400);
      expect(second.body.message).toBe('Invalid or expired reset link');
      await login(email, NEW_PASSWORD).expect(200);
    });

    it('lets exactly one of several simultaneous attempts win', async () => {
      const { email } = await signUp(t);
      const token = await requestLink(email);
      const results = await Promise.all(
        Array.from({ length: 5 }, (_, i) =>
          reset(token, `Password-number-${i}`),
        ),
      );
      expect(results.map((r) => r.status).sort()).toEqual([
        204, 400, 400, 400, 400,
      ]);
    });

    it('refuses an expired link and leaves the password alone', async () => {
      const { email, id } = await signUp(t);
      const token = await requestLink(email);
      await t.db
        .update(passwordResets)
        .set({ expiresAt: sql`now() - interval '1 second'` })
        .where(eq(passwordResets.userId, id));

      const res = await reset(token).expect(400);
      expect(res.body.message).toBe('Invalid or expired reset link');
      await login(email, PASSWORD).expect(200);
    });

    it('gives a token it never issued the same answer as an expired one', async () => {
      const res = await reset('x'.repeat(43)).expect(400);
      expect(res.body.message).toBe('Invalid or expired reset link');
    });

    it('holds the new password to the rules of the sign-up form, and keeps the link usable', async () => {
      const { email } = await signUp(t);
      const token = await requestLink(email);

      await reset(token, 'all-lowercase-1').expect(400);
      await reset(token, 'NoDigitsHere').expect(400);
      await reset(token, 'Sh0rt').expect(400);
      await t
        .anonymous()
        .post('/api/auth/reset-password')
        .send({ token })
        .expect(400);

      await reset(token).expect(204);
    });

    it('retires the other links of the account', async () => {
      const { email } = await signUp(t);
      const first = await requestLink(email);
      const second = await requestLink(email);

      await reset(first).expect(204);
      await reset(second).expect(400);
    });

    it("does not touch anyone else's account", async () => {
      const bystander = await signUp(t);
      const other = await signUp(t);

      await reset(await requestLink(other.email)).expect(204);

      await login(bystander.email, PASSWORD).expect(200);
    });

    it('is removed together with the account', async () => {
      const { email, id } = await signUp(t);
      await requestLink(email);
      await t.db.delete(users).where(eq(users.id, id));
      expect(
        await t.db
          .select()
          .from(passwordResets)
          .where(eq(passwordResets.userId, id)),
      ).toHaveLength(0);
    });
  });
});
