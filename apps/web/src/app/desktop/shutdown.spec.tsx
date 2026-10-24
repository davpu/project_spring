import { act, fireEvent, render, screen } from '@testing-library/react';
import App from '../app';
import { Providers } from '../providers';
import { closeTab, restart, wasBootRequested } from './power';

vi.mock('./power', () => ({
  closeTab: vi.fn(),
  restart: vi.fn(),
  wasBootRequested: vi.fn(() => false),
}));

const renderApp = () =>
  render(
    <Providers>
      <App />
    </Providers>,
  );

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
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => vi.useRealTimers());

  it('closes the dialog on No without doing anything', () => {
    renderApp();
    openShutdownDialog();
    fireEvent.click(screen.getByRole('button', { name: 'No' }));
    expect(
      screen.queryByRole('dialog', { name: 'Shut Down Windows' }),
    ).toBeNull();
    expect(restart).not.toHaveBeenCalled();
  });

  it('shuts down, tries to close the tab and powers on again', () => {
    vi.useFakeTimers();
    renderApp();
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
    renderApp();
    fireEvent.doubleClick(screen.getByText('Recycle Bin'));
    fireEvent.doubleClick(screen.getByText('Spring'));
    // Sign up so there is someone to log off.
    fireEvent.click(screen.getByRole('button', { name: 'Sign Up...' }));
    for (const [label, value] of [
      ['Email:', 'gardener@example.com'],
      ['Password:', 'Sunflower7'],
      ['Confirm password:', 'Sunflower7'],
    ] as const) {
      fireEvent.change(screen.getByLabelText(label), { target: { value } });
    }
    fireEvent.click(screen.getByRole('button', { name: 'OK' }));
    expect(await screen.findByText('gardener@example.com')).toBeTruthy();

    openShutdownDialog();
    choose('Close all programs and log on as a different user?');

    expect(screen.queryByRole('dialog', { name: 'Recycle Bin' })).toBeNull();
    expect(
      screen.getByRole('dialog', { name: 'Welcome to Spring' }),
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
