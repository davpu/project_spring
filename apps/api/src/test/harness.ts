import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ThrottlerStorage } from '@nestjs/throttler';
import {
  gateways,
  like,
  planters,
  readings,
  users,
  type Database,
} from '@org/db';
import type { Metric } from '@org/shared';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../app/app.module';
import { DB } from '../db/db.module';
import { IngestService } from '../ingest/ingest.service';
import { MailService } from '../mail/mail.service';
import { DynsecService } from '../mqtt/dynsec.service';
import { MqttService } from '../mqtt/mqtt.service';

/** Every account these tests create matches this, so cleanup can find them. */
const TEST_EMAIL_PATTERN = 'test-%@example.test';
export const PASSWORD = 'Correct-horse-battery1';

export const uniqueEmail = () => `test-${randomUUID()}@example.test`;

/**
 * The real application against the real database, with the broker replaced by
 * recording fakes. The database is the part worth testing for real (SQL,
 * constraints, the Timescale aggregate); the broker is out of process.
 */
export async function createTestApp() {
  const dynsec = {
    provisionGateway: vi.fn().mockResolvedValue(undefined),
    removeGateway: vi.fn().mockResolvedValue(undefined),
    ensureIngestAccess: vi.fn().mockResolvedValue(undefined),
  };
  const mqtt = {
    connected: true,
    onConnect: vi.fn(),
    onMessage: vi.fn(),
    publish: vi.fn(),
    subscribe: vi.fn(),
  };

  const mail = { send: vi.fn().mockResolvedValue(undefined) };

  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(MqttService)
    .useValue(mqtt)
    .overrideProvider(DynsecService)
    .useValue(dynsec)
    .overrideProvider(MailService)
    .useValue(mail)
    // Rate limits are a production concern; with a shared client address every
    // registration here would otherwise hit the credential limit. Replacing the
    // counter store (rather than the guard) leaves the real guard in place.
    .overrideProvider(ThrottlerStorage)
    .useValue({
      increment: async () => ({
        totalHits: 1,
        timeToExpire: 60,
        isBlocked: false,
        timeToBlockExpire: 0,
      }),
    })
    .compile();

  const app: INestApplication = moduleRef.createNestApplication();
  app.use(cookieParser());
  app.setGlobalPrefix('api');
  await app.init();

  const db = app.get<Database>(DB);
  return {
    app,
    db,
    dynsec,
    mail,
    ingest: app.get(IngestService),
    /** A client with its own cookie jar. */
    agent: () => request.agent(app.getHttpServer()),
    anonymous: () => request(app.getHttpServer()),
    async close() {
      await db.delete(users).where(like(users.email, TEST_EMAIL_PATTERN));
      await app.close();
    },
  };
}

export type TestApp = Awaited<ReturnType<typeof createTestApp>>;
export type Agent = ReturnType<TestApp['agent']>;

/** Registers a fresh user and returns a client already holding its session. */
export async function signUp(
  t: TestApp,
): Promise<{ agent: Agent; id: string; email: string }> {
  const agent = t.agent();
  const email = uniqueEmail();
  const res = await agent
    .post('/api/auth/register')
    .send({ email, password: PASSWORD })
    .expect(201);
  return { agent, id: res.body.id as string, email };
}

export async function insertGateway(t: TestApp, userId: string, name = 'gw') {
  const [row] = await t.db
    .insert(gateways)
    .values({ userId, name })
    .returning({ id: gateways.id });
  return row.id;
}

export async function insertPlanter(
  t: TestApp,
  gatewayId: string,
  sensorKey = 'balcony-1',
) {
  const [row] = await t.db
    .insert(planters)
    .values({ gatewayId, sensorKey, name: sensorKey })
    .returning({ id: planters.id });
  return row.id;
}

export async function insertReading(
  t: TestApp,
  planterId: string,
  metric: Metric,
  time: string,
  value: number,
) {
  await t.db
    .insert(readings)
    .values({ planterId, metric, time: new Date(time), value });
}
