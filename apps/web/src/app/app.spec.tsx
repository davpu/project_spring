import { act, fireEvent, screen, within } from '@testing-library/react';
import type { GatewayDto, PlanterDetailDto } from '@org/shared';
import {
  USER,
  emptyLists,
  gateway,
  minutesAgo,
  openSpring,
  planter,
  renderApp,
  startApi,
  type,
} from '../test/render-app';

let restore: () => void = () => undefined;
afterEach(() => {
  restore();
  localStorage.clear();
  vi.useRealTimers();
});

describe('desktop', () => {
  beforeEach(() => {
    restore = startApi(() => undefined, false).restore;
  });

  it('renders the desktop icons and the Start button', () => {
    renderApp();
    expect(screen.getByText('My Computer')).toBeTruthy();
    expect(screen.getByText('Recycle Bin')).toBeTruthy();
    expect(screen.getByText('Spring')).toBeTruthy();
    expect(screen.getByRole('button', { name: /start/i })).toBeTruthy();
  });

  it('opens a window on double click and closes it again', () => {
    renderApp();
    fireEvent.doubleClick(screen.getByText('Recycle Bin'));
    expect(screen.getByRole('dialog', { name: 'Recycle Bin' })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(screen.queryByRole('dialog', { name: 'Recycle Bin' })).toBeNull();
  });

  it('toggles the Start menu', () => {
    renderApp();
    fireEvent.click(screen.getByRole('button', { name: /start/i }));
    expect(screen.getByText('Shut Down...')).toBeTruthy();
  });

  it('titles the Spring window as a logon dialog until you log in', async () => {
    renderApp();
    fireEvent.doubleClick(screen.getByText('Spring'));
    expect(
      await screen.findByRole('dialog', { name: 'Welcome to Spring' }),
    ).toBeTruthy();
    expect(await screen.findByRole('form', { name: 'Log in' })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(
      screen.queryByRole('dialog', { name: 'Welcome to Spring' }),
    ).toBeNull();
  });
});

describe('logon', () => {
  it('shows validation errors only after submitting', async () => {
    restore = startApi(() => undefined, false).restore;
    renderApp();
    await openSpring();
    await screen.findByRole('form', { name: 'Log in' });

    expect(screen.queryByText('Enter a valid email address')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'OK' }));
    expect(screen.getByText('Enter a valid email address')).toBeTruthy();
    expect(screen.getByText('Enter your password')).toBeTruthy();
  });

  it('shows what the API says about a wrong password', async () => {
    restore = startApi(
      ({ method, path }) =>
        method === 'POST' && path === '/auth/login'
          ? {
              status: 401,
              body: { statusCode: 401, message: 'Invalid email or password' },
            }
          : undefined,
      false,
    ).restore;
    renderApp();
    await openSpring();
    await screen.findByRole('form', { name: 'Log in' });

    type('Email:', 'gardener@example.com');
    type('Password:', 'wrong');
    fireEvent.click(screen.getByRole('button', { name: 'OK' }));

    expect((await screen.findByRole('alert')).textContent).toBe(
      'Invalid email or password',
    );
  });

  it('signs up, lands in the app and logs out again', async () => {
    const api = startApi(({ method, path }) => {
      if (method === 'POST' && path === '/auth/register') {
        return { status: 201, body: USER };
      }
      return emptyLists({ method, path, body: undefined });
    }, false);
    restore = api.restore;
    renderApp();
    await openSpring();
    await screen.findByRole('form', { name: 'Log in' });

    fireEvent.click(screen.getByRole('button', { name: 'Sign Up...' }));
    type('Email:', ' Gardener@Example.com ');
    type('Password:', 'Sunflower7');
    type('Confirm password:', 'Sunflower8');
    fireEvent.click(screen.getByRole('button', { name: 'OK' }));
    expect(screen.getByText('Passwords do not match')).toBeTruthy();

    type('Confirm password:', 'Sunflower7');
    fireEvent.click(screen.getByRole('button', { name: 'OK' }));

    expect(await screen.findByText('Pair your first gateway')).toBeTruthy();
    expect(screen.getByRole('dialog', { name: 'Spring' })).toBeTruthy();
    expect(api.calls).toContainEqual({
      method: 'POST',
      path: '/auth/register',
      body: { email: 'gardener@example.com', password: 'Sunflower7' },
    });

    fireEvent.click(screen.getByRole('button', { name: 'Log out' }));
    expect(await screen.findByRole('form', { name: 'Log in' })).toBeTruthy();
  });

  it('logs in and lands in the app', async () => {
    const api = startApi(({ method, path }) => {
      if (method === 'POST' && path === '/auth/login') return { body: USER };
      return emptyLists({ method, path, body: undefined });
    }, false);
    restore = api.restore;
    renderApp();
    await openSpring();
    await screen.findByRole('form', { name: 'Log in' });

    type('Email:', 'gardener@example.com');
    type('Password:', 'Sunflower7');
    fireEvent.click(screen.getByRole('button', { name: 'OK' }));

    expect(await screen.findByText('Pair your first gateway')).toBeTruthy();
    expect(api.calls).toContainEqual({
      method: 'POST',
      path: '/auth/login',
      body: { email: 'gardener@example.com', password: 'Sunflower7' },
    });
  });

  it('goes back to login when sign-up is cancelled', async () => {
    restore = startApi(() => undefined, false).restore;
    renderApp();
    await openSpring();
    await screen.findByRole('form', { name: 'Log in' });
    fireEvent.click(screen.getByRole('button', { name: 'Sign Up...' }));
    expect(screen.getByRole('form', { name: 'Sign up' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.getByRole('form', { name: 'Log in' })).toBeTruthy();
  });

  it('confirms a reset request without revealing whether the account exists', async () => {
    restore = startApi(
      ({ method, path }) =>
        method === 'POST' && path === '/auth/forgot-password'
          ? { status: 202 }
          : undefined,
      false,
    ).restore;
    renderApp();
    await openSpring();
    await screen.findByRole('form', { name: 'Log in' });

    fireEvent.click(screen.getByRole('button', { name: 'Forgot password?' }));
    type('Email:', 'nobody@example.com');
    fireEvent.click(screen.getByRole('button', { name: 'OK' }));

    expect(await screen.findByText(/If an account exists for/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'OK' }));
    expect(screen.getByRole('form', { name: 'Log in' })).toBeTruthy();
  });

  it('opens the Spring window on the reset link and sets a new password', async () => {
    const api = startApi(
      ({ method, path }) =>
        method === 'POST' && path === '/auth/reset-password'
          ? { status: 204 }
          : undefined,
      false,
    );
    restore = api.restore;
    renderApp('/reset-password?token=abc123');

    const form = await screen.findByRole('form', { name: 'New password' });
    expect(form).toBeTruthy();
    type('New password:', 'Sunflower7');
    type('Confirm password:', 'Sunflower7');
    fireEvent.click(screen.getByRole('button', { name: 'OK' }));

    expect(await screen.findByRole('form', { name: 'Log in' })).toBeTruthy();
    expect(screen.getByRole('status').textContent).toContain(
      'Password updated',
    );
    expect(api.calls).toContainEqual({
      method: 'POST',
      path: '/auth/reset-password',
      body: { token: 'abc123', password: 'Sunflower7' },
    });
  });

  it('shows the API message for a used or expired reset link, and cancels back to login quietly', async () => {
    restore = startApi(
      ({ method, path }) =>
        method === 'POST' && path === '/auth/reset-password'
          ? {
              status: 400,
              body: {
                statusCode: 400,
                message: 'Invalid or expired reset link',
              },
            }
          : undefined,
      false,
    ).restore;
    renderApp('/reset-password?token=stale');
    await screen.findByRole('form', { name: 'New password' });

    type('New password:', 'Sunflower7');
    type('Confirm password:', 'Sunflower7');
    fireEvent.click(screen.getByRole('button', { name: 'OK' }));
    expect((await screen.findByRole('alert')).textContent).toBe(
      'Invalid or expired reset link',
    );

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(await screen.findByRole('form', { name: 'Log in' })).toBeTruthy();
    expect(screen.queryByText(/Password updated/)).toBeNull();
  });

  it('explains a reset link that has no token', async () => {
    restore = startApi(() => undefined, false).restore;
    renderApp('/reset-password');
    expect((await screen.findByRole('alert')).textContent).toContain(
      'incomplete',
    );
  });
});

describe('signed in', () => {
  /** Opens the Spring window and switches to a tab. */
  const openTab = async (tab: 'Planters' | 'Gateways') => {
    await openSpring();
    fireEvent.click(await screen.findByRole('tab', { name: tab }));
  };

  it('asks for a first gateway when there is none', async () => {
    restore = startApi(emptyLists).restore;
    renderApp();
    await openSpring();
    expect(await screen.findByText('Pair your first gateway')).toBeTruthy();
    // The button jumps to the Gateways tab with the pairing dialog open.
    fireEvent.click(screen.getByRole('button', { name: 'Pair a gateway...' }));
    expect(
      await screen.findByRole('dialog', { name: 'Pair a gateway' }),
    ).toBeTruthy();
  });

  it('flags a dry planter on the dashboard and opens its detail', async () => {
    restore = startApi(({ method, path }) => {
      if (method !== 'GET') return undefined;
      if (path === '/planters') {
        return {
          body: [
            planter(),
            planter({
              id: 'p2',
              name: 'Mint pot',
              latest: { soilHumidity: { value: 61, time: minutesAgo(1) } },
            }),
          ],
        };
      }
      if (path === '/gateways') return { body: [gateway()] };
      if (path === '/planters/p1')
        return { body: { ...planter(), plants: [] } };
      if (path.startsWith('/planters/p1/readings')) {
        return {
          body: {
            metric: 'soilHumidity',
            bucket: 'raw',
            from: '',
            to: '',
            points: [],
          },
        };
      }
      return undefined;
    }).restore;
    renderApp();
    await openSpring();

    // The dry planter is named twice: under "Needs attention" and in the table.
    const rowOf = (name: string) =>
      screen
        .getAllByText(name)
        .map((el) => el.closest('tr'))
        .find((row): row is HTMLTableRowElement => row !== null);
    await screen.findAllByText('Basil box');
    const basilRow = rowOf('Basil box');
    const mintRow = rowOf('Mint pot');
    // Basil is at 22 %, below the default limit of 30 %; mint is fine.
    expect(
      within(basilRow as HTMLElement).getByText('Needs water'),
    ).toBeTruthy();
    expect(within(mintRow as HTMLElement).getByText('Healthy')).toBeTruthy();
    expect(screen.getByText('1 of 1')).toBeTruthy();

    fireEvent.click(
      within(basilRow as HTMLElement).getByRole('button', { name: 'Detail' }),
    );
    expect(await screen.findByRole('group', { name: 'Metric' })).toBeTruthy();
    expect(
      screen.getByRole('button', { name: '← Back to planters' }),
    ).toBeTruthy();
  });

  it('warns about an offline gateway but not about one still being set up', async () => {
    restore = startApi(({ method, path }) => {
      if (method !== 'GET') return undefined;
      if (path === '/planters') return { body: [] };
      if (path === '/gateways') {
        return {
          body: [
            gateway({ lastSeenAt: minutesAgo(120) }),
            gateway({ id: 'g2', name: 'Kitchen', lastSeenAt: null }),
          ],
        };
      }
      return undefined;
    }).restore;
    renderApp();
    await openSpring();
    expect(await screen.findByText('Gateway offline')).toBeTruthy();
    expect(screen.getAllByText('Gateway offline')).toHaveLength(1);
    expect(screen.getByText('0 of 2')).toBeTruthy();
  });

  it('drops to the logon dialog when the session expires', async () => {
    restore = startApi(({ method, path }) =>
      method === 'GET' && (path === '/planters' || path === '/gateways')
        ? { status: 401, body: { statusCode: 401, message: 'Unauthorized' } }
        : undefined,
    ).restore;
    renderApp();
    await openSpring();
    expect(await screen.findByRole('form', { name: 'Log in' })).toBeTruthy();
  });

  it('keeps the confirm dialog open and shows the error when deleting fails', async () => {
    restore = startApi(({ method, path }) => {
      if (method === 'GET' && path === '/planters')
        return { body: [planter()] };
      if (method === 'GET' && path === '/gateways')
        return { body: [gateway()] };
      if (method === 'DELETE' && path === '/planters/p1') {
        return { status: 503, body: { statusCode: 503, message: 'down' } };
      }
      return undefined;
    }).restore;
    renderApp();
    await openTab('Planters');

    const row = (await screen.findByText('Basil box')).closest('tr');
    fireEvent.click(
      within(row as HTMLElement).getByRole('button', { name: 'Delete' }),
    );
    const dialog = screen.getByRole('dialog', { name: 'Delete planter' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete' }));

    expect((await within(dialog).findByRole('alert')).textContent).toContain(
      'temporarily unavailable',
    );
    expect(
      within(dialog).getByRole('button', { name: 'Delete' }),
    ).not.toHaveProperty('disabled', true);
    // The planter is still listed (the dialog names it too).
    expect(row?.isConnected).toBe(true);
  });

  it('deletes a planter after confirming', async () => {
    let planters = [planter()];
    const api = startApi(({ method, path }) => {
      if (method === 'GET' && path === '/planters') return { body: planters };
      if (method === 'GET' && path === '/gateways')
        return { body: [gateway()] };
      if (method === 'DELETE' && path === '/planters/p1') {
        planters = [];
        return { status: 204 };
      }
      return undefined;
    });
    restore = api.restore;
    renderApp();
    await openTab('Planters');

    const row = (await screen.findByText('Basil box')).closest('tr');
    fireEvent.click(
      within(row as HTMLElement).getByRole('button', { name: 'Delete' }),
    );
    const dialog = screen.getByRole('dialog', { name: 'Delete planter' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete' }));

    expect(await screen.findByText('No planters yet')).toBeTruthy();
    expect(screen.queryByRole('dialog', { name: 'Delete planter' })).toBeNull();
    expect(api.calls).toContainEqual({
      method: 'DELETE',
      path: '/planters/p1',
      body: undefined,
    });
  });

  it('shows a planter with its chart and plants, and adds a plant', async () => {
    const detail: PlanterDetailDto = {
      ...planter(),
      plants: [
        {
          id: 'pl1',
          planterId: 'p1',
          species: 'Basil',
          lifecycle: 'annual',
          plantedAt: '2026-05-01',
          createdAt: minutesAgo(5000),
        },
      ],
    };
    const api = startApi(({ method, path }) => {
      if (method === 'GET' && path === '/planters')
        return { body: [planter()] };
      if (method === 'GET' && path === '/gateways')
        return { body: [gateway()] };
      if (method === 'GET' && path === '/planters/p1') return { body: detail };
      if (method === 'GET' && path.startsWith('/planters/p1/readings')) {
        return {
          body: {
            metric: 'soilHumidity',
            bucket: 'raw',
            from: minutesAgo(60),
            to: minutesAgo(0),
            points: [30, 28, 25].map((avg, i) => ({
              time: minutesAgo(40 - i * 10),
              avg,
              min: avg,
              max: avg,
              samples: 1,
            })),
          },
        };
      }
      if (method === 'POST' && path === '/planters/p1/plants') {
        return {
          status: 201,
          body: {
            ...detail.plants[0],
            id: 'pl2',
            species: 'Mint',
            lifecycle: 'perennial',
            plantedAt: null,
          },
        };
      }
      return undefined;
    });
    restore = api.restore;
    renderApp();
    await openTab('Planters');
    fireEvent.click(await screen.findByRole('button', { name: 'Detail' }));

    expect(
      await screen.findByRole('img', {
        name: 'Soil moisture chart with 3 points',
      }),
    ).toBeTruthy();
    expect(screen.getByText('Basil')).toBeTruthy();

    // The chart asks for the last 24 hours of soil moisture by default...
    const readingCalls = () =>
      api.calls.filter((c) => c.path.startsWith('/planters/p1/readings?'));
    const first = new URLSearchParams(readingCalls()[0].path.split('?')[1]);
    expect(first.get('metric')).toBe('soilHumidity');
    expect(first.get('bucket')).toBeNull();
    const hours = (q: URLSearchParams) =>
      (Date.parse(q.get('to') ?? '') - Date.parse(q.get('from') ?? '')) /
      3_600_000;
    expect(hours(first)).toBeCloseTo(24, 1);

    // ...and a new range or metric issues a new request.
    fireEvent.click(screen.getByRole('button', { name: '7 days' }));
    await vi.waitFor(() => expect(readingCalls()).toHaveLength(2));
    expect(
      hours(new URLSearchParams(readingCalls()[1].path.split('?')[1])),
    ).toBeCloseTo(24 * 7, 1);
    fireEvent.click(screen.getByRole('button', { name: 'Air temperature' }));
    await vi.waitFor(() => expect(readingCalls()).toHaveLength(3));
    expect(readingCalls()[2].path).toContain('metric=airTemperature');

    fireEvent.click(screen.getByRole('button', { name: 'Add plant...' }));
    const dialog = screen.getByRole('dialog', { name: 'Add a plant' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Add' }));
    expect(within(dialog).getByText('Enter the species')).toBeTruthy();

    fireEvent.change(within(dialog).getByLabelText('Species:'), {
      target: { value: 'Mint' },
    });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Add' }));

    await vi.waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'Add a plant' })).toBeNull(),
    );
    expect(api.calls).toContainEqual({
      method: 'POST',
      path: '/planters/p1/plants',
      body: { species: 'Mint', lifecycle: 'perennial', plantedAt: null },
    });
  });

  it('remembers a moisture limit per planter', async () => {
    restore = startApi(({ method, path }) => {
      if (method === 'GET' && path === '/planters')
        return { body: [planter()] };
      if (method === 'GET' && path === '/gateways')
        return { body: [gateway()] };
      if (method === 'GET' && path === '/planters/p1') {
        return { body: { ...planter(), plants: [] } };
      }
      if (method === 'GET' && path.startsWith('/planters/p1/readings')) {
        return {
          body: {
            metric: 'soilHumidity',
            bucket: 'raw',
            from: '',
            to: '',
            points: [],
          },
        };
      }
      return undefined;
    }).restore;
    renderApp();
    await openTab('Planters');
    fireEvent.click(await screen.findByRole('button', { name: 'Detail' }));

    const input = await screen.findByLabelText('Moisture limit');
    // 22 % soil is below the default 30 % limit...
    expect(screen.getByText('Needs water')).toBeTruthy();
    expect(screen.queryByText('Healthy')).toBeNull();

    fireEvent.change(input, { target: { value: '15' } });

    // ...and above the new 15 % limit.
    expect(localStorage.getItem('spring:threshold:p1')).toBe('15');
    expect(screen.getByText('Healthy')).toBeTruthy();
    expect(screen.queryByText('Needs water')).toBeNull();
  });

  /** A pairing API whose code status the test flips while polling. */
  function pairingApi() {
    const state = {
      status: 'pending' as 'pending' | 'redeemed' | 'expired',
      gateways: [] as GatewayDto[],
    };
    const api = startApi(({ method, path }) => {
      if (method === 'GET' && path === '/gateways')
        return { body: state.gateways };
      if (method === 'GET' && path === '/planters') return { body: [] };
      if (method === 'POST' && path === '/pairing-codes') {
        return {
          status: 201,
          body: {
            id: 'c1',
            code: 'ABCD-2345',
            expiresAt: new Date(Date.now() + 600_000).toISOString(),
          },
        };
      }
      if (method === 'GET' && path === '/pairing-codes/c1') {
        return {
          body:
            state.status === 'redeemed'
              ? { status: 'redeemed', gatewayId: 'g1' }
              : { status: state.status },
        };
      }
      return undefined;
    });
    return { ...api, state };
  }

  const requestCode = async () => {
    const dialog = await screen.findByRole('dialog', {
      name: 'Pair a gateway',
    });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Get code' }));
    expect(within(dialog).getByText('Enter a name')).toBeTruthy();
    fireEvent.change(within(dialog).getByLabelText('Gateway name:'), {
      target: { value: 'Balcony' },
    });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Get code' }));
    await screen.findByText('ABCD-2345');
  };

  it('pairs a gateway: asks for a name, shows the code, closes once redeemed', async () => {
    // Only the poll interval is faked; findBy/waitFor keep real timers.
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    const api = pairingApi();
    restore = api.restore;
    renderApp();
    await openTab('Gateways');
    fireEvent.click(
      await screen.findByRole('button', { name: 'Pair a gateway...' }),
    );
    await requestCode();
    expect(api.calls).toContainEqual({
      method: 'POST',
      path: '/pairing-codes',
      body: { gatewayName: 'Balcony' },
    });

    api.state.status = 'redeemed';
    api.state.gateways = [gateway()];
    await act(() => vi.advanceTimersByTimeAsync(2_000));

    await vi.waitFor(() =>
      expect(
        screen.queryByRole('dialog', { name: 'Pair a gateway' }),
      ).toBeNull(),
    );
    expect(await screen.findByText(/Gateway paired/)).toBeTruthy();
    expect(await screen.findByText('Online')).toBeTruthy();
  });

  it('offers a new code when the old one expires', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    const api = pairingApi();
    restore = api.restore;
    renderApp();
    await openTab('Gateways');
    fireEvent.click(
      await screen.findByRole('button', { name: 'Pair a gateway...' }),
    );
    await requestCode();

    api.state.status = 'expired';
    await act(() => vi.advanceTimersByTimeAsync(2_000));

    expect(await screen.findByText(/This code has expired/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Get a new code' }));
    expect(screen.getByLabelText('Gateway name:')).toBeTruthy();
  });

  it('unpairs a gateway after confirming', async () => {
    let gateways = [gateway()];
    const api = startApi(({ method, path }) => {
      if (method === 'GET' && path === '/gateways') return { body: gateways };
      if (method === 'GET' && path === '/planters') return { body: [] };
      if (method === 'DELETE' && path === '/gateways/g1') {
        gateways = [];
        return { status: 204 };
      }
      return undefined;
    });
    restore = api.restore;
    renderApp();
    await openTab('Gateways');

    await screen.findByText('Online');
    fireEvent.click(screen.getByRole('button', { name: 'Unpair' }));
    const dialog = screen.getByRole('dialog', { name: 'Unpair gateway' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Unpair' }));

    expect(await screen.findByText('No gateways yet')).toBeTruthy();
  });
});
