import { useId, type ReactNode } from 'react';
import { TextInput, type TextInputProps } from 'react95';
import styled from 'styled-components';

/**
 * Label beside the control, Win95 dialog style; stacks again on phones. The
 * label column width comes from `--label-width` so a form can align its
 * labels.
 */
const Grid = styled.div`
  display: flex;
  flex-direction: column;
  gap: 4px;

  @media (min-width: 480px) {
    display: grid;
    grid-template-columns: var(--label-width, 140px) minmax(0, 1fr);
    align-items: center;
    column-gap: 8px;

    & > :not(label) {
      grid-column: 2;
    }
  }
`;

const Controls = styled.div`
  display: flex;
  align-items: center;
  gap: 4px;
`;

const Message = styled.div<{ $error?: boolean }>`
  font-size: 14px;
  color: ${({ $error, theme }) => ($error ? '#c00' : theme.materialTextDisabled)};
`;

/** A labelled row for any control; `children` receives the id to put on it. */
export function FieldRow({
  label,
  id,
  children,
}: {
  label: string;
  id: string;
  children: ReactNode;
}) {
  return (
    <Grid>
      <label htmlFor={id}>{label}</label>
      {children}
    </Grid>
  );
}

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

export function TextField({
  label,
  error,
  hint,
  adornment,
  id,
  ...inputProps
}: TextFieldProps) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const hintId = `${inputId}-hint`;
  const errorId = `${inputId}-error`;
  const describedBy =
    [hint && hintId, error && errorId].filter(Boolean).join(' ') || undefined;

  return (
    <FieldRow label={label} id={inputId}>
      <Controls>
        <TextInput
          {...inputProps}
          id={inputId}
          fullWidth
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
        />
        {adornment}
      </Controls>
      {hint && <Message id={hintId}>{hint}</Message>}
      {error && (
        <Message id={errorId} $error>
          {error}
        </Message>
      )}
    </FieldRow>
  );
}
