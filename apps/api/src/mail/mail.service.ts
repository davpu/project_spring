import { Inject, Injectable, Logger } from '@nestjs/common';
import { createTransport, type Transporter } from 'nodemailer';
import type SMTPTransport from 'nodemailer/lib/smtp-transport';
import { APP_CONFIG, type AppConfig, type MailConfig } from '../config/config';

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
}

/**
 * Port 465 speaks TLS from the first byte; anything else (587) starts in the
 * clear and upgrades. `requireTLS` makes that upgrade mandatory, so the
 * password is never sent over a connection the server did not encrypt.
 */
export function smtpOptions(mail: MailConfig): SMTPTransport.Options {
  const implicitTls = mail.port === 465;
  return {
    host: mail.host,
    port: mail.port,
    secure: implicitTls,
    requireTLS: !implicitTls,
    auth: { user: mail.user, pass: mail.password },
    // A mail server that hangs must not hold a request or a socket forever.
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
  };
}

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly transport: Transporter | null;
  private readonly from: string;

  constructor(@Inject(APP_CONFIG) private readonly config: AppConfig) {
    this.transport = config.mail
      ? createTransport(smtpOptions(config.mail))
      : null;
    this.from = config.mail?.from ?? '';
    if (!this.transport && config.isProduction) {
      this.logger.warn(
        'SMTP_HOST is not set: emails (password resets) cannot be sent',
      );
    }
  }

  async send(message: MailMessage): Promise<void> {
    if (this.transport) {
      await this.transport.sendMail({ from: this.from, ...message });
      return;
    }
    // Without a mail server, development shows the message in the log so the
    // reset link can still be followed. Production must not: the log would
    // then hold working password reset links.
    if (this.config.isProduction) {
      throw new Error('SMTP is not configured');
    }
    this.logger.log(
      `Email not sent (no SMTP server configured)\nTo: ${message.to}\nSubject: ${message.subject}\n\n${message.text}`,
    );
  }
}
