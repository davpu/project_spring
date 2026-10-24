import { useRef, useState } from 'react';
import { Button, Window, WindowContent, WindowHeader } from 'react95';
import styled from 'styled-components';
import type { WindowSpec } from './windows';

const Positioned = styled(Window)`
  position: absolute;
  width: min(420px, calc(100vw - 16px));

  &[hidden] {
    display: none;
  }
`;

const Header = styled(WindowHeader)`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 4px;
  user-select: none;
  touch-action: none;
`;

const Title = styled.span`
  display: flex;
  align-items: center;
  gap: 4px;
  overflow: hidden;
  white-space: nowrap;
`;

type DesktopWindowProps = {
  spec: WindowSpec;
  active: boolean;
  hidden: boolean;
  zIndex: number;
  initial: { x: number; y: number };
  onFocus: () => void;
  onClose: () => void;
};

export function DesktopWindow({
  spec,
  active,
  hidden,
  zIndex,
  initial,
  onFocus,
  onClose,
}: DesktopWindowProps) {
  const [pos, setPos] = useState(initial);
  const drag = useRef<{ dx: number; dy: number } | null>(null);

  return (
    <Positioned
      role="dialog"
      aria-label={spec.title}
      hidden={hidden}
      style={{ left: pos.x, top: pos.y, zIndex }}
      onPointerDown={onFocus}
    >
      <Header
        active={active}
        onPointerDown={(e) => {
          drag.current = { dx: e.clientX - pos.x, dy: e.clientY - pos.y };
          e.currentTarget.setPointerCapture(e.pointerId);
        }}
        onPointerMove={(e) => {
          if (!drag.current) return;
          setPos({
            x: e.clientX - drag.current.dx,
            y: Math.max(0, e.clientY - drag.current.dy),
          });
        }}
        onPointerUp={() => {
          drag.current = null;
        }}
      >
        <Title>
          {spec.smallIcon}
          {spec.title}
        </Title>
        <Button
          size="sm"
          square
          aria-label="Close"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={onClose}
        >
          <span style={{ fontWeight: 'bold', transform: 'translateY(-1px)' }}>
            ×
          </span>
        </Button>
      </Header>
      <WindowContent>{spec.content}</WindowContent>
    </Positioned>
  );
}
