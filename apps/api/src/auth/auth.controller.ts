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
  LoginRequestSchema,
  RegisterRequestSchema,
  type LoginRequest,
  type RegisterRequest,
  type UserDto,
} from '@org/shared';
import type { Response } from 'express';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { APP_CONFIG, type AppConfig } from '../config/config';
import { AuthGuard, SESSION_COOKIE, UserId } from './auth.guard';
import { AuthService, SESSION_TTL_SECONDS } from './auth.service';

/** Credential endpoints are the ones worth brute-forcing, so they get a tight limit. */
const CREDENTIAL_LIMIT = { default: { limit: 10, ttl: 60_000 } };

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
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
