import { act, fireEvent, screen } from '@testing-library/react';
import { USER, renderApp, startApi } from '../../test/render-app';
import { closeTab, restart, wasBootRequested } from './power';

vi.mock('./power', () => ({
  closeTab: vi.fn(),
  restart: vi.fn(),
  wasBootRequested: vi.fn(() => false),
}));

const openShutdownDialog = () => {
  fireEvent.click(screen.getByRole('button', { name: /start/i }));
  fireEvent.click(screen.getByText('Shut Down...'));
  return screen.getByRole('dialog', { name: 'Shut Down Windows' });
};

const choose = (label: string) => {
  fireEvent.click(screen.getByLabelText(label));
  fireEvent.click(screen.getByRole('button', { name: 'Yes' }));
};

describe('Shut Down', () => {
  let restore: () => void = () => undefined;
  beforeEach(() => {
    vi.clearAllMocks();
    // Nobody is signed in unless a test says otherwise.
    restore = startApi(() => undefined, false).restore;
  });
  afterEach(() => {
    restore();
    vi.useRealTimers();
  });

  it('closes the dialog on No without doing anything', () => {
    renderApp();
    openShutdownDialog();
    fireEvent.click(screen.getByRole('button', { name: 'No' }));
    expect(
      screen.queryByRole('dialog', { name: 'Shut Down Windows' }),
    ).toBeNull();
    expect(restart).not.toHaveBeenCalled();
  });

  it('shuts down, tries to close the tab and powers on again', async () => {
    vi.useFakeTimers();
    renderApp();
    // Let the session check finish so its hourglass is gone before we start.
    await act(() => Promise.resolve());
    openShutdownDialog();
    choose('Shut down the app?');
    expect(
      screen.getByText('Please wait while the app shuts down.'),
    ).toBeTruthy();
    expect(document.documentElement.hasAttribute('data-busy')).toBe(true);

    act(() => vi.advanceTimersByTime(5000));
    expect(closeTab).toHaveBeenCalledOnce();
    expect(document.documentElement.hasAttribute('data-busy')).toBe(false);

    fireEvent.click(
      screen.getByRole('button', { name: 'Turn the app back on' }),
    );
    expect(restart).toHaveBeenCalledOnce();
  });

  it('restarts through a page reload', () => {
    renderApp();
    openShutdownDialog();
    choose('Restart the app?');
    expect(restart).toHaveBeenCalledOnce();
  });

  it('logs off: closes every window and opens the login', async () => {
    restore();
    // Signed in, with nothing paired yet.
    restore = startApi(({ method, path }) =>
      method === 'GET' && (path === '/planters' || path === '/gateways')
        ? { body: [] }
        : undefined,
    ).restore;
    renderApp();
    fireEvent.doubleClick(screen.getByText('Recycle Bin'));
    fireEvent.doubleClick(screen.getByText('Spring'));
    expect(await screen.findByText(USER.email)).toBeTruthy();

    openShutdownDialog();
    choose('Close all programs and log on as a different user?');

    expect(screen.queryByRole('dialog', { name: 'Recycle Bin' })).toBeNull();
    expect(
      await screen.findByRole('dialog', { name: 'Welcome to Spring' }),
    ).toBeTruthy();
    expect(screen.getByRole('form', { name: 'Log in' })).toBeTruthy();
  });

  it('plays the boot sequence after a restart', () => {
    vi.useFakeTimers();
    vi.mocked(wasBootRequested).mockReturnValue(true);
    renderApp();
    expect(screen.getByText('Starting Spring 95...')).toBeTruthy();
    act(() => vi.advanceTimersByTime(800));
    expect(screen.getByText('Spring 95')).toBeTruthy();
    act(() => vi.advanceTimersByTime(1200));
    expect(screen.getByRole('button', { name: /start/i })).toBeTruthy();
  });
});
