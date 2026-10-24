import { useEffect, useState } from 'react';
import styled from 'styled-components';
import { useSession } from '../session';
import { DesktopIcon } from './desktop-icon';
import { DesktopWindow } from './desktop-window';
import { closeTab, restart, wasBootRequested } from './power';
import { ShutdownDialog, type ShutdownChoice } from './shutdown-dialog';
import {
  BootScreen,
  PoweredOffScreen,
  ShuttingDownScreen,
} from './system-screens';
import { Taskbar } from './taskbar';
import { WINDOWS, type WindowId } from './windows';

type Power = 'starting' | 'splash' | 'on' | 'shutting-down' | 'off';

/** How long each power state lasts before moving on, in ms. */
const TIMINGS: Partial<Record<Power, number>> = {
  starting: 800,
  splash: 1200,
  'shutting-down': 5000,
};

const Screen = styled.div`
  position: fixed;
  inset: 0;
  overflow: hidden;
  background: ${({ theme }) => theme.desktopBackground};
`;

const Icons = styled.div`
  display: flex;
  flex-direction: column;
  flex-wrap: wrap;
  align-content: flex-start;
  gap: 12px;
  height: calc(100% - 48px);
  padding: 8px;
`;

export function Desktop() {
  const [selected, setSelected] = useState<WindowId | null>(null);
  // Open windows in stacking order; the last visible one is on top and active.
  const [stack, setStack] = useState<WindowId[]>([]);
  const [minimized, setMinimized] = useState<WindowId[]>([]);
  const [power, setPower] = useState<Power>(() =>
    wasBootRequested() ? 'starting' : 'on',
  );
  const [shutdownDialog, setShutdownDialog] = useState(false);
  const { user, setUser } = useSession();

  useEffect(() => {
    const delay = TIMINGS[power];
    if (delay === undefined) return;
    const id = setTimeout(() => {
      if (power === 'starting') setPower('splash');
      if (power === 'splash') setPower('on');
      if (power === 'shutting-down') {
        closeTab();
        // Only seen when the browser refused to close the tab.
        setPower('off');
      }
    }, delay);
    return () => clearTimeout(id);
  }, [power]);

  const focus = (id: WindowId) => {
    setStack((s) => [...s.filter((w) => w !== id), id]);
    setMinimized((m) => m.filter((w) => w !== id));
  };
  const minimize = (id: WindowId) => setMinimized((m) => [...m, id]);
  const close = (id: WindowId) => {
    setStack((s) => s.filter((w) => w !== id));
    setMinimized((m) => m.filter((w) => w !== id));
  };

  const confirmShutdown = (choice: ShutdownChoice) => {
    setShutdownDialog(false);
    if (choice === 'shutdown') setPower('shutting-down');
    if (choice === 'restart') restart();
    if (choice === 'logoff') {
      // "Close all programs and log on as a different user"
      setUser(null);
      setMinimized([]);
      setStack(['app']);
    }
  };

  if (power === 'starting' || power === 'splash') {
    return <BootScreen stage={power} />;
  }
  if (power === 'shutting-down') return <ShuttingDownScreen />;
  if (power === 'off') return <PoweredOffScreen onPowerOn={restart} />;

  const visible = stack.filter((id) => !minimized.includes(id));
  const activeId = visible[visible.length - 1] ?? null;
  // Stable order for the taskbar; stacking is handled via zIndex.
  const openWindows = WINDOWS.filter((w) => stack.includes(w.id));

  return (
    <Screen onClick={() => setSelected(null)}>
      <Icons>
        {WINDOWS.map((w) => (
          <DesktopIcon
            key={w.id}
            icon={w.icon}
            label={w.title}
            selected={selected === w.id}
            onSelect={() => setSelected(w.id)}
            onOpen={() => focus(w.id)}
          />
        ))}
      </Icons>
      {openWindows.map((w, i) => (
        <DesktopWindow
          key={w.id}
          spec={w}
          title={w.id === 'app' && !user ? 'Welcome to Spring' : undefined}
          hidden={minimized.includes(w.id)}
          active={w.id === activeId}
          zIndex={10 + stack.indexOf(w.id)}
          initial={{ x: 120 + i * 24, y: 40 + i * 24 }}
          onFocus={() => focus(w.id)}
          onClose={() => close(w.id)}
        />
      ))}
      <Taskbar
        windows={openWindows}
        activeId={activeId}
        onTaskClick={(id) =>
          // Clicking the active task minimises it, like Win95.
          id === activeId ? minimize(id) : focus(id)
        }
        onShutDown={() => setShutdownDialog(true)}
      />
      {shutdownDialog && (
        <ShutdownDialog
          onConfirm={confirmShutdown}
          onCancel={() => setShutdownDialog(false)}
        />
      )}
    </Screen>
  );
}
