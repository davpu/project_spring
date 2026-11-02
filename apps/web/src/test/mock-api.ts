/**
 * Replaces `fetch` for a test with a hand-written fake of the API. The handler
 * sees the path without the `/api` prefix (query string included) and answers
 * with a status and a JSON body, or returns nothing for a 404.
 */

export type MockRequest = {
  method: string;
  path: string;
  body: unknown;
};

export type MockResponse = { status?: number; body?: unknown };

export type MockHandler = (request: MockRequest) => MockResponse | undefined;

export function mockApi(handler: MockHandler) {
  const calls: MockRequest[] = [];
  const original = globalThis.fetch;

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input), 'http://localhost');
    const request: MockRequest = {
      method: init?.method ?? 'GET',
      path: url.pathname.replace(/^\/api/, '') + url.search,
      body: typeof init?.body === 'string' ? JSON.parse(init.body) : undefined,
    };
    calls.push(request);
    const response = handler(request) ?? {
      status: 404,
      body: { statusCode: 404, message: 'Not found' },
    };
    const status = response.status ?? 200;
    const noBody = response.body === undefined || status === 204;
    return new Response(noBody ? null : JSON.stringify(response.body), {
      status,
    });
  }) as typeof fetch;

  return {
    calls,
    restore: () => {
      globalThis.fetch = original;
    },
  };
}
