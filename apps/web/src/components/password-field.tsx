import { forwardRef, useState } from 'react';
import { Button } from 'react95';
import { TextField, type TextFieldProps } from './text-field';

export type PasswordFieldProps = Omit<TextFieldProps, 'type' | 'adornment'>;

export const PasswordField = forwardRef<HTMLInputElement, PasswordFieldProps>(
  function PasswordField(props, ref) {
    const [visible, setVisible] = useState(false);

    return (
      <TextField
        {...props}
        ref={ref}
        type={visible ? 'text' : 'password'}
        adornment={
          <Button
            type="button"
            style={{ minWidth: 64 }}
            aria-label={visible ? 'Hide password' : 'Show password'}
            aria-pressed={visible}
            onClick={() => setVisible((v) => !v)}
          >
            {visible ? 'Hide' : 'Show'}
          </Button>
        }
      />
    );
  },
);
