import { describe, expect, it } from 'vitest';
import {
  ForgotPasswordRequestSchema,
  PASSWORD_RULES,
  PasswordSchema,
  RegisterFormSchema,
} from '../index.js';

const messages = (password: string) => {
  const result = PasswordSchema.safeParse(password);
  return result.success ? [] : result.error.issues.map((i) => i.message);
};

describe('password rules', () => {
  it('accepts a password that meets every rule', () => {
    expect(messages('Sunflower7')).toEqual([]);
  });

  it('reports each rule that fails', () => {
    expect(messages('abc')).toEqual(PASSWORD_RULES.map((r) => r.label));
  });

  it('counts non-ASCII uppercase letters', () => {
    expect(messages('Řeřicha12')).toEqual([]);
  });
});

describe('registration form', () => {
  const form = {
    email: 'gardener@example.com',
    password: 'Sunflower7',
    confirmPassword: 'Sunflower7',
  };

  it('accepts matching passwords', () => {
    expect(RegisterFormSchema.safeParse(form).success).toBe(true);
  });

  it('flags a mismatched confirmation on the confirm field', () => {
    const result = RegisterFormSchema.safeParse({
      ...form,
      confirmPassword: 'Sunflower8',
    });
    expect(result.error?.issues).toMatchObject([
      { path: ['confirmPassword'], message: 'Passwords do not match' },
    ]);
  });
});

describe('forgot password', () => {
  it('trims the email', () => {
    expect(
      ForgotPasswordRequestSchema.parse({ email: ' gardener@example.com ' }),
    ).toEqual({ email: 'gardener@example.com' });
  });
});
