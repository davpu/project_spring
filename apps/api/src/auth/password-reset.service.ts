import { createHash, randomBytes } from 'node:crypto';
import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
} from '@nestjs/common';
import {
  and,
  count,
  eq,
  gt,
  isNull,
  passwordResets,
  sql,
  users,
  type Database,
} from '@org/db';
import type { ResetPasswordRequest } from '@org/shared';
import { APP_CONFIG, type AppConfig } from '../config/config';
import { DB } from '../db/db.module';
import { MailService } from '../mail/mail.service';
import { hashPassword } from './password';

export const RESET_TTL_MINUTES = 60;
/** At most this many live links per account, so the form cannot be used to flood an inbox. */
export const MAX_PENDING_RESETS = 3;
const INVALID_TOKEN = 'Invalid or expired reset link';

/**
 * Only this hash is stored. The token is 256 bits of randomness, so there is
 * nothing to brute-force and no need for a slow hash; a leaked table holds
 * nothing that can be redeemed.
 */
export function hashResetToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

@Injectable()
export class PasswordResetService {
  private readonly logger = new Logger(PasswordResetService.name);

  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly mail: MailService,
  ) {}

  /**
   * Emails a reset link if the account exists. It returns the same way when it
   * does not, and when the account already has too many live links, so the
   * response says nothing about which addresses are registered. The email is
   * sent without being waited for, for the same reason: how long the mail
   * server takes must not show either.
   */
  async request(email: string): Promise<void> {
    const [user] = await this.db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, email));
    if (!user) return;

    const [{ pending }] = await this.db
      .select({ pending: count() })
      .from(passwordResets)
      .where(
        and(
          eq(passwordResets.userId, user.id),
          isNull(passwordResets.usedAt),
          gt(passwordResets.expiresAt, sql`now()`),
        ),
      );
    if (pending >= MAX_PENDING_RESETS) return;

    const token = randomBytes(32).toString('base64url');
    await this.db.insert(passwordResets).values({
      userId: user.id,
      tokenHash: hashResetToken(token),
      expiresAt: new Date(Date.now() + RESET_TTL_MINUTES * 60_000),
    });

    const link = `${this.config.appUrl}/reset-password?token=${token}`;
    void this.mail
      .send({
        to: email,
        subject: 'Reset your Spring password',
        text: [
          'Someone asked to reset the password of your Spring account.',
          '',
          `Open this link to choose a new one (it works once, for ${RESET_TTL_MINUTES} minutes):`,
          link,
          '',
          'If this was not you, ignore this email. Your password stays as it is.',
        ].join('\n'),
      })
      .catch((error: unknown) => {
        // Never the link or the address: this goes to the log.
        this.logger.error(
          `Could not send a password reset email: ${String(error)}`,
        );
      });
  }

  /**
   * Claims the token with a single conditional UPDATE, so of any number of
   * simultaneous attempts exactly one wins, then sets the password in the same
   * transaction. Whatever is wrong with the token, the answer is the same.
   */
  async reset({ token, password }: ResetPasswordRequest): Promise<void> {
    // The slow part happens before the transaction, so it does not hold it open.
    const passwordHash = await hashPassword(password);
    await this.db.transaction(async (tx) => {
      const [claimed] = await tx
        .update(passwordResets)
        .set({ usedAt: sql`now()` })
        .where(
          and(
            eq(passwordResets.tokenHash, hashResetToken(token)),
            isNull(passwordResets.usedAt),
            gt(passwordResets.expiresAt, sql`now()`),
          ),
        )
        .returning({ userId: passwordResets.userId });
      if (!claimed) throw new BadRequestException(INVALID_TOKEN);

      await tx
        .update(users)
        .set({ passwordHash })
        .where(eq(users.id, claimed.userId));
      // Any other link that was still open is for the password that no longer exists.
      await tx
        .delete(passwordResets)
        .where(
          and(
            eq(passwordResets.userId, claimed.userId),
            isNull(passwordResets.usedAt),
          ),
        );
    });
  }
}
