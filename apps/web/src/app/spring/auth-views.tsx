import { useState, type ReactNode } from 'react';
import {
  ForgotPasswordRequestSchema,
  LoginRequestSchema,
  RegisterFormSchema,
} from '@org/shared';
import { Button } from 'react95';
import styled from 'styled-components';
import { PasswordChecklist } from '../../components/password-checklist';
import { PasswordField } from '../../components/password-field';
import { TextField } from '../../components/text-field';
import { login, register, requestPasswordReset, type User } from './auth-api';
import { useForm } from './use-form';

export type AuthView = 'login' | 'register' | 'forgot';

type ViewProps = {
  onNavigate: (view: AuthView) => void;
  onAuthenticated: (user: User) => void;
};

const Form = styled.form`
  display: flex;
  flex-direction: column;
  gap: 12px;
`;

const Heading = styled.h2`
  margin: 0;
  font-size: 18px;
  font-weight: bold;
`;

const Actions = styled.div`
  display: flex;
  justify-content: flex-end;
  gap: 8px;
`;

const LinkButton = styled.button`
  align-self: flex-end;
  padding: 0;
  border: none;
  background: none;
  color: ${({ theme }) => theme.anchor};
  text-decoration: underline;
  cursor: pointer;
`;

const Alert = styled.p`
  margin: 0;
  color: #c00;
`;

function FormError({ children }: { children: ReactNode }) {
  return children ? <Alert role="alert">{children}</Alert> : null;
}

export function LoginView({ onNavigate, onAuthenticated }: ViewProps) {
  const form = useForm(
    LoginRequestSchema,
    { email: '', password: '' },
    async (values) => onAuthenticated(await login(values)),
  );

  return (
    <Form noValidate onSubmit={form.handleSubmit} aria-label="Log in">
      <Heading>Log in</Heading>
      <TextField
        label="Email"
        type="email"
        autoComplete="email"
        autoFocus
        {...form.field('email')}
      />
      <PasswordField
        label="Password"
        autoComplete="current-password"
        {...form.field('password')}
      />
      <FormError>{form.formError}</FormError>
      <Actions>
        <Button type="button" onClick={() => onNavigate('register')}>
          Sign up
        </Button>
        <Button type="submit" primary disabled={form.pending}>
          {form.pending ? 'Logging in...' : 'Login'}
        </Button>
      </Actions>
      <LinkButton type="button" onClick={() => onNavigate('forgot')}>
        Forgot password?
      </LinkButton>
    </Form>
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
    <Form noValidate onSubmit={form.handleSubmit} aria-label="Sign up">
      <Heading>Create account</Heading>
      <TextField
        label="Email"
        type="email"
        autoComplete="email"
        autoFocus
        {...form.field('email')}
      />
      <PasswordField
        label="Password"
        autoComplete="new-password"
        hint={<PasswordChecklist password={form.values.password} />}
        {...form.field('password')}
      />
      <PasswordField
        label="Confirm password"
        autoComplete="new-password"
        {...form.field('confirmPassword')}
      />
      <FormError>{form.formError}</FormError>
      <Actions>
        <Button type="button" onClick={() => onNavigate('login')}>
          Back to login
        </Button>
        <Button type="submit" primary disabled={form.pending}>
          {form.pending ? 'Creating...' : 'Sign up'}
        </Button>
      </Actions>
    </Form>
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
      <Form as="div">
        <Heading>Check your email</Heading>
        <p role="status" style={{ margin: 0 }}>
          If an account exists for <b>{sentTo}</b>, we've sent a link to reset
          your password.
        </p>
        <Actions>
          <Button primary onClick={() => onNavigate('login')}>
            Back to login
          </Button>
        </Actions>
      </Form>
    );
  }

  return (
    <Form noValidate onSubmit={form.handleSubmit} aria-label="Reset password">
      <Heading>Reset password</Heading>
      <p style={{ margin: 0 }}>
        Enter your email and we'll send you a link to reset your password.
      </p>
      <TextField
        label="Email"
        type="email"
        autoComplete="email"
        autoFocus
        {...form.field('email')}
      />
      <FormError>{form.formError}</FormError>
      <Actions>
        <Button type="button" onClick={() => onNavigate('login')}>
          Back to login
        </Button>
        <Button type="submit" primary disabled={form.pending}>
          {form.pending ? 'Sending...' : 'Send reset link'}
        </Button>
      </Actions>
    </Form>
  );
}
