import { randomUUID } from 'node:crypto';
import { eq, gateways, planters, readings } from '@org/db';
import { topics } from '@org/shared';
import {
  createTestApp,
  insertGateway,
  signUp,
  type TestApp,
} from '../test/harness';

describe('ingest', () => {
  let t: TestApp;
  let gatewayId: string;
  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(() => t.close());
  beforeEach(async () => {
    const { id } = await signUp(t);
    gatewayId = await insertGateway(t, id);
  });

  const send = (
    body: unknown,
    {
      topic = topics.telemetry(gatewayId, 'balcony-1'),
      at = new Date(),
    }: { topic?: string; at?: Date } = {},
  ) =>
    t.ingest.handleMessage(
      topic,
      Buffer.from(typeof body === 'string' ? body : JSON.stringify(body)),
      at,
    );
  const planterRows = () =>
    t.db.select().from(planters).where(eq(planters.gatewayId, gatewayId));
  const readingRows = async () => {
    const [planter] = await planterRows();
    return planter
      ? t.db.select().from(readings).where(eq(readings.planterId, planter.id))
      : [];
  };

  it('stores one reading per metric under the metric ids', async () => {
    const at = new Date('2026-05-01T10:00:00Z');
    const outcome = await send(
      { airTemperature: 21.4, airHumidity: 48.5, soilHumidity: 37 },
      { at },
    );
    expect(outcome).toBe('stored');

    const rows = await readingRows();
    expect(
      rows.map((r) => [r.metric, r.value, r.time.toISOString()]).sort(),
    ).toEqual([
      ['airHumidity', 48.5, at.toISOString()],
      ['airTemperature', 21.4, at.toISOString()],
      ['soilHumidity', 37, at.toISOString()],
    ]);
  });

  it('creates the planter on first sight, named after its sensor key', async () => {
    await send({ airTemperature: 20 });
    const rows = await planterRows();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      sensorKey: 'balcony-1',
      name: 'balcony-1',
    });
  });

  it('reuses the planter for later messages, and keeps a name the user chose', async () => {
    await send({ airTemperature: 20 });
    const [planter] = await planterRows();
    await t.db
      .update(planters)
      .set({ name: 'Balkon levý' })
      .where(eq(planters.id, planter.id));

    await send({ airTemperature: 21 }, { at: new Date(Date.now() + 1000) });
    const rows = await planterRows();
    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe('Balkon levý');
  });

  it('keeps nodes behind one gateway apart', async () => {
    await send(
      { airTemperature: 1 },
      { topic: topics.telemetry(gatewayId, 'a') },
    );
    await send(
      { airTemperature: 2 },
      { topic: topics.telemetry(gatewayId, 'b') },
    );
    expect((await planterRows()).map((p) => p.sensorKey).sort()).toEqual([
      'a',
      'b',
    ]);
  });

  it('is idempotent for a redelivered message', async () => {
    const at = new Date('2026-05-01T10:00:00Z');
    await send({ airTemperature: 21.4 }, { at });
    await send({ airTemperature: 21.4 }, { at });
    expect(await readingRows()).toHaveLength(1);
  });

  it("uses the payload's own timestamp when it has one", async () => {
    const receivedAt = new Date('2026-05-01T10:00:00Z');
    await send(
      { ts: '2026-05-01T09:00:00+00:00', airTemperature: 20 },
      { at: receivedAt },
    );
    const [row] = await readingRows();
    expect(row.time.toISOString()).toBe('2026-05-01T09:00:00.000Z');
  });

  it('records when the gateway was last heard from', async () => {
    const at = new Date('2026-05-01T10:00:00Z');
    await send({ airTemperature: 20 }, { at });
    const [gateway] = await t.db
      .select()
      .from(gateways)
      .where(eq(gateways.id, gatewayId));
    expect(gateway.lastSeenAt?.toISOString()).toBe(at.toISOString());
  });

  it('recovers when a planter was deleted while its id was cached', async () => {
    await send({ airTemperature: 20 });
    const [planter] = await planterRows();
    await t.db.delete(planters).where(eq(planters.id, planter.id));

    const outcome = await send(
      { airTemperature: 21 },
      { at: new Date(Date.now() + 1000) },
    );
    expect(outcome).toBe('stored');
    const rows = await planterRows();
    expect(rows).toHaveLength(1);
    expect(rows[0].id).not.toBe(planter.id);
    expect(await readingRows()).toHaveLength(1);
  });

  describe('drops what it should not store', () => {
    const expectNothingStored = async () => {
      expect(await planterRows()).toHaveLength(0);
    };

    it('topics that are not telemetry', async () => {
      expect(
        await send({ airTemperature: 1 }, { topic: 'planters/x/telemetry' }),
      ).toBe('bad-topic');
      expect(
        await send({ airTemperature: 1 }, { topic: topics.status(gatewayId) }),
      ).toBe('bad-topic');
      expect(
        await send(
          { airTemperature: 1 },
          { topic: `gateways/not-a-uuid/planters/a/telemetry` },
        ),
      ).toBe('bad-topic');
      expect(
        await send(
          { airTemperature: 1 },
          { topic: `gateways/${gatewayId}/planters/UPPER/telemetry` },
        ),
      ).toBe('bad-topic');
      await expectNothingStored();
    });

    it('bodies that are not JSON', async () => {
      expect(await send('not json')).toBe('bad-json');
      expect(await send('')).toBe('bad-json');
      await expectNothingStored();
    });

    it('bodies that break the contract', async () => {
      expect(await send({})).toBe('invalid-payload');
      expect(await send({ temp: 20 })).toBe('invalid-payload');
      expect(await send({ airTemperature: '20' })).toBe('invalid-payload');
      expect(await send({ airHumidity: 101 })).toBe('invalid-payload');
      expect(await send({ soilHumidity: 40.5 })).toBe('invalid-payload');
      expect(await send([1, 2, 3])).toBe('invalid-payload');
      expect(await send('null')).toBe('invalid-payload');
      await expectNothingStored();
    });

    it('oversized bodies', async () => {
      const body = JSON.stringify({ airTemperature: 1, pad: 'x'.repeat(5000) });
      expect(await send(body)).toBe('invalid-payload');
      await expectNothingStored();
    });

    it('timestamps far in the past or future', async () => {
      const now = new Date('2026-05-01T10:00:00Z');
      expect(
        await send(
          { ts: '2020-01-01T00:00:00Z', airTemperature: 1 },
          { at: now },
        ),
      ).toBe('bad-timestamp');
      expect(
        await send(
          { ts: '2026-05-03T00:00:00Z', airTemperature: 1 },
          { at: now },
        ),
      ).toBe('bad-timestamp');
      await expectNothingStored();
    });

    it('accepts a timestamp just inside the window', async () => {
      const now = new Date('2026-05-01T10:00:00Z');
      expect(
        await send(
          { ts: '2026-04-30T11:00:00Z', airTemperature: 1 },
          { at: now },
        ),
      ).toBe('stored');
    });

    it('messages for a gateway that does not exist', async () => {
      const ghost = randomUUID();
      const outcome = await send(
        { airTemperature: 1 },
        { topic: topics.telemetry(ghost, 'balcony-1') },
      );
      expect(outcome).toBe('unknown-gateway');
      const created = await t.db
        .select()
        .from(planters)
        .where(eq(planters.gatewayId, ghost));
      expect(created).toHaveLength(0);
    });
  });
});
