import { useState } from 'react';
import { Button } from 'react95';
import { TextField, type TextFieldProps } from './text-field';

export function PasswordField(
  props: Omit<TextFieldProps, 'type' | 'adornment'>,
) {
  const [visible, setVisible] = useState(false);

  return (
    <TextField
      {...props}
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
}
