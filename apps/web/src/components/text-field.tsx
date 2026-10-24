import { forwardRef, useId, type ReactNode } from 'react';
import { TextInput, type TextInputProps } from 'react95';
import styled from 'styled-components';

const Field = styled.div`
  display: flex;
  flex-direction: column;
  gap: 4px;
`;

const Row = styled.div`
  display: flex;
  align-items: center;
  gap: 4px;
`;

const Message = styled.div<{ $error?: boolean }>`
  font-size: 14px;
  color: ${({ $error, theme }) => ($error ? '#c00' : theme.materialTextDisabled)};
`;

export type TextFieldProps = {
  label: string;
  /** Validation message, shown under the hint and announced with the input. */
  error?: string;
  hint?: ReactNode;
  /** Rendered next to the input, e.g. a show/hide toggle. */
  adornment?: ReactNode;
} & Omit<
  Extract<TextInputProps, { multiline?: false }>,
  'multiline' | 'fullWidth'
>;

export const TextField = forwardRef<HTMLInputElement, TextFieldProps>(
  function TextField(
    { label, error, hint, adornment, id, ...inputProps },
    ref,
  ) {
    const generatedId = useId();
    const inputId = id ?? generatedId;
    const hintId = `${inputId}-hint`;
    const errorId = `${inputId}-error`;
    const describedBy =
      [hint && hintId, error && errorId].filter(Boolean).join(' ') || undefined;

    return (
      <Field>
        <label htmlFor={inputId}>{label}</label>
        <Row>
          <TextInput
            {...inputProps}
            ref={ref}
            id={inputId}
            fullWidth
            aria-invalid={error ? true : undefined}
            aria-describedby={describedBy}
          />
          {adornment}
        </Row>
        {hint && <Message id={hintId}>{hint}</Message>}
        {error && (
          <Message id={errorId} $error>
            {error}
          </Message>
        )}
      </Field>
    );
  },
);
