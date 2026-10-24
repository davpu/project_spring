import { eq, plants, planters, readings, sql } from '@org/db';
import {
  createTestApp,
  insertGateway,
  insertPlanter,
  insertReading,
  signUp,
  type Agent,
  type TestApp,
} from '../test/harness';

describe('planters, plants and readings', () => {
  let t: TestApp;
  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(() => t.close());

  /** A user with one gateway and one planter. */
  async function setup() {
    const user = await signUp(t);
    const gatewayId = await insertGateway(t, user.id, 'Balkon');
    const planterId = await insertPlanter(t, gatewayId);
    return { ...user, gatewayId, planterId };
  }

  describe('planters', () => {
    it('lists planters with the newest value of each metric', async () => {
      const { agent, planterId } = await setup();
      await insertReading(
        t,
        planterId,
        'airTemperature',
        '2026-05-01T10:00:00Z',
        20,
      );
      await insertReading(
        t,
        planterId,
        'airTemperature',
        '2026-05-01T11:00:00Z',
        22.5,
      );
      await insertReading(
        t,
        planterId,
        'soilHumidity',
        '2026-05-01T10:30:00Z',
        40,
      );

      const res = await agent.get('/api/planters').expect(200);
      expect(res.body).toHaveLength(1);
      expect(res.body[0]).toMatchObject({
        id: planterId,
        gatewayName: 'Balkon',
        sensorKey: 'balcony-1',
        latest: {
          airTemperature: { value: 22.5, time: '2026-05-01T11:00:00.000Z' },
          soilHumidity: { value: 40, time: '2026-05-01T10:30:00.000Z' },
        },
      });
      // A metric the planter never reported is absent, not zero.
      expect(res.body[0].latest).not.toHaveProperty('airHumidity');
    });

    it('lists an empty array for a user with nothing yet', async () => {
      const { agent } = await signUp(t);
      const res = await agent.get('/api/planters').expect(200);
      expect(res.body).toEqual([]);
    });

    it('does not mix up latest values between planters', async () => {
      const { agent, gatewayId, planterId } = await setup();
      const second = await insertPlanter(t, gatewayId, 'kitchen');
      await insertReading(
        t,
        planterId,
        'airTemperature',
        '2026-05-01T10:00:00Z',
        10,
      );
      await insertReading(
        t,
        second,
        'airTemperature',
        '2026-05-01T09:00:00Z',
        30,
      );

      const res = await agent.get('/api/planters').expect(200);
      const latest = Object.fromEntries(
        res.body.map(
          (p: {
            id: string;
            latest: { airTemperature: { value: number } };
          }) => [p.id, p.latest.airTemperature.value],
        ),
      );
      expect(latest).toEqual({ [planterId]: 10, [second]: 30 });
    });

    it('returns the detail with its plants', async () => {
      const { agent, planterId } = await setup();
      await agent
        .post(`/api/planters/${planterId}/plants`)
        .send({ species: 'Bazalka', lifecycle: 'annual' })
        .expect(201);
      const res = await agent.get(`/api/planters/${planterId}`).expect(200);
      expect(res.body.plants).toHaveLength(1);
      expect(res.body.plants[0]).toMatchObject({
        species: 'Bazalka',
        lifecycle: 'annual',
      });
    });

    it('renames, trimming and validating the name', async () => {
      const { agent, planterId } = await setup();
      const res = await agent
        .patch(`/api/planters/${planterId}`)
        .send({ name: '  Levý truhlík  ' })
        .expect(200);
      expect(res.body.name).toBe('Levý truhlík');
      await agent
        .patch(`/api/planters/${planterId}`)
        .send({ name: '   ' })
        .expect(400);
      await agent.patch(`/api/planters/${planterId}`).send({}).expect(400);
      await agent
        .patch(`/api/planters/${planterId}`)
        .send({ name: 'x'.repeat(81) })
        .expect(400);
    });

    it('deletes a planter with its plants and readings', async () => {
      const { agent, planterId } = await setup();
      await insertReading(
        t,
        planterId,
        'airTemperature',
        '2026-05-01T10:00:00Z',
        20,
      );
      await agent
        .post(`/api/planters/${planterId}/plants`)
        .send({ species: 'Máta', lifecycle: 'perennial' })
        .expect(201);

      await agent.delete(`/api/planters/${planterId}`).expect(204);

      await agent.get(`/api/planters/${planterId}`).expect(404);
      expect(
        await t.db
          .select()
          .from(readings)
          .where(eq(readings.planterId, planterId)),
      ).toHaveLength(0);
      expect(
        await t.db.select().from(plants).where(eq(plants.planterId, planterId)),
      ).toHaveLength(0);
    });
  });

  describe('plants', () => {
    it('creates, updates and deletes', async () => {
      const { agent, planterId } = await setup();
      const created = await agent
        .post(`/api/planters/${planterId}/plants`)
        .send({
          species: ' Bazalka ',
          lifecycle: 'annual',
          plantedAt: '2026-04-01',
        })
        .expect(201);
      expect(created.body).toMatchObject({
        planterId,
        species: 'Bazalka',
        lifecycle: 'annual',
        plantedAt: '2026-04-01',
      });

      const patched = await agent
        .patch(`/api/plants/${created.body.id}`)
        .send({ lifecycle: 'perennial', plantedAt: null })
        .expect(200);
      expect(patched.body).toMatchObject({
        species: 'Bazalka',
        lifecycle: 'perennial',
        plantedAt: null,
      });

      await agent.delete(`/api/plants/${created.body.id}`).expect(204);
      await agent.delete(`/api/plants/${created.body.id}`).expect(404);
    });

    it('treats an empty update as a no-op instead of failing', async () => {
      const { agent, planterId } = await setup();
      const { body } = await agent
        .post(`/api/planters/${planterId}/plants`)
        .send({ species: 'Máta', lifecycle: 'perennial' })
        .expect(201);
      const res = await agent
        .patch(`/api/plants/${body.id}`)
        .send({})
        .expect(200);
      expect(res.body).toEqual(body);
    });

    it('validates input', async () => {
      const { agent, planterId } = await setup();
      const post = (b: object) =>
        agent.post(`/api/planters/${planterId}/plants`).send(b);
      await post({ species: 'x', lifecycle: 'weekly' }).expect(400);
      await post({ lifecycle: 'annual' }).expect(400);
      await post({ species: '', lifecycle: 'annual' }).expect(400);
      await post({
        species: 'x',
        lifecycle: 'annual',
        plantedAt: '1.4.2026',
      }).expect(400);
    });
  });

  describe('readings', () => {
    const base = '/api/planters';
    const day = { from: '2026-05-01T00:00:00Z', to: '2026-05-02T00:00:00Z' };

    async function withTemperatures() {
      const ctx = await setup();
      // Two readings in the 10:00 hour, one in the 11:00 hour.
      await insertReading(
        t,
        ctx.planterId,
        'airTemperature',
        '2026-05-01T10:05:00Z',
        10,
      );
      await insertReading(
        t,
        ctx.planterId,
        'airTemperature',
        '2026-05-01T10:35:00Z',
        20,
      );
      await insertReading(
        t,
        ctx.planterId,
        'airTemperature',
        '2026-05-01T11:10:00Z',
        30,
      );
      return ctx;
    }
    const get = (agent: Agent, id: string, q: Record<string, string>) =>
      agent.get(`${base}/${id}/readings`).query(q);

    it('returns raw points in time order', async () => {
      const { agent, planterId } = await withTemperatures();
      const res = await get(agent, planterId, {
        metric: 'airTemperature',
        bucket: 'raw',
        ...day,
      }).expect(200);
      expect(res.body.bucket).toBe('raw');
      expect(res.body.points).toEqual([
        {
          time: '2026-05-01T10:05:00.000Z',
          avg: 10,
          min: 10,
          max: 10,
          samples: 1,
        },
        {
          time: '2026-05-01T10:35:00.000Z',
          avg: 20,
          min: 20,
          max: 20,
          samples: 1,
        },
        {
          time: '2026-05-01T11:10:00.000Z',
          avg: 30,
          min: 30,
          max: 30,
          samples: 1,
        },
      ]);
    });

    it('rolls up by hour from the continuous aggregate, including fresh data', async () => {
      const { agent, planterId } = await withTemperatures();
      const res = await get(agent, planterId, {
        metric: 'airTemperature',
        bucket: 'hour',
        ...day,
      }).expect(200);
      // Nothing has been materialized yet in a fresh test run, so this also
      // proves real-time aggregation is on.
      expect(res.body.points).toEqual([
        {
          time: '2026-05-01T10:00:00.000Z',
          avg: 15,
          min: 10,
          max: 20,
          samples: 2,
        },
        {
          time: '2026-05-01T11:00:00.000Z',
          avg: 30,
          min: 30,
          max: 30,
          samples: 1,
        },
      ]);
    });

    it('rolls up by day, weighting hourly averages by their sample count', async () => {
      const { agent, planterId } = await withTemperatures();
      const res = await get(agent, planterId, {
        metric: 'airTemperature',
        bucket: 'day',
        ...day,
      }).expect(200);
      // (10 + 20 + 30) / 3 = 20. Averaging the hourly averages (15 and 30)
      // would give 22.5, which is wrong.
      expect(res.body.points).toEqual([
        {
          time: '2026-05-01T00:00:00.000Z',
          avg: 20,
          min: 10,
          max: 30,
          samples: 3,
        },
      ]);
    });

    it('includes the hour a range starts in the middle of', async () => {
      const { agent, planterId } = await withTemperatures();
      const res = await get(agent, planterId, {
        metric: 'airTemperature',
        bucket: 'hour',
        from: '2026-05-01T10:30:00Z',
        to: '2026-05-01T12:00:00Z',
      }).expect(200);
      expect(res.body.points.map((p: { time: string }) => p.time)).toEqual([
        '2026-05-01T10:00:00.000Z',
        '2026-05-01T11:00:00.000Z',
      ]);
    });

    it('keeps metrics apart and excludes readings outside the range', async () => {
      const { agent, planterId } = await withTemperatures();
      await insertReading(
        t,
        planterId,
        'soilHumidity',
        '2026-05-01T10:05:00Z',
        55,
      );
      await insertReading(
        t,
        planterId,
        'airTemperature',
        '2026-04-30T10:05:00Z',
        99,
      );

      const soil = await get(agent, planterId, {
        metric: 'soilHumidity',
        bucket: 'raw',
        ...day,
      }).expect(200);
      expect(soil.body.points.map((p: { avg: number }) => p.avg)).toEqual([55]);
      const temp = await get(agent, planterId, {
        metric: 'airTemperature',
        bucket: 'raw',
        ...day,
      }).expect(200);
      expect(temp.body.points.map((p: { avg: number }) => p.avg)).toEqual([
        10, 20, 30,
      ]);
    });

    it('returns no points, not an error, for an empty range', async () => {
      const { agent, planterId } = await setup();
      const res = await get(agent, planterId, {
        metric: 'airHumidity',
        ...day,
      }).expect(200);
      expect(res.body.points).toEqual([]);
    });

    it('chooses a bucket that suits the range when none is given', async () => {
      const { agent, planterId } = await setup();
      const pick = async (from: string, to: string) =>
        (
          await get(agent, planterId, {
            metric: 'airTemperature',
            from,
            to,
          }).expect(200)
        ).body.bucket;
      expect(await pick('2026-05-01T00:00:00Z', '2026-05-01T05:00:00Z')).toBe(
        'raw',
      );
      expect(await pick('2026-05-01T00:00:00Z', '2026-05-08T00:00:00Z')).toBe(
        'hour',
      );
      expect(await pick('2026-01-01T00:00:00Z', '2026-05-01T00:00:00Z')).toBe(
        'day',
      );
      // No range at all: the last 24 hours.
      const recent = await get(agent, planterId, {
        metric: 'airTemperature',
      }).expect(200);
      expect(recent.body.bucket).toBe('hour');
      expect(Date.parse(recent.body.to) - Date.parse(recent.body.from)).toBe(
        86_400_000,
      );
    });

    it('rejects bad queries', async () => {
      const { agent, planterId } = await setup();
      const bad = (q: Record<string, string>) =>
        get(agent, planterId, q).expect(400);
      await bad({});
      await bad({ metric: 'nope' });
      await bad({ metric: 'airTemperature', bucket: 'minute' });
      await bad({ metric: 'airTemperature', from: 'yesterday' });
      await bad({ metric: 'airTemperature', from: day.to, to: day.from });
      await bad({ metric: 'airTemperature', from: day.from, to: day.from });
      // Hourly data is capped so a response stays a sensible size.
      await bad({
        metric: 'airTemperature',
        bucket: 'hour',
        from: '2026-01-01T00:00:00Z',
        to: '2026-06-01T00:00:00Z',
      });
    });

    it('refuses a raw response too large to chart, and offers rollups instead', async () => {
      const { agent, planterId } = await setup();
      await t.db.execute(sql`
        insert into readings ("time", planter_id, metric, value)
        select '2026-06-01T00:00:00Z'::timestamptz + (g || ' seconds')::interval,
               ${planterId}, 'airHumidity', g % 100
        from generate_series(1, 10001) g`);
      const range = {
        metric: 'airHumidity',
        from: '2026-06-01T00:00:00Z',
        to: '2026-06-01T04:00:00Z',
      };

      const raw = await get(agent, planterId, {
        ...range,
        bucket: 'raw',
      }).expect(400);
      expect(raw.body.message).toMatch(/bucket=hour/);
      const hourly = await get(agent, planterId, {
        ...range,
        bucket: 'hour',
      }).expect(200);
      expect(hourly.body.points.length).toBeGreaterThan(0);
    });
  });

  describe("another user's data", () => {
    it('is invisible and untouchable', async () => {
      const owner = await setup();
      const intruder = await signUp(t);
      const plant = await owner.agent
        .post(`/api/planters/${owner.planterId}/plants`)
        .send({ species: 'Bazalka', lifecycle: 'annual' })
        .expect(201);

      const intruderList = await intruder.agent
        .get('/api/planters')
        .expect(200);
      expect(intruderList.body).toEqual([]);

      const p = `/api/planters/${owner.planterId}`;
      await intruder.agent.get(p).expect(404);
      await intruder.agent.patch(p).send({ name: 'mine now' }).expect(404);
      await intruder.agent.delete(p).expect(404);
      await intruder.agent
        .get(`${p}/readings`)
        .query({ metric: 'airTemperature' })
        .expect(404);
      await intruder.agent
        .post(`${p}/plants`)
        .send({ species: 'x', lifecycle: 'annual' })
        .expect(404);
      await intruder.agent
        .patch(`/api/plants/${plant.body.id}`)
        .send({ species: 'hijacked' })
        .expect(404);
      await intruder.agent.delete(`/api/plants/${plant.body.id}`).expect(404);

      // Nothing changed.
      const [planter] = await t.db
        .select()
        .from(planters)
        .where(eq(planters.id, owner.planterId));
      expect(planter.name).toBe('balcony-1');
      const [stillThere] = await t.db
        .select()
        .from(plants)
        .where(eq(plants.id, plant.body.id));
      expect(stillThere.species).toBe('Bazalka');
    });

    it('answers a missing planter exactly like one that belongs to someone else', async () => {
      const owner = await setup();
      const intruder = await signUp(t);
      const real = await intruder.agent
        .get(`/api/planters/${owner.planterId}`)
        .expect(404);
      const missing = await intruder.agent
        .get('/api/planters/00000000-0000-4000-8000-000000000000')
        .expect(404);
      expect(real.body).toEqual(missing.body);
    });
  });
});
