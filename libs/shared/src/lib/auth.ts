import { z } from 'zod';

export const PASSWORD_MIN_LENGTH = 8;

/**
 * Each rule is checked separately so the web app can show a live checklist;
 * `PasswordSchema` reports the same messages.
 */
export const PASSWORD_RULES = [
  {
    id: 'length',
    label: `At least ${PASSWORD_MIN_LENGTH} characters`,
    test: (value: string) => value.length >= PASSWORD_MIN_LENGTH,
  },
  {
    id: 'uppercase',
    label: 'One uppercase letter',
    test: (value: string) => /\p{Lu}/u.test(value),
  },
  {
    id: 'digit',
    label: 'One number',
    test: (value: string) => /\d/.test(value),
  },
] as const;

export const EmailSchema = z
  .string()
  .trim()
  .pipe(z.email('Enter a valid email address'));

export const PasswordSchema = PASSWORD_RULES.reduce(
  (schema, rule) => schema.refine(rule.test, rule.label),
  z.string().max(128, 'At most 128 characters'),
);

/** Web app -> API: log in. Existing passwords are not re-checked against the rules. */
export const LoginRequestSchema = z.object({
  email: EmailSchema,
  password: z.string().min(1, 'Enter your password'),
});
export type LoginRequest = z.infer<typeof LoginRequestSchema>;

/** Web app -> API: create an account. */
export const RegisterRequestSchema = z.object({
  email: EmailSchema,
  password: PasswordSchema,
});
export type RegisterRequest = z.infer<typeof RegisterRequestSchema>;

/** The registration form adds a confirmation field the API never sees. */
export const RegisterFormSchema = RegisterRequestSchema.extend({
  confirmPassword: z.string(),
}).refine((form) => form.password === form.confirmPassword, {
  path: ['confirmPassword'],
  message: 'Passwords do not match',
});
export type RegisterForm = z.infer<typeof RegisterFormSchema>;

/**
 * Web app -> API: request a reset link. The API answers the same way whether
 * or not the account exists, so the form cannot be used to probe emails.
 */
export const ForgotPasswordRequestSchema = z.object({
  email: EmailSchema,
});
export type ForgotPasswordRequest = z.infer<typeof ForgotPasswordRequestSchema>;
