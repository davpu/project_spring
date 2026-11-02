import { useState, type ReactNode } from 'react';
import {
  ForgotPasswordRequestSchema,
  LoginRequestSchema,
  PasswordSchema,
  RegisterFormSchema,
  type UserDto,
} from '@org/shared';
import { Password1010 } from '@react95/icons/Password1010';
import { Button } from 'react95';
import styled from 'styled-components';
import { z } from 'zod';
import { PasswordChecklist } from '../../components/password-checklist';
import { PasswordField } from '../../components/password-field';
import { TextField } from '../../components/text-field';
import { FormError, TextLink } from '../../components/win95';
import { useForm } from '../../lib/use-form';
import { auth } from '../api/api';
import { useDesktopWindow } from '../desktop/desktop-window';

export type AuthView = 'login' | 'register' | 'forgot';

type ViewProps = {
  onNavigate: (view: AuthView) => void;
  onAuthenticated: (user: UserDto) => void;
};

/** Icon | prompt and fields | buttons, like the Win95 "Welcome to Windows" logon. */
const Dialog = styled.form`
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  gap: 16px;
  --label-width: 136px;
`;

const Main = styled.div`
  display: flex;
  flex: 1 1 280px;
  flex-direction: column;
  gap: 12px;
  min-width: 0;
`;

const Prompt = styled.p`
  margin: 0 0 4px;
`;

const Buttons = styled.div`
  display: flex;
  flex: 0 0 104px;
  flex-direction: column;
  gap: 8px;

  @media (max-width: 479px) {
    flex: 1 1 100%;
    flex-direction: row;
    justify-content: flex-end;
  }
`;

const LinkButton = styled(TextLink)`
  align-self: flex-start;

  @media (min-width: 480px) {
    margin-left: calc(var(--label-width) + 8px);
  }
`;

type LogonDialogProps = {
  label: string;
  prompt: ReactNode;
  onSubmit: (e: { preventDefault: () => void }) => void;
  pending?: boolean;
  /** Omitted when there is nothing to cancel to. */
  onCancel?: () => void;
  extraButtons?: ReactNode;
  children?: ReactNode;
};

function LogonDialog({
  label,
  prompt,
  onSubmit,
  pending = false,
  onCancel,
  extraButtons,
  children,
}: LogonDialogProps) {
  return (
    <Dialog noValidate aria-label={label} onSubmit={onSubmit}>
      <Password1010
        variant="32x32_4"
        aria-hidden
        style={{ width: 48, height: 48, imageRendering: 'pixelated' }}
      />
      <Main>
        <Prompt>{prompt}</Prompt>
        {children}
      </Main>
      <Buttons>
        <Button type="submit" primary fullWidth disabled={pending}>
          OK
        </Button>
        {onCancel && (
          <Button type="button" fullWidth onClick={onCancel}>
            Cancel
          </Button>
        )}
        {extraButtons}
      </Buttons>
    </Dialog>
  );
}

export function LoginView({ onNavigate, onAuthenticated }: ViewProps) {
  const desktopWindow = useDesktopWindow();
  const form = useForm(
    LoginRequestSchema,
    { email: '', password: '' },
    async (values) => onAuthenticated(await auth.login(values)),
  );

  return (
    <LogonDialog
      label="Log in"
      prompt="Type an email and password to log on to Spring."
      onSubmit={form.handleSubmit}
      pending={form.pending}
      onCancel={desktopWindow?.close}
      extraButtons={
        <Button type="button" fullWidth onClick={() => onNavigate('register')}>
          Sign Up...
        </Button>
      }
    >
      <TextField
        label="Email:"
        type="email"
        autoComplete="email"
        autoFocus
        {...form.field('email')}
      />
      <PasswordField
        label="Password:"
        autoComplete="current-password"
        {...form.field('password')}
      />
      <LinkButton type="button" onClick={() => onNavigate('forgot')}>
        Forgot password?
      </LinkButton>
      <FormError>{form.formError}</FormError>
    </LogonDialog>
  );
}

export function RegisterView({ onNavigate, onAuthenticated }: ViewProps) {
  const form = useForm(
    RegisterFormSchema,
    { email: '', password: '', confirmPassword: '' },
    async ({ email, password }) =>
      onAuthenticated(await auth.register({ email, password })),
  );

  return (
    <LogonDialog
      label="Sign up"
      prompt="Type an email and password to register to Spring."
      onSubmit={form.handleSubmit}
      pending={form.pending}
      onCancel={() => onNavigate('login')}
    >
      <TextField
        label="Email:"
        type="email"
        autoComplete="email"
        autoFocus
        {...form.field('email')}
      />
      <PasswordField
        label="Password:"
        autoComplete="new-password"
        hint={<PasswordChecklist password={form.values.password} />}
        {...form.field('password')}
      />
      <PasswordField
        label="Confirm password:"
        autoComplete="new-password"
        {...form.field('confirmPassword')}
      />
      <FormError>{form.formError}</FormError>
    </LogonDialog>
  );
}

export function ForgotPasswordView({ onNavigate }: ViewProps) {
  const [sentTo, setSentTo] = useState<string | null>(null);
  const form = useForm(
    ForgotPasswordRequestSchema,
    { email: '' },
    async (values) => {
      await auth.forgotPassword(values);
      setSentTo(values.email);
    },
  );

  if (sentTo) {
    return (
      <LogonDialog
        label="Reset password"
        prompt={
          <span role="status">
            If an account exists for <b>{sentTo}</b>, we've sent a link to reset
            your password.
          </span>
        }
        onSubmit={(e) => {
          e.preventDefault();
          onNavigate('login');
        }}
      />
    );
  }

  return (
    <LogonDialog
      label="Reset password"
      prompt="Type an email to reset your password for Spring."
      onSubmit={form.handleSubmit}
      pending={form.pending}
      onCancel={() => onNavigate('login')}
    >
      <TextField
        label="Email:"
        type="email"
        autoComplete="email"
        autoFocus
        {...form.field('email')}
      />
      <FormError>{form.formError}</FormError>
    </LogonDialog>
  );
}

const NewPasswordSchema = z
  .object({ password: PasswordSchema, confirmPassword: z.string() })
  .refine((form) => form.password === form.confirmPassword, {
    path: ['confirmPassword'],
    message: 'Passwords do not match',
  });

/**
 * Target of the link in the reset email (`/reset-password?token=...`). The
 * API does not sign the user in afterwards, so this hands back to the logon.
 */
export function ResetPasswordView({
  token,
  onSuccess,
  onCancel,
}: {
  token: string | null;
  onSuccess: () => void;
  onCancel: () => void;
}) {
  const form = useForm(
    NewPasswordSchema,
    { password: '', confirmPassword: '' },
    async ({ password }) => {
      await auth.resetPassword({ token: token ?? '', password });
      onSuccess();
    },
  );

  if (!token) {
    return (
      <LogonDialog
        label="Reset password"
        prompt={
          <span role="alert">
            The reset link is incomplete. Open it again from the email, or ask
            for a new one from the logon screen.
          </span>
        }
        onSubmit={(e) => {
          e.preventDefault();
          onCancel();
        }}
      />
    );
  }

  return (
    <LogonDialog
      label="New password"
      prompt="Choose a new password for Spring."
      onSubmit={form.handleSubmit}
      pending={form.pending}
      onCancel={onCancel}
    >
      <PasswordField
        label="New password:"
        autoComplete="new-password"
        autoFocus
        hint={<PasswordChecklist password={form.values.password} />}
        {...form.field('password')}
      />
      <PasswordField
        label="Confirm password:"
        autoComplete="new-password"
        {...form.field('confirmPassword')}
      />
      <FormError>{form.formError}</FormError>
    </LogonDialog>
  );
}
