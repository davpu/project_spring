import {
  type CanActivate,
  type ExecutionContext,
  Injectable,
  UnauthorizedException,
  createParamDecorator,
} from '@nestjs/common';
import type { Request } from 'express';
import { AuthService } from './auth.service';

export const SESSION_COOKIE = 'session';

export interface AuthenticatedRequest extends Request {
  userId: string;
}

/** Requires a valid session cookie and exposes the user id on the request. */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly auth: AuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token: unknown = request.cookies?.[SESSION_COOKIE];
    const userId =
      typeof token === 'string' ? await this.auth.verifyToken(token) : null;
    if (!userId) throw new UnauthorizedException();
    request.userId = userId;
    return true;
  }
}

/** The authenticated user's id; only valid on routes behind `AuthGuard`. */
export const UserId = createParamDecorator(
  (_: unknown, context: ExecutionContext): string =>
    context.switchToHttp().getRequest<AuthenticatedRequest>().userId,
);
