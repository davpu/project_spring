import {
  PASSWORD,
  createTestApp,
  signUp,
  uniqueEmail,
  type TestApp,
} from '../test/harness';

describe('auth', () => {
  let t: TestApp;
  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(() => t.close());

  it('registers, starts a session and identifies the user', async () => {
    const { agent, id, email } = await signUp(t);
    const me = await agent.get('/api/auth/me').expect(200);
    expect(me.body).toEqual({ id, email });
  });

  it('sets a session cookie that scripts cannot read and cross-site posts do not carry', async () => {
    const res = await t
      .anonymous()
      .post('/api/auth/register')
      .send({ email: uniqueEmail(), password: PASSWORD })
      .expect(201);
    const cookie = (res.headers['set-cookie'] as unknown as string[])[0];
    expect(cookie).toMatch(/^session=/);
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Lax/i);
  });

  it('never returns or stores the password in the response', async () => {
    const res = await t
      .anonymous()
      .post('/api/auth/register')
      .send({ email: uniqueEmail(), password: PASSWORD })
      .expect(201);
    expect(JSON.stringify(res.body)).not.toContain(PASSWORD);
    expect(Object.keys(res.body).sort()).toEqual(['email', 'id']);
  });

  it('treats emails case-insensitively', async () => {
    const email = uniqueEmail();
    await t
      .anonymous()
      .post('/api/auth/register')
      .send({ email, password: PASSWORD })
      .expect(201);
    await t
      .anonymous()
      .post('/api/auth/register')
      .send({ email: email.toUpperCase(), password: PASSWORD })
      .expect(409);
    await t
      .anonymous()
      .post('/api/auth/login')
      .send({ email: ` ${email.toUpperCase()} `, password: PASSWORD })
      .expect(200);
  });

  it('rejects invalid registrations', async () => {
    const post = (body: object) =>
      t.anonymous().post('/api/auth/register').send(body);
    await post({ email: 'not-an-email', password: PASSWORD }).expect(400);
    await post({ email: uniqueEmail(), password: 'short' }).expect(400);
    await post({ email: uniqueEmail(), password: 'x'.repeat(129) }).expect(400);
    await post({ email: uniqueEmail() }).expect(400);
  });

  it('answers a wrong password and an unknown email identically', async () => {
    const { email } = await signUp(t);
    const wrongPassword = await t
      .anonymous()
      .post('/api/auth/login')
      .send({ email, password: 'wrong-password' })
      .expect(401);
    const unknownEmail = await t
      .anonymous()
      .post('/api/auth/login')
      .send({ email: uniqueEmail(), password: 'wrong-password' })
      .expect(401);
    expect(wrongPassword.body).toEqual(unknownEmail.body);
  });

  it('logs in with the right password', async () => {
    const { email, id } = await signUp(t);
    const agent = t.agent();
    const res = await agent
      .post('/api/auth/login')
      .send({ email, password: PASSWORD })
      .expect(200);
    expect(res.body).toEqual({ id, email });
    await agent.get('/api/auth/me').expect(200);
  });

  it('logs out', async () => {
    const { agent } = await signUp(t);
    await agent.post('/api/auth/logout').expect(204);
    await agent.get('/api/auth/me').expect(401);
  });

  it('rejects requests without a valid session', async () => {
    await t.anonymous().get('/api/auth/me').expect(401);
    await t
      .anonymous()
      .get('/api/auth/me')
      .set('Cookie', 'session=not.a.jwt')
      .expect(401);
    await t.anonymous().get('/api/planters').expect(401);
    await t.anonymous().get('/api/gateways').expect(401);
  });

  it('rejects a session signed with another secret', async () => {
    const { JwtService } = await import('@nestjs/jwt');
    const forged = await new JwtService({
      secret: 'some-other-secret-some-other-secret-00',
    }).signAsync({ sub: '00000000-0000-4000-8000-000000000000' });
    await t
      .anonymous()
      .get('/api/auth/me')
      .set('Cookie', `session=${forged}`)
      .expect(401);
  });
});
