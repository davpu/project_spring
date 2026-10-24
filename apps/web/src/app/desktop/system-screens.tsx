import { useEffect, type ReactNode } from 'react';
import { Logo } from '@react95/icons/Logo';
import styled, { keyframes } from 'styled-components';
import { startBusy } from '../../lib/busy';

const Fullscreen = styled.div`
  position: fixed;
  inset: 0;
  z-index: 2000;
`;

const Sky = styled(Fullscreen)`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 24px;
  color: #fff;
  text-align: center;
  text-shadow: 2px 2px 0 #000;
  background:
    radial-gradient(ellipse 18% 8% at 20% 25%, #fff9 40%, transparent 70%),
    radial-gradient(ellipse 22% 9% at 75% 18%, #fff8 40%, transparent 70%),
    radial-gradient(ellipse 25% 10% at 65% 70%, #fff7 40%, transparent 70%),
    radial-gradient(ellipse 20% 8% at 25% 78%, #fff8 40%, transparent 70%),
    linear-gradient(#1d4fc4, #6fa6f0);
`;

const Title = styled.h1`
  margin: 0;
  font-size: clamp(28px, 6vw, 56px);
  font-weight: bold;
`;

const scroll = keyframes`
  from { background-position: 0 0; }
  to { background-position: 400px 0; }
`;

/** The scrolling colour strip from the bottom of the Win95 boot screen. */
const ProgressStrip = styled.div`
  position: absolute;
  right: 0;
  bottom: 0;
  left: 0;
  height: 12px;
  background: linear-gradient(
      90deg,
      #000080,
      #1084d0,
      #a0e0ff,
      #1084d0,
      #000080
    )
    0 0 / 400px 100% repeat-x;
  animation: ${scroll} 1.2s linear infinite;

  @media (prefers-reduced-motion: reduce) {
    animation: none;
  }
`;

const Black = styled(Fullscreen)`
  display: grid;
  place-items: center;
  background: #000;
  color: #aaa;
`;

/** Shows the hourglass for as long as the calling screen is mounted. */
function useBusyWhileMounted() {
  useEffect(() => startBusy(), []);
}

function Splash({ children }: { children: ReactNode }) {
  useBusyWhileMounted();
  return (
    <Sky role="status">
      <Logo
        variant="32x32_4"
        aria-hidden
        style={{ width: 96, height: 96, imageRendering: 'pixelated' }}
      />
      {children}
      <ProgressStrip />
    </Sky>
  );
}

export function ShuttingDownScreen() {
  return (
    <Splash>
      <p style={{ margin: 0, fontSize: 24 }}>
        Please wait while the app shuts down.
      </p>
    </Splash>
  );
}

export function BootScreen({ stage }: { stage: 'starting' | 'splash' }) {
  if (stage === 'starting') {
    return (
      <Black role="status" style={{ placeItems: 'start', padding: 16 }}>
        Starting Spring 95...
      </Black>
    );
  }
  return (
    <Splash>
      <Title>Spring 95</Title>
    </Splash>
  );
}

const standby = keyframes`
  0%, 45% { opacity: 1; }
  55%, 100% { opacity: 0.15; }
`;

/** A monitor's amber standby light, the only hint that a click wakes it. */
const PowerLed = styled.span`
  position: absolute;
  right: 24px;
  bottom: 24px;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #ffb000;
  box-shadow: 0 0 6px 2px #ffb00080;
  animation: ${standby} 2s ease-in-out infinite;

  @media (prefers-reduced-motion: reduce) {
    animation: none;
  }
`;

/** What's left when the tab refuses to close: a switched-off monitor. */
export function PoweredOffScreen({ onPowerOn }: { onPowerOn: () => void }) {
  useEffect(() => {
    window.addEventListener('keydown', onPowerOn);
    return () => window.removeEventListener('keydown', onPowerOn);
  }, [onPowerOn]);

  return (
    <Black
      role="button"
      tabIndex={0}
      aria-label="Turn the app back on"
      onClick={onPowerOn}
    >
      <PowerLed aria-hidden />
    </Black>
  );
}
