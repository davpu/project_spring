import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  NotFoundException,
  Post,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import {
  ForgotPasswordRequestSchema,
  LoginRequestSchema,
  RegisterRequestSchema,
  ResetPasswordRequestSchema,
  type ForgotPasswordRequest,
  type LoginRequest,
  type RegisterRequest,
  type ResetPasswordRequest,
  type UserDto,
} from '@org/shared';
import type { Response } from 'express';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { APP_CONFIG, type AppConfig } from '../config/config';
import { AuthGuard, SESSION_COOKIE, UserId } from './auth.guard';
import { AuthService, SESSION_TTL_SECONDS } from './auth.service';
import { PasswordResetService } from './password-reset.service';

/** Credential endpoints are the ones worth brute-forcing, so they get a tight limit. */
const CREDENTIAL_LIMIT = { default: { limit: 10, ttl: 60_000 } };
/** Every call can send an email to someone else, so this one is tighter still. */
const FORGOT_PASSWORD_LIMIT = { default: { limit: 5, ttl: 60_000 } };

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly passwordReset: PasswordResetService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  @Post('register')
  @Throttle(CREDENTIAL_LIMIT)
  async register(
    @Body(new ZodValidationPipe(RegisterRequestSchema)) body: RegisterRequest,
    @Res({ passthrough: true }) res: Response,
  ): Promise<UserDto> {
    const user = await this.auth.register(body);
    await this.startSession(res, user.id);
    return user;
  }

  @Post('login')
  @HttpCode(200)
  @Throttle(CREDENTIAL_LIMIT)
  async login(
    @Body(new ZodValidationPipe(LoginRequestSchema)) body: LoginRequest,
    @Res({ passthrough: true }) res: Response,
  ): Promise<UserDto> {
    const user = await this.auth.login(body);
    await this.startSession(res, user.id);
    return user;
  }

  /** Always answers 202, whether or not the address has an account. */
  @Post('forgot-password')
  @HttpCode(202)
  @Throttle(FORGOT_PASSWORD_LIMIT)
  async forgotPassword(
    @Body(new ZodValidationPipe(ForgotPasswordRequestSchema))
    body: ForgotPasswordRequest,
  ): Promise<void> {
    await this.passwordReset.request(body.email);
  }

  /** Does not sign the user in; the web app sends them to the login form. */
  @Post('reset-password')
  @HttpCode(204)
  @Throttle(CREDENTIAL_LIMIT)
  async resetPassword(
    @Body(new ZodValidationPipe(ResetPasswordRequestSchema))
    body: ResetPasswordRequest,
  ): Promise<void> {
    await this.passwordReset.reset(body);
  }

  @Post('logout')
  @HttpCode(204)
  logout(@Res({ passthrough: true }) res: Response): void {
    res.clearCookie(SESSION_COOKIE, this.cookieOptions());
  }

  @Get('me')
  @UseGuards(AuthGuard)
  async me(@UserId() userId: string): Promise<UserDto> {
    const user = await this.auth.findUser(userId);
    if (!user) throw new NotFoundException();
    return user;
  }

  private async startSession(res: Response, userId: string): Promise<void> {
    res.cookie(SESSION_COOKIE, await this.auth.issueToken(userId), {
      ...this.cookieOptions(),
      maxAge: SESSION_TTL_SECONDS * 1000,
    });
  }

  /**
   * `lax` keeps the cookie off cross-site POSTs, which is the CSRF defence here:
   * every state-changing route takes JSON and nothing mutates on GET.
   */
  private cookieOptions() {
    return {
      httpOnly: true,
      sameSite: 'lax' as const,
      secure: this.config.isProduction,
      path: '/',
    };
  }
}
