import { useEffect, useRef, useState } from 'react';
import {
  AppBar,
  Button,
  MenuList,
  MenuListItem,
  Separator,
  Toolbar,
} from 'react95';
import { Computer4 } from '@react95/icons/Computer4';
import { FileFind } from '@react95/icons/FileFind';
import { Folder } from '@react95/icons/Folder';
import { Help } from '@react95/icons/Help';
import { Logo } from '@react95/icons/Logo';
import { Rundll1 } from '@react95/icons/Rundll1';
import { Settings } from '@react95/icons/Settings';
import styled from 'styled-components';
import { Clock } from './clock';
import type { WindowId, WindowSpec } from './windows';

const Bar = styled(AppBar)`
  top: auto;
  bottom: 0;
  z-index: 1000;
`;

const Tasks = styled.div`
  display: flex;
  flex: 1;
  gap: 4px;
  min-width: 0;
  margin: 0 4px;
`;

const TaskButton = styled(Button)`
  justify-content: flex-start;
  gap: 4px;
  width: 160px;
  min-width: 0;
  overflow: hidden;
  white-space: nowrap;
`;

const StartMenu = styled(MenuList)`
  position: absolute;
  bottom: 100%;
  left: 0;
  min-width: 200px;
`;

const MenuItem = styled(MenuListItem)`
  gap: 8px;
  justify-content: flex-start;
`;

type TaskbarProps = {
  windows: WindowSpec[];
  activeId: WindowId | null;
  onTaskClick: (id: WindowId) => void;
  onShutDown: () => void;
};

export function Taskbar({
  windows,
  activeId,
  onTaskClick,
  onShutDown,
}: TaskbarProps) {
  const [startOpen, setStartOpen] = useState(false);
  const startRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!startOpen) return;
    const close = (e: Event) => {
      if (
        e instanceof KeyboardEvent
          ? e.key === 'Escape'
          : !startRef.current?.contains(e.target as Node)
      ) {
        setStartOpen(false);
      }
    };
    document.addEventListener('pointerdown', close);
    document.addEventListener('keydown', close);
    return () => {
      document.removeEventListener('pointerdown', close);
      document.removeEventListener('keydown', close);
    };
  }, [startOpen]);

  const menuItem = (
    icon: React.ReactNode,
    label: string,
    action?: () => void,
  ) => (
    <MenuItem
      onClick={() => {
        setStartOpen(false);
        action?.();
      }}
    >
      {icon}
      {label}
    </MenuItem>
  );

  return (
    <Bar position="fixed">
      <Toolbar style={{ height: 40, padding: '2px 4px' }}>
        <div ref={startRef} style={{ position: 'relative' }}>
          <Button
            active={startOpen}
            onClick={() => setStartOpen((open) => !open)}
            style={{ fontWeight: 'bold', gap: 4 }}
            aria-haspopup="menu"
            aria-expanded={startOpen}
          >
            <Logo variant="32x32_4" style={{ width: 20, height: 20 }} />
            Start
          </Button>
          {startOpen && (
            <StartMenu role="menu">
              {menuItem(<Folder variant="32x32_4" />, 'Programs')}
              {menuItem(<Settings variant="32x32_4" />, 'Settings')}
              {menuItem(<FileFind variant="32x32_4" />, 'Find')}
              {menuItem(
                <Help variant="16x16_4" style={{ width: 32, height: 32 }} />,
                'Help',
              )}
              {menuItem(<Rundll1 variant="32x32_4" />, 'Run...')}
              <Separator />
              {menuItem(
                <Computer4 variant="32x32_4" />,
                'Shut Down...',
                onShutDown,
              )}
            </StartMenu>
          )}
        </div>
        <Tasks>
          {windows.map((w) => (
            <TaskButton
              key={w.id}
              active={w.id === activeId}
              onClick={() => onTaskClick(w.id)}
            >
              {w.smallIcon}
              {w.title}
            </TaskButton>
          ))}
        </Tasks>
        <Clock />
      </Toolbar>
    </Bar>
  );
}
