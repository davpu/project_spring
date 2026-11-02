import { useState } from 'react';
import { z } from 'zod';
import { ApiError, describeError } from '../app/api/client';
import { trackBusy } from './busy';

type Errors<T> = Partial<Record<keyof T, string>>;

/**
 * A required, trimmed, length-limited text field with messages written for
 * people. The API checks the same limits with zod's default wording.
 */
export const requiredText = (what: string, max: number) =>
  z
    .string()
    .trim()
    .min(1, `Enter ${what}`)
    .max(max, `At most ${max} characters`);

/**
 * Minimal form state: values, per-field errors from a zod schema, and a submit
 * handler. Fields are re-validated as you type only after the first submit, so
 * an empty form doesn't start out red. A 400 from the API that names fields is
 * shown under those fields; anything else becomes `formError`.
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
      // The hourglass shows while the user waits on a submit.
      await trackBusy(() => onSubmit(result.data));
    } catch (err) {
      const fieldErrors: Errors<Values> = {};
      if (err instanceof ApiError && err.status === 400) {
        for (const issue of err.issues) {
          const key = issue.path.split('.')[0] as keyof Values;
          if (key in (values as object)) fieldErrors[key] ??= issue.message;
        }
      }
      if (Object.keys(fieldErrors).length > 0) setErrors(fieldErrors);
      else if (err instanceof ApiError && err.issues[0]) {
        // A 400 about something the form has no field for (e.g. the token).
        setFormError(err.issues[0].message);
      } else setFormError(describeError(err));
    } finally {
      setPending(false);
    }
  };

  return { values, field, handleSubmit, formError, pending };
}
