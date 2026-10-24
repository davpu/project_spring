import { useState } from 'react';
import styled from 'styled-components';
import { useSession } from '../session';
import { DesktopIcon } from './desktop-icon';
import { DesktopWindow } from './desktop-window';
import { Taskbar } from './taskbar';
import { WINDOWS, type WindowId } from './windows';

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

const ShutDownScreen = styled.div`
  display: grid;
  place-items: center;
  position: fixed;
  inset: 0;
  background: #000;
  color: #f80;
  font-size: 24px;
  text-align: center;
`;

export function Desktop() {
  const [selected, setSelected] = useState<WindowId | null>(null);
  // Open windows in stacking order; the last visible one is on top and active.
  const [stack, setStack] = useState<WindowId[]>([]);
  const [minimized, setMinimized] = useState<WindowId[]>([]);
  const [shutDown, setShutDown] = useState(false);
  const { user } = useSession();

  const focus = (id: WindowId) => {
    setStack((s) => [...s.filter((w) => w !== id), id]);
    setMinimized((m) => m.filter((w) => w !== id));
  };
  const minimize = (id: WindowId) => setMinimized((m) => [...m, id]);
  const close = (id: WindowId) => {
    setStack((s) => s.filter((w) => w !== id));
    setMinimized((m) => m.filter((w) => w !== id));
  };

  if (shutDown) {
    return (
      <ShutDownScreen onClick={() => setShutDown(false)}>
        It's now safe to turn off
        <br />
        your computer.
      </ShutDownScreen>
    );
  }

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
        onShutDown={() => setShutDown(true)}
      />
    </Screen>
  );
}
