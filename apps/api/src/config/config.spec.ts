import { loadConfig } from './config';

const valid = {
  DATABASE_URL: 'postgres://u:p@localhost:5433/db',
  JWT_SECRET: 'x'.repeat(32),
  MQTT_ADMIN_USER: 'api',
  MQTT_ADMIN_PASSWORD: 'secret',
};

describe('loadConfig', () => {
  it('reads a complete environment and applies defaults', () => {
    expect(loadConfig(valid)).toEqual({
      isProduction: false,
      port: 3000,
      databaseUrl: valid.DATABASE_URL,
      jwtSecret: valid.JWT_SECRET,
      mqttUrl: 'mqtt://localhost:1883',
      mqttPublicUrl: 'mqtt://localhost:1883',
      mqttAdminUser: 'api',
      mqttAdminPassword: 'secret',
      appUrl: 'http://localhost:4200',
      mail: null,
    });
  });

  it('takes the address of the web app, without a trailing slash', () => {
    expect(
      loadConfig({ ...valid, APP_URL: 'https://example.com/' }).appUrl,
    ).toBe('https://example.com');
    expect(() => loadConfig({ ...valid, APP_URL: 'not a url' })).toThrow(
      /APP_URL/,
    );
  });

  it('hands gateways the public broker URL when one is set', () => {
    const config = loadConfig({
      ...valid,
      MQTT_URL: 'mqtt://mosquitto:1883',
      MQTT_PUBLIC_URL: 'mqtts://mqtt.example.com:8883',
    });
    expect(config.mqttUrl).toBe('mqtt://mosquitto:1883');
    expect(config.mqttPublicUrl).toBe('mqtts://mqtt.example.com:8883');
  });

  it('falls back to the internal URL for gateways otherwise', () => {
    expect(
      loadConfig({ ...valid, MQTT_URL: 'mqtt://broker:1883' }).mqttPublicUrl,
    ).toBe('mqtt://broker:1883');
  });

  it('parses the port and the production flag', () => {
    const config = loadConfig({
      ...valid,
      PORT: '8080',
      NODE_ENV: 'production',
    });
    expect(config).toMatchObject({ port: 8080, isProduction: true });
  });

  it('refuses a short signing secret', () => {
    expect(() => loadConfig({ ...valid, JWT_SECRET: 'short' })).toThrow(
      /JWT_SECRET/,
    );
  });

  it('lists every problem at once, not just the first', () => {
    expect(() => loadConfig({ PORT: 'abc' })).toThrow(
      /DATABASE_URL[\s\S]*JWT_SECRET[\s\S]*MQTT_ADMIN_USER[\s\S]*MQTT_ADMIN_PASSWORD|PORT/,
    );
    try {
      loadConfig({});
    } catch (error) {
      const message = String(error);
      for (const key of [
        'DATABASE_URL',
        'JWT_SECRET',
        'MQTT_ADMIN_USER',
        'MQTT_ADMIN_PASSWORD',
      ]) {
        expect(message).toContain(key);
      }
    }
  });

  it('rejects an out-of-range port', () => {
    expect(() => loadConfig({ ...valid, PORT: '70000' })).toThrow(/PORT/);
  });
});
