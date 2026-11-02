import { mockApi } from '../../test/mock-api';
import { ApiError, describeError, onUnauthorized, request } from './client';

describe('request', () => {
  let restore: () => void;
  afterEach(() => {
    restore();
    onUnauthorized(null);
  });

  it('sends JSON and returns the parsed body', async () => {
    const api = mockApi(() => ({ body: { id: '1' } }));
    restore = api.restore;

    const result = await request<{ id: string }>('/things', {
      method: 'POST',
      body: { name: 'x' },
    });

    expect(result).toEqual({ id: '1' });
    expect(api.calls).toEqual([
      { method: 'POST', path: '/things', body: { name: 'x' } },
    ]);
  });

  it('returns undefined for an empty 204', async () => {
    restore = mockApi(() => ({ status: 204 })).restore;
    await expect(
      request('/things/1', { method: 'DELETE' }),
    ).resolves.toBeUndefined();
  });

  it('throws an ApiError carrying the message and the field issues', async () => {
    restore = mockApi(() => ({
      status: 400,
      body: {
        statusCode: 400,
        message: 'Validation failed',
        issues: [{ path: 'password', message: 'Too short' }, 'junk'],
      },
    })).restore;

    const error = await request('/auth/register', {
      method: 'POST',
      body: {},
    }).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({
      status: 400,
      message: 'Validation failed',
      issues: [{ path: 'password', message: 'Too short' }],
    });
  });

  it('tells the session about a 401, except on login', async () => {
    const handler = vi.fn();
    onUnauthorized(handler);
    restore = mockApi(() => ({
      status: 401,
      body: { statusCode: 401, message: 'Unauthorized' },
    })).restore;

    await request('/planters').catch(() => undefined);
    expect(handler).toHaveBeenCalledTimes(1);

    await request('/auth/login', { method: 'POST', body: {} }).catch(
      () => undefined,
    );
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('turns a network failure into a readable error', async () => {
    const original = globalThis.fetch;
    globalThis.fetch = (() =>
      Promise.reject(new TypeError('failed'))) as typeof fetch;
    restore = () => {
      globalThis.fetch = original;
    };

    await expect(request('/planters')).rejects.toMatchObject({
      status: 0,
      message: expect.stringContaining('Cannot reach the server'),
    });
  });
});

describe('describeError', () => {
  it('has friendly wording for rate limits and unknown errors', () => {
    expect(describeError(new ApiError(429, 'ThrottlerException'))).toMatch(
      /Too many attempts/,
    );
    expect(describeError(new ApiError(401, 'Invalid email or password'))).toBe(
      'Invalid email or password',
    );
    expect(describeError(new Error('boom'))).toBe('Something went wrong.');
  });
});
