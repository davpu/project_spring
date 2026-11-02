import {
  fireEvent,
  render,
  screen,
  type RenderResult,
} from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { GatewayDto, PlanterDto, UserDto } from '@org/shared';
import App from '../app/app';
import { Providers } from '../app/providers';
import { mockApi, type MockHandler } from './mock-api';

/** Shared fixtures and helpers for the desktop and Spring window tests. */

export const USER: UserDto = { id: 'u1', email: 'gardener@example.com' };

export const minutesAgo = (minutes: number) =>
  new Date(Date.now() - minutes * 60_000).toISOString();

export const planter = (over: Partial<PlanterDto> = {}): PlanterDto => ({
  id: 'p1',
  gatewayId: 'g1',
  gatewayName: 'Balcony',
  name: 'Basil box',
  sensorKey: 'basil',
  createdAt: minutesAgo(10_000),
  latest: {
    soilHumidity: { value: 22, time: minutesAgo(2) },
    airTemperature: { value: 21.4, time: minutesAgo(2) },
    airHumidity: { value: 45, time: minutesAgo(2) },
  },
  ...over,
});

export const gateway = (over: Partial<GatewayDto> = {}): GatewayDto => ({
  id: 'g1',
  name: 'Balcony',
  lastSeenAt: minutesAgo(1),
  createdAt: minutesAgo(10_000),
  planterCount: 1,
  ...over,
});

const unauthorized = {
  status: 401,
  body: { statusCode: 401, message: 'Unauthorized' },
};

/** Answers `/auth/me` and `/auth/logout` for you; everything else comes from `routes`. */
export function startApi(
  routes: MockHandler = () => undefined,
  signedIn = true,
) {
  return mockApi((request) => {
    if (request.method === 'GET' && request.path === '/auth/me') {
      return signedIn ? { body: USER } : unauthorized;
    }
    if (request.method === 'POST' && request.path === '/auth/logout') {
      return { status: 204 };
    }
    return routes(request);
  });
}

/** Both lists empty: a signed-in user with nothing paired yet. */
export const emptyLists: MockHandler = ({ method, path }) =>
  method === 'GET' && (path === '/planters' || path === '/gateways')
    ? { body: [] }
    : undefined;

export const renderApp = (path = '/'): RenderResult =>
  render(
    <Providers>
      <MemoryRouter initialEntries={[path]}>
        <App />
      </MemoryRouter>
    </Providers>,
  );

/** Double-clicks the Spring icon and waits for the window to show its content. */
export async function openSpring() {
  fireEvent.doubleClick(screen.getByText('Spring'));
  return screen.findByRole('dialog', { name: /Spring/ });
}

export const type = (label: RegExp | string, value: string) =>
  fireEvent.change(screen.getByLabelText(label, { selector: 'input' }), {
    target: { value },
  });
