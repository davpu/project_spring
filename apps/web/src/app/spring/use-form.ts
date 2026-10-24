import { useState } from 'react';
import type { z } from 'zod';
import { AuthError } from './auth-api';

type Errors<T> = Partial<Record<keyof T, string>>;

/**
 * Minimal form state for the auth screens: values, per-field errors from a
 * zod schema, and a submit handler. Fields are re-validated as you type only
 * after the first submit, so an empty form doesn't start out red.
 */
export function useForm<
  S extends z.ZodType<Record<string, unknown>, Record<string, string>>,
>(
  schema: S,
  initial: z.input<S>,
  onSubmit: (values: z.output<S>) => Promise<void>,
) {
  type Values = z.input<S>;
  const [values, setValues] = useState<Values>(initial);
  const [errors, setErrors] = useState<Errors<Values>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [pending, setPending] = useState(false);

  const validate = (next: Values) => {
    const result = schema.safeParse(next);
    const fieldErrors: Errors<Values> = {};
    for (const issue of result.error?.issues ?? []) {
      const key = issue.path[0] as keyof Values;
      fieldErrors[key] ??= issue.message;
    }
    setErrors(fieldErrors);
    return result;
  };

  const field = (name: keyof Values & string) => ({
    name,
    value: String(values[name] ?? ''),
    error: errors[name],
    onChange: (e: { target: { value: string } }) => {
      const next: Values = Object.assign({}, values, {
        [name]: e.target.value,
      });
      setValues(next);
      if (submitted) validate(next);
    },
  });

  const handleSubmit = async (e: { preventDefault: () => void }) => {
    e.preventDefault();
    setSubmitted(true);
    setFormError(null);
    const result = validate(values);
    if (!result.success) return;
    setPending(true);
    try {
      await onSubmit(result.data);
    } catch (err) {
      setFormError(
        err instanceof AuthError ? err.message : 'Something went wrong.',
      );
    } finally {
      setPending(false);
    }
  };

  return { values, field, handleSubmit, formError, pending };
}
