import { BadGatewayException } from '@nestjs/common';
import { eq, gateways, planters } from '@org/db';
import {
  createTestApp,
  insertGateway,
  insertPlanter,
  signUp,
  type TestApp,
} from '../test/harness';

describe('gateways', () => {
  let t: TestApp;
  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(() => t.close());
  beforeEach(() => {
    t.dynsec.removeGateway.mockClear();
    t.dynsec.removeGateway.mockResolvedValue(undefined);
  });

  it("lists only the user's gateways, with a planter count", async () => {
    const me = await signUp(t);
    const other = await signUp(t);
    const mine = await insertGateway(t, me.id, 'Balkon');
    await insertPlanter(t, mine, 'a');
    await insertPlanter(t, mine, 'b');
    const empty = await insertGateway(t, me.id, 'Garáž');
    await insertGateway(t, other.id, 'Cizí');

    const res = await me.agent.get('/api/gateways').expect(200);
    const byName = Object.fromEntries(
      res.body.map((g: { name: string; planterCount: number }) => [
        g.name,
        g.planterCount,
      ]),
    );
    // Regression: a correlated subquery once compared against the wrong "id"
    // and reported 0 for every gateway.
    expect(byName).toEqual({ Balkon: 2, Garáž: 0 });
    expect(res.body.map((g: { id: string }) => g.id)).toContain(empty);
  });

  it('reports when a gateway was last seen, or null if never', async () => {
    const me = await signUp(t);
    const id = await insertGateway(t, me.id);
    const never = await me.agent.get('/api/gateways').expect(200);
    expect(never.body[0].lastSeenAt).toBeNull();

    const at = new Date('2026-05-01T10:00:00Z');
    await t.db
      .update(gateways)
      .set({ lastSeenAt: at })
      .where(eq(gateways.id, id));
    const seen = await me.agent.get('/api/gateways').expect(200);
    expect(seen.body[0].lastSeenAt).toBe(at.toISOString());
  });

  it('unpairs: revokes the broker client and removes the gateway with its planters', async () => {
    const me = await signUp(t);
    const id = await insertGateway(t, me.id);
    await insertPlanter(t, id);

    await me.agent.delete(`/api/gateways/${id}`).expect(204);

    expect(t.dynsec.removeGateway).toHaveBeenCalledWith(id);
    expect(
      await t.db.select().from(gateways).where(eq(gateways.id, id)),
    ).toHaveLength(0);
    expect(
      await t.db.select().from(planters).where(eq(planters.gatewayId, id)),
    ).toHaveLength(0);
  });

  it('keeps the gateway if the broker credential could not be revoked', async () => {
    const me = await signUp(t);
    const id = await insertGateway(t, me.id);
    t.dynsec.removeGateway.mockRejectedValueOnce(
      new BadGatewayException('broker down'),
    );

    await me.agent.delete(`/api/gateways/${id}`).expect(502);

    // Still there, so the delete can be retried rather than leaving a live
    // credential that nothing records.
    expect(
      await t.db.select().from(gateways).where(eq(gateways.id, id)),
    ).toHaveLength(1);
    await me.agent.delete(`/api/gateways/${id}`).expect(204);
  });

  it("cannot unpair someone else's gateway", async () => {
    const owner = await signUp(t);
    const intruder = await signUp(t);
    const id = await insertGateway(t, owner.id);

    await intruder.agent.delete(`/api/gateways/${id}`).expect(404);

    expect(t.dynsec.removeGateway).not.toHaveBeenCalled();
    expect(
      await t.db.select().from(gateways).where(eq(gateways.id, id)),
    ).toHaveLength(1);
  });

  it('rejects a malformed id', async () => {
    const me = await signUp(t);
    await me.agent.delete('/api/gateways/nope').expect(400);
  });
});
