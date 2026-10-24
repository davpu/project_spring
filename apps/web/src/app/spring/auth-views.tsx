import { useState, type ReactNode } from 'react';
import {
  ForgotPasswordRequestSchema,
  LoginRequestSchema,
  RegisterFormSchema,
} from '@org/shared';
import { Password1010 } from '@react95/icons/Password1010';
import { Button } from 'react95';
import styled from 'styled-components';
import { PasswordChecklist } from '../../components/password-checklist';
import { PasswordField } from '../../components/password-field';
import { TextField } from '../../components/text-field';
import { useDesktopWindow } from '../desktop/desktop-window';
import { login, register, requestPasswordReset, type User } from './auth-api';
import { useForm } from './use-form';

export type AuthView = 'login' | 'register' | 'forgot';

type ViewProps = {
  onNavigate: (view: AuthView) => void;
  onAuthenticated: (user: User) => void;
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

const LinkButton = styled.button`
  align-self: flex-start;
  padding: 0;
  border: none;
  background: none;
  color: ${({ theme }) => theme.anchor};
  text-decoration: underline;

  @media (min-width: 480px) {
    margin-left: calc(var(--label-width) + 8px);
  }
`;

const Alert = styled.p`
  margin: 0;
  color: #c00;
`;

function FormError({ children }: { children: ReactNode }) {
  return children ? <Alert role="alert">{children}</Alert> : null;
}

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
    async (values) => onAuthenticated(await login(values)),
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
        inline
        label="Email:"
        type="email"
        autoComplete="email"
        autoFocus
        {...form.field('email')}
      />
      <PasswordField
        inline
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
      onAuthenticated(await register({ email, password })),
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
        inline
        label="Email:"
        type="email"
        autoComplete="email"
        autoFocus
        {...form.field('email')}
      />
      <PasswordField
        inline
        label="Password:"
        autoComplete="new-password"
        hint={<PasswordChecklist password={form.values.password} />}
        {...form.field('password')}
      />
      <PasswordField
        inline
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
      await requestPasswordReset(values);
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
        inline
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
