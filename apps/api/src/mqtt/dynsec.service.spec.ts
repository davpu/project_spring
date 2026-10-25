import {
  BadGatewayException,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { AppConfig } from '../config/config';
import { DynsecService, type DynsecCommand } from './dynsec.service';
import type { MqttService } from './mqtt.service';

const CONTROL = '$CONTROL/dynamic-security/v1';
const RESPONSE = `${CONTROL}/response`;

type Reply = { error?: string; data?: unknown };

/**
 * A stand-in for the broker. It answers every command in a batch from `reply`
 * (by command name) and records what was sent, so the tests can assert on the
 * commands without a running Mosquitto.
 */
function setup(reply: (command: DynsecCommand) => Reply = () => ({})) {
  let onMessage: (topic: string, payload: Buffer) => void = () => undefined;
  const sent: DynsecCommand[][] = [];

  const mqtt = {
    connected: true,
    onConnect: vi.fn(),
    onMessage: (handler: typeof onMessage) => {
      onMessage = handler;
    },
    publish: vi.fn(async (topic: string, payload: string) => {
      expect(topic).toBe(CONTROL);
      const { commands } = JSON.parse(payload) as { commands: DynsecCommand[] };
      sent.push(commands);
      const responses = commands.map((c) => ({
        command: c.command,
        correlationData: c.correlationData,
        ...reply(c),
      }));
      queueMicrotask(() =>
        onMessage(RESPONSE, Buffer.from(JSON.stringify({ responses }))),
      );
    }),
    subscribe: vi.fn(),
  };
  const config = { mqttAdminUser: 'api' } as AppConfig;
  const service = new DynsecService(mqtt as unknown as MqttService, config);
  const names = () => sent.flat().map((c) => c.command);
  return { service, mqtt, sent, names };
}

describe('DynsecService', () => {
  it('subscribes to the response topic on connect', async () => {
    const { mqtt } = setup();
    const connectHandler = mqtt.onConnect.mock.calls[0][0] as () => unknown;
    await connectHandler();
    expect(mqtt.subscribe).toHaveBeenCalledWith([RESPONSE]);
  });

  it('sends a batch and returns the responses in order', async () => {
    const { service } = setup();
    const responses = await service.run([
      { command: 'createRole', rolename: 'r' },
      { command: 'createClient', username: 'u' },
    ]);
    expect(responses.map((r) => r.command)).toEqual([
      'createRole',
      'createClient',
    ]);
  });

  it('matches each reply to its own request when several are in flight', async () => {
    const { service } = setup((c) => ({ data: { echo: c.rolename } }));
    const [a, b] = await Promise.all([
      service.run([{ command: 'createRole', rolename: 'a' }]),
      service.run([{ command: 'createRole', rolename: 'b' }]),
    ]);
    expect(a[0].data).toEqual({ echo: 'a' });
    expect(b[0].data).toEqual({ echo: 'b' });
  });

  it('fails when the broker rejects a command', async () => {
    const { service } = setup(() => ({ error: 'Client already exists' }));
    await expect(
      service.run([{ command: 'createClient', username: 'u' }]),
    ).rejects.toThrow(BadGatewayException);
  });

  it('lets the caller tolerate specific errors', async () => {
    const { service } = setup(() => ({ error: 'Role already exists' }));
    await expect(
      service.run(
        [{ command: 'createRole', rolename: 'r' }],
        /already exists/i,
      ),
    ).resolves.toHaveLength(1);
  });

  it('refuses immediately when the broker is not connected', async () => {
    const { service, mqtt } = setup();
    mqtt.connected = false;
    await expect(service.run([{ command: 'createRole' }])).rejects.toThrow(
      ServiceUnavailableException,
    );
    expect(mqtt.publish).not.toHaveBeenCalled();
  });

  it('gives up when the broker never answers', async () => {
    vi.useFakeTimers();
    try {
      const { service, mqtt } = setup();
      mqtt.publish.mockImplementation(async () => undefined);
      const result = service.run([{ command: 'createRole' }]);
      const assertion = expect(result).rejects.toThrow(
        ServiceUnavailableException,
      );
      await vi.advanceTimersByTimeAsync(5001);
      await assertion;
    } finally {
      vi.useRealTimers();
    }
  });

  it('ignores replies it did not ask for and unparseable ones', async () => {
    const { service, mqtt } = setup();
    const handler = mqtt.onMessage;
    expect(handler).toBeDefined();
    // Nothing is pending; these must neither throw nor resolve anything.
    const raw = (
      service as unknown as {
        handleResponse(topic: string, payload: Buffer): void;
      }
    ).handleResponse.bind(service);
    expect(() => raw(RESPONSE, Buffer.from('not json'))).not.toThrow();
    expect(() => raw(RESPONSE, Buffer.from('{"responses":[]}'))).not.toThrow();
    expect(() => raw('some/other/topic', Buffer.from('{}'))).not.toThrow();
  });

  describe('provisionGateway', () => {
    it("creates a role limited to the gateway's own topics, then the client", async () => {
      const { service, sent } = setup();
      await service.provisionGateway('gw-1', 'secret');

      const [commands] = sent;
      const acls = commands
        .filter((c) => c.command === 'addRoleACL')
        .map((c) => [c.acltype, c.topic, c.allow]);
      expect(acls).toEqual([
        ['subscribePattern', 'planters/+/telemetry', true],
        ['publishClientReceive', 'planters/#', true],
        // Scoped to this gateway: it cannot publish as another one.
        ['publishClientSend', 'gateways/gw-1/#', true],
      ]);
      expect(commands.at(-1)).toMatchObject({
        command: 'createClient',
        username: 'gw-1',
        password: 'secret',
        roles: [{ rolename: 'gateway-gw-1' }],
      });
    });

    it('cleans up what it created when a step fails, then reports the failure', async () => {
      const { service, names } = setup((c) =>
        c.command === 'createClient' ? { error: 'boom' } : {},
      );
      await expect(service.provisionGateway('gw-1', 'secret')).rejects.toThrow(
        BadGatewayException,
      );
      expect(names().slice(-2)).toEqual(['deleteClient', 'deleteRole']);
    });
  });

  describe('removeGateway', () => {
    it('deletes the client and its role', async () => {
      const { service, sent } = setup();
      await service.removeGateway('gw-1');
      expect(sent[0]).toMatchObject([
        { command: 'deleteClient', username: 'gw-1' },
        { command: 'deleteRole', rolename: 'gateway-gw-1' },
      ]);
    });

    it('is fine if they are already gone', async () => {
      const { service } = setup(() => ({ error: 'Client not found' }));
      await expect(service.removeGateway('gw-1')).resolves.toBeUndefined();
    });

    it('still fails on other broker errors', async () => {
      const { service } = setup(() => ({ error: 'Internal error' }));
      await expect(service.removeGateway('gw-1')).rejects.toThrow(
        BadGatewayException,
      );
    });
  });

  describe('ensureIngestAccess', () => {
    const clientWith = (roles: string[]) => (c: DynsecCommand) =>
      c.command === 'getClient'
        ? {
            data: {
              client: { roles: roles.map((rolename) => ({ rolename })) },
            },
          }
        : {};

    it('grants the role when the client lacks it', async () => {
      const { service, names } = setup(clientWith(['admin']));
      await service.ensureIngestAccess();
      expect(names()).toEqual([
        'createRole',
        'addRoleACL',
        'addRoleACL',
        'getClient',
        'addClientRole',
      ]);
    });

    it('does not grant it again when already held, which would drop the connection', async () => {
      const { service, names } = setup(clientWith(['admin', 'api-ingest']));
      await service.ensureIngestAccess();
      expect(names()).not.toContain('addClientRole');
    });

    it('tolerates a role and ACLs that already exist', async () => {
      const { service } = setup((c) => ({
        ...clientWith(['api-ingest'])(c),
        ...(c.command === 'createRole' ? { error: 'Role already exists' } : {}),
        ...(c.command === 'addRoleACL'
          ? { error: 'ACL with this topic already exists' }
          : {}),
      }));
      await expect(service.ensureIngestAccess()).resolves.toBeUndefined();
    });
  });
});
