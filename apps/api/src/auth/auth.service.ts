import {
  ConflictException,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { users, type Database } from '@org/db';
import type { LoginRequest, RegisterRequest, UserDto } from '@org/shared';
import { eq } from '@org/db';
import { PG_UNIQUE_VIOLATION, pgErrorCode } from '../common/pg-errors';
import { DB } from '../db/db.module';
import { hashPassword, verifyAgainstDummy, verifyPassword } from './password';

export const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60;

@Injectable()
export class AuthService {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly jwt: JwtService,
  ) {}

  async register({ email, password }: RegisterRequest): Promise<UserDto> {
    const passwordHash = await hashPassword(password);
    try {
      const [user] = await this.db
        .insert(users)
        .values({ email, passwordHash })
        .returning({ id: users.id, email: users.email });
      return user;
    } catch (error) {
      if (pgErrorCode(error) === PG_UNIQUE_VIOLATION) {
        throw new ConflictException(
          'An account with this email already exists',
        );
      }
      throw error;
    }
  }

  async login({ email, password }: LoginRequest): Promise<UserDto> {
    const [user] = await this.db
      .select()
      .from(users)
      .where(eq(users.email, email));
    const ok = user
      ? await verifyPassword(password, user.passwordHash)
      : await verifyAgainstDummy(password);
    if (!user || !ok)
      throw new UnauthorizedException('Invalid email or password');
    return { id: user.id, email: user.email };
  }

  async findUser(id: string): Promise<UserDto | null> {
    const [user] = await this.db
      .select({ id: users.id, email: users.email })
      .from(users)
      .where(eq(users.id, id));
    return user ?? null;
  }

  issueToken(userId: string): Promise<string> {
    return this.jwt.signAsync(
      { sub: userId },
      { expiresIn: SESSION_TTL_SECONDS },
    );
  }

  async verifyToken(token: string): Promise<string | null> {
    try {
      const payload = await this.jwt.verifyAsync<{ sub?: unknown }>(token);
      return typeof payload.sub === 'string' ? payload.sub : null;
    } catch {
      return null;
    }
  }
}
