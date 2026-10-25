import { BadGatewayException } from '@nestjs/common';
import { gateways, pairingCodes, eq, sql } from '@org/db';
import {
  PAIRING_CODE_ALPHABET,
  PAIRING_CODE_LENGTH,
  PAIRING_CODE_TTL_MINUTES,
  normalizePairingCode,
} from '@org/shared';
import {
  createTestApp,
  signUp,
  type Agent,
  type TestApp,
} from '../test/harness';
import { generatePairingCode, hashPairingCode } from './pairing-code';

describe('pairing code generation', () => {
  it('uses only the unambiguous alphabet and the fixed length', () => {
    for (let i = 0; i < 500; i++) {
      const code = generatePairingCode();
      expect(code).toHaveLength(PAIRING_CODE_LENGTH);
      for (const char of code) expect(PAIRING_CODE_ALPHABET).toContain(char);
    }
  });

  it('does not repeat', () => {
    const codes = new Set(
      Array.from({ length: 1000 }, () => generatePairingCode()),
    );
    expect(codes.size).toBe(1000);
  });

  it('hashes the normalized code, so formatting does not matter', () => {
    expect(hashPairingCode('abcd-2345')).toBe(hashPairingCode('ABCD2345'));
    expect(hashPairingCode(' ABCD 2345 ')).toBe(hashPairingCode('ABCD2345'));
    expect(hashPairingCode('ABCD2345')).not.toBe(hashPairingCode('ABCD2346'));
    expect(hashPairingCode('ABCD2345')).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('pairing', () => {
  let t: TestApp;
  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(() => t.close());
  beforeEach(() => {
    t.dynsec.provisionGateway.mockClear();
    t.dynsec.removeGateway.mockClear();
    t.dynsec.provisionGateway.mockResolvedValue(undefined);
  });

  const createCode = async (agent: Agent, gatewayName = 'Balkon') => {
    const res = await agent
      .post('/api/pairing-codes')
      .send({ gatewayName })
      .expect(201);
    return res.body as { id: string; code: string; expiresAt: string };
  };
  const redeem = (code: string) =>
    t.anonymous().post('/api/pair').send({ code });

  it('requires a session to create a code, but not to redeem one', async () => {
    await t
      .anonymous()
      .post('/api/pairing-codes')
      .send({ gatewayName: 'x' })
      .expect(401);
    await redeem('ABCD2345').expect(400);
  });

  it('creates a displayable code that expires after the TTL', async () => {
    const { agent } = await signUp(t);
    const before = Date.now();
    const { code, expiresAt } = await createCode(agent);
    expect(code).toMatch(
      new RegExp(
        `^[${PAIRING_CODE_ALPHABET}]{4}-[${PAIRING_CODE_ALPHABET}]{4}$`,
      ),
    );
    const ttlMs = Date.parse(expiresAt) - before;
    expect(ttlMs).toBeGreaterThan((PAIRING_CODE_TTL_MINUTES - 1) * 60_000);
    expect(ttlMs).toBeLessThanOrEqual(PAIRING_CODE_TTL_MINUTES * 60_000 + 5000);
  });

  it('stores only a hash of the code', async () => {
    const { agent } = await signUp(t);
    const { id, code } = await createCode(agent);
    const [row] = await t.db
      .select()
      .from(pairingCodes)
      .where(eq(pairingCodes.id, id));
    expect(row.codeHash).toBe(hashPairingCode(code));
    expect(JSON.stringify(row)).not.toContain(normalizePairingCode(code));
  });

  it('validates the request', async () => {
    const { agent } = await signUp(t);
    await agent.post('/api/pairing-codes').send({}).expect(400);
    await agent
      .post('/api/pairing-codes')
      .send({ gatewayName: '  ' })
      .expect(400);
    await agent
      .post('/api/pairing-codes')
      .send({ gatewayName: 'x'.repeat(81) })
      .expect(400);
    await redeem('short').expect(400);
    await redeem('ABCD0OIL').expect(400);
  });

  it('redeems a code into a gateway owned by the user, with broker credentials', async () => {
    const { agent, id: userId } = await signUp(t);
    const { id: codeId, code } = await createCode(agent, 'Balkon');

    const res = await redeem(code).expect(200);
    const { gatewayId, mqtt, topics } = res.body;

    expect(mqtt.username).toBe(gatewayId);
    expect(mqtt.password).toHaveLength(32);
    expect(mqtt.url).toMatch(/^mqtt:/);
    expect(topics.telemetry).toBe(
      `gateways/${gatewayId}/planters/{sensorKey}/telemetry`,
    );
    expect(topics.status).toBe(`gateways/${gatewayId}/status`);

    // The same password that was handed out is the one set on the broker.
    expect(t.dynsec.provisionGateway).toHaveBeenCalledWith(
      gatewayId,
      mqtt.password,
    );

    const [gateway] = await t.db
      .select()
      .from(gateways)
      .where(eq(gateways.id, gatewayId));
    expect(gateway).toMatchObject({ userId, name: 'Balkon' });

    const status = await agent.get(`/api/pairing-codes/${codeId}`).expect(200);
    expect(status.body).toEqual({ status: 'redeemed', gatewayId });
  });

  it('never stores the broker password', async () => {
    const { agent } = await signUp(t);
    const { code } = await createCode(agent);
    const res = await redeem(code).expect(200);
    const rows = await t.db
      .select()
      .from(gateways)
      .where(eq(gateways.id, res.body.gatewayId));
    expect(JSON.stringify(rows)).not.toContain(res.body.mqtt.password);
  });

  it('accepts the code however the user typed it', async () => {
    const { agent } = await signUp(t);
    const { code } = await createCode(agent);
    await redeem(` ${code.toLowerCase().replace('-', ' ')} `).expect(200);
  });

  it('is single-use', async () => {
    const { agent } = await signUp(t);
    const { code } = await createCode(agent);
    await redeem(code).expect(200);
    const second = await redeem(code).expect(400);
    expect(second.body.message).toBe('Invalid or expired pairing code');
    expect(t.dynsec.provisionGateway).toHaveBeenCalledTimes(1);
  });

  it('lets exactly one of several simultaneous redemptions win', async () => {
    const { agent } = await signUp(t);
    const { code } = await createCode(agent);
    const results = await Promise.all(
      Array.from({ length: 6 }, () => redeem(code)),
    );
    const statuses = results.map((r) => r.status).sort();
    expect(statuses).toEqual([200, 400, 400, 400, 400, 400]);
    expect(t.dynsec.provisionGateway).toHaveBeenCalledTimes(1);
  });

  it('reports an expired code, and refuses to redeem it', async () => {
    const { agent } = await signUp(t);
    const { id, code } = await createCode(agent);
    await t.db
      .update(pairingCodes)
      .set({ expiresAt: sql`now() - interval '1 second'` })
      .where(eq(pairingCodes.id, id));

    const status = await agent.get(`/api/pairing-codes/${id}`).expect(200);
    expect(status.body).toEqual({ status: 'expired' });
    const res = await redeem(code).expect(400);
    // Same message as for a code that never existed: no oracle.
    expect(res.body.message).toBe('Invalid or expired pairing code');
  });

  it('reports a pending code', async () => {
    const { agent } = await signUp(t);
    const { id } = await createCode(agent);
    const res = await agent.get(`/api/pairing-codes/${id}`).expect(200);
    expect(res.body).toEqual({ status: 'pending' });
  });

  it("hides one user's pairing codes from another", async () => {
    const owner = await signUp(t);
    const other = await signUp(t);
    const { id } = await createCode(owner.agent);
    await other.agent.get(`/api/pairing-codes/${id}`).expect(404);
    await owner.agent.get('/api/pairing-codes/not-a-uuid').expect(400);
  });

  it('leaves the code usable when the broker fails, so the gateway can retry', async () => {
    const { agent, id: userId } = await signUp(t);
    const { id, code } = await createCode(agent);
    t.dynsec.provisionGateway.mockRejectedValueOnce(
      new BadGatewayException('broker down'),
    );

    await redeem(code).expect(502);
    const [afterFailure] = await t.db
      .select()
      .from(pairingCodes)
      .where(eq(pairingCodes.id, id));
    expect(afterFailure.redeemedAt).toBeNull();
    expect(afterFailure.gatewayId).toBeNull();
    expect(
      await t.db.select().from(gateways).where(eq(gateways.userId, userId)),
    ).toHaveLength(0);

    await redeem(code).expect(200);
  });

  it('caps how many live codes one user can hold', async () => {
    const { agent } = await signUp(t);
    for (let i = 0; i < 5; i++) await createCode(agent);
    await agent
      .post('/api/pairing-codes')
      .send({ gatewayName: 'one too many' })
      .expect(429);
  });

  it('does not count redeemed codes against the cap', async () => {
    const { agent } = await signUp(t);
    for (let i = 0; i < 5; i++) {
      const { code } = await createCode(agent);
      await redeem(code).expect(200);
    }
    await createCode(agent);
  });
});
