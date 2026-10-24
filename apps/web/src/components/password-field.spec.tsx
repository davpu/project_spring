import { fireEvent, render, screen } from '@testing-library/react';
import { Providers } from '../app/providers';
import { PasswordField } from './password-field';

describe('PasswordField', () => {
  const renderField = (props: { error?: string } = {}) =>
    render(
      <Providers>
        <PasswordField label="Password" hint="Keep it secret" {...props} />
      </Providers>,
    );

  it('masks the value until Show is pressed', () => {
    renderField();
    const input = screen.getByLabelText('Password');
    expect(input.getAttribute('type')).toBe('password');

    fireEvent.click(screen.getByRole('button', { name: 'Show password' }));
    expect(input.getAttribute('type')).toBe('text');

    fireEvent.click(screen.getByRole('button', { name: 'Hide password' }));
    expect(input.getAttribute('type')).toBe('password');
  });

  it('describes the input with its hint and error', () => {
    renderField({ error: 'Too short' });
    const input = screen.getByLabelText('Password');
    expect(input.getAttribute('aria-invalid')).toBe('true');
    expect(
      input
        .getAttribute('aria-describedby')
        ?.split(' ')
        .map((id) => document.getElementById(id)?.textContent),
    ).toEqual(['Keep it secret', 'Too short']);
  });
});
