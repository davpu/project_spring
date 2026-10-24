import { forwardRef, useId, type ReactNode } from 'react';
import { TextInput, type TextInputProps } from 'react95';
import styled from 'styled-components';

const Field = styled.div<{ $inline: boolean }>`
  display: flex;
  flex-direction: column;
  gap: 4px;

  /* Label beside the input, Win95 dialog style; stacks again on phones. */
  ${({ $inline }) =>
    $inline &&
    `
    @media (min-width: 480px) {
      display: grid;
      grid-template-columns: var(--label-width, 140px) minmax(0, 1fr);
      align-items: center;
      column-gap: 8px;

      & > :not(label) {
        grid-column: 2;
      }
    }
  `}
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
  /**
   * Puts the label to the left of the input. Width comes from the
   * `--label-width` custom property so a form can align all its labels.
   */
  inline?: boolean;
} & Omit<
  Extract<TextInputProps, { multiline?: false }>,
  'multiline' | 'fullWidth'
>;

export const TextField = forwardRef<HTMLInputElement, TextFieldProps>(
  function TextField(
    { label, error, hint, adornment, inline = false, id, ...inputProps },
    ref,
  ) {
    const generatedId = useId();
    const inputId = id ?? generatedId;
    const hintId = `${inputId}-hint`;
    const errorId = `${inputId}-error`;
    const describedBy =
      [hint && hintId, error && errorId].filter(Boolean).join(' ') || undefined;

    return (
      <Field $inline={inline}>
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
