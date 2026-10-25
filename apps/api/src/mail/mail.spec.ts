import { createTransport } from 'nodemailer';
import { loadConfig, type AppConfig } from '../config/config';
import { MailService, smtpOptions } from './mail.service';

vi.mock('nodemailer', () => ({ createTransport: vi.fn() }));

const mail = {
  host: 'smtp.example.com',
  port: 587,
  user: 'sender@example.com',
  password: 'secret',
  from: 'Spring <sender@example.com>',
};

const config = (overrides: Partial<AppConfig> = {}): AppConfig =>
  ({ isProduction: false, mail: null, ...overrides }) as AppConfig;

describe('smtpOptions', () => {
  it('starts in TLS on 465', () => {
    expect(smtpOptions({ ...mail, port: 465 })).toMatchObject({
      secure: true,
      requireTLS: false,
    });
  });

  it('insists on upgrading to TLS elsewhere, so the password is never sent in the clear', () => {
    expect(smtpOptions(mail)).toMatchObject({
      secure: false,
      requireTLS: true,
    });
    expect(smtpOptions({ ...mail, port: 25 })).toMatchObject({
      requireTLS: true,
    });
  });

  it('logs in with the configured account and gives up on a mail server that hangs', () => {
    expect(smtpOptions(mail)).toMatchObject({
      host: 'smtp.example.com',
      port: 587,
      auth: { user: 'sender@example.com', pass: 'secret' },
      connectionTimeout: expect.any(Number),
      socketTimeout: expect.any(Number),
    });
  });
});

describe('MailService', () => {
  const sendMail = vi.fn();
  beforeEach(() => {
    sendMail.mockReset().mockResolvedValue(undefined);
    vi.mocked(createTransport)
      .mockReset()
      .mockReturnValue({ sendMail } as never);
  });

  const message = { to: 'a@example.com', subject: 'Hi', text: 'Hello' };

  it('sends through the SMTP server from the configured sender', async () => {
    await new MailService(config({ mail })).send(message);
    expect(sendMail).toHaveBeenCalledWith({ from: mail.from, ...message });
  });

  it('passes a failure on to the caller', async () => {
    sendMail.mockRejectedValue(new Error('refused'));
    await expect(
      new MailService(config({ mail })).send(message),
    ).rejects.toThrow('refused');
  });

  it('only logs the message in development when no server is configured', async () => {
    await expect(
      new MailService(config()).send(message),
    ).resolves.toBeUndefined();
    expect(createTransport).not.toHaveBeenCalled();
    expect(sendMail).not.toHaveBeenCalled();
  });

  it('refuses to send in production without a server, rather than log a working reset link', async () => {
    await expect(
      new MailService(config({ isProduction: true })).send(message),
    ).rejects.toThrow(/not configured/);
  });
});

describe('mail settings in the environment', () => {
  const env = {
    DATABASE_URL: 'postgres://u:p@localhost/db',
    JWT_SECRET: 'x'.repeat(32),
    MQTT_ADMIN_USER: 'api',
    MQTT_ADMIN_PASSWORD: 'secret',
  };
  const complete = {
    ...env,
    SMTP_HOST: mail.host,
    SMTP_USER: mail.user,
    SMTP_PASSWORD: mail.password,
    MAIL_FROM: mail.from,
  };

  it('are optional', () => {
    expect(loadConfig(env).mail).toBeNull();
  });

  it('treat the empty values compose passes for unset variables as unset', () => {
    expect(
      loadConfig({
        ...env,
        SMTP_HOST: '',
        SMTP_USER: '',
        SMTP_PASSWORD: '',
        MAIL_FROM: '',
      }).mail,
    ).toBeNull();
  });

  it('read a complete SMTP configuration', () => {
    expect(loadConfig({ ...complete, SMTP_PORT: '465' }).mail).toEqual({
      ...mail,
      port: 465,
    });
  });

  it('default to port 587, also when the variable is empty', () => {
    expect(loadConfig(complete).mail?.port).toBe(587);
    expect(loadConfig({ ...complete, SMTP_PORT: '' }).mail?.port).toBe(587);
  });

  it('name everything that is missing once a host is set', () => {
    expect(() => loadConfig({ ...env, SMTP_HOST: mail.host })).toThrow(
      /SMTP_USER[\s\S]*SMTP_PASSWORD[\s\S]*MAIL_FROM/,
    );
  });
});
