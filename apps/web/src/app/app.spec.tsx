import { fireEvent, render, screen } from '@testing-library/react';

import App from './app';
import { Providers } from './providers';

const renderApp = () =>
  render(
    <Providers>
      <App />
    </Providers>,
  );

describe('App', () => {
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
});
