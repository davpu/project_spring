import { fireEvent, render, screen } from '@testing-library/react';
import { Providers } from '../providers';
import { SessionProvider } from '../session';
import { SpringApp } from './spring-app';

const type = (label: RegExp | string, value: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } });

describe('SpringApp', () => {
  beforeEach(() => {
    render(
      <Providers>
        <SessionProvider>
          <SpringApp />
        </SessionProvider>
      </Providers>,
    );
  });

  it('shows validation errors only after submitting', () => {
    expect(screen.queryByText('Enter a valid email address')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'OK' }));
    expect(screen.getByText('Enter a valid email address')).toBeTruthy();
    expect(screen.getByText('Enter your password')).toBeTruthy();
  });

  it('signs up, logs out and logs back in', async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Sign Up...' }));
    type('Email:', 'gardener@example.com');
    type('Password:', 'Sunflower7');
    type('Confirm password:', 'Sunflower8');
    fireEvent.click(screen.getByRole('button', { name: 'OK' }));
    expect(screen.getByText('Passwords do not match')).toBeTruthy();

    type('Confirm password:', 'Sunflower7');
    fireEvent.click(screen.getByRole('button', { name: 'OK' }));
    expect(await screen.findByText('gardener@example.com')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Log out' }));
    type('Email:', 'gardener@example.com');
    type('Password:', 'wrong');
    fireEvent.click(screen.getByRole('button', { name: 'OK' }));
    expect((await screen.findByRole('alert')).textContent).toBe(
      'Invalid email or password.',
    );

    type('Password:', 'Sunflower7');
    fireEvent.click(screen.getByRole('button', { name: 'OK' }));
    expect(await screen.findByText('gardener@example.com')).toBeTruthy();
  });

  it('confirms a reset request without revealing whether the account exists', async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Forgot password?' }));
    type('Email:', 'nobody@example.com');
    fireEvent.click(screen.getByRole('button', { name: 'OK' }));
    expect((await screen.findByRole('status')).textContent).toContain(
      'If an account exists for nobody@example.com',
    );

    fireEvent.click(screen.getByRole('button', { name: 'OK' }));
    expect(screen.getByRole('form', { name: 'Log in' })).toBeTruthy();
  });

  it('goes back to login on Cancel', () => {
    fireEvent.click(screen.getByRole('button', { name: 'Sign Up...' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.getByRole('form', { name: 'Log in' })).toBeTruthy();
  });

  it('has no Cancel on login outside a desktop window', () => {
    expect(screen.queryByRole('button', { name: 'Cancel' })).toBeNull();
  });
});
