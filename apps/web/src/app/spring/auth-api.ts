import type {
  ForgotPasswordRequest,
  LoginRequest,
  RegisterRequest,
} from '@org/shared';

/**
 * Stand-in for the auth endpoints until the API has them. Accounts live in
 * memory for the page's lifetime; swap `call` for a `fetch` wrapper later and
 * keep the signatures.
 */

export type User = { email: string };

export class AuthError extends Error {}

const accounts = new Map<string, string>();

const call = async <T>(handler: () => T) => {
  await new Promise((resolve) => setTimeout(resolve, 400));
  return handler();
};

export function login({ email, password }: LoginRequest): Promise<User> {
  return call(() => {
    if (accounts.get(email.toLowerCase()) !== password) {
      throw new AuthError('Invalid email or password.');
    }
    return { email };
  });
}

export function register({ email, password }: RegisterRequest): Promise<User> {
  return call(() => {
    const key = email.toLowerCase();
    if (accounts.has(key)) {
      throw new AuthError('An account with this email already exists.');
    }
    accounts.set(key, password);
    return { email };
  });
}

/** Resolves the same way whether or not the account exists. */
export function requestPasswordReset(
  _request: ForgotPasswordRequest,
): Promise<void> {
  return call(() => undefined);
}
