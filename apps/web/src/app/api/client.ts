/**
 * Thin wrapper over `fetch` for the REST API. Everything is same-origin (in
 * production behind the reverse proxy, in development through the Vite proxy),
 * so the `session` cookie travels by itself and there is no CORS to handle.
 */

export type ApiIssue = { path: string; message: string };

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly issues: ApiIssue[] = [],
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

let unauthorizedHandler: (() => void) | null = null;

/** Called when a request comes back 401, so the session can drop the user. */
export function onUnauthorized(handler: (() => void) | null): void {
  unauthorizedHandler = handler;
}

type Options = {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  body?: unknown;
  signal?: AbortSignal;
};

type ErrorBody = {
  message?: unknown;
  issues?: unknown;
};

function readIssues(value: unknown): ApiIssue[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (typeof item !== 'object' || item === null) return [];
    const { path, message } = item as Record<string, unknown>;
    return typeof path === 'string' && typeof message === 'string'
      ? [{ path, message }]
      : [];
  });
}

export async function request<T>(
  path: string,
  { method = 'GET', body, signal }: Options = {},
): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      method,
      headers:
        body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      credentials: 'same-origin',
      signal,
    });
  } catch (err) {
    if (signal?.aborted) throw err;
    throw new ApiError(
      0,
      'Cannot reach the server. Check your connection and try again.',
    );
  }

  const text = await res.text();

  if (!res.ok) {
    let parsed: ErrorBody = {};
    try {
      parsed = text ? (JSON.parse(text) as ErrorBody) : {};
    } catch {
      // A proxy error page, not JSON; fall back to the status text below.
    }
    if (res.status === 401 && path !== '/auth/login') unauthorizedHandler?.();
    const message =
      typeof parsed.message === 'string' && parsed.message
        ? parsed.message
        : `Request failed (${res.status})`;
    throw new ApiError(res.status, message, readIssues(parsed.issues));
  }

  // 202 and 204 carry no body.
  return (text ? JSON.parse(text) : undefined) as T;
}

/** A sentence that can be shown to the user as is. */
export function describeError(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.status === 429) return 'Too many attempts. Try again in a minute.';
    if (err.status === 503) return 'The service is temporarily unavailable.';
    return err.message;
  }
  return 'Something went wrong.';
}
