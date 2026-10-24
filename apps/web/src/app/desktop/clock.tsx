import { useEffect, useState } from 'react';
import { Frame } from 'react95';
import { Timedate } from '@react95/icons/Timedate';
import styled from 'styled-components';

const Tray = styled(Frame)`
  display: flex;
  align-items: center;
  gap: 6px;
  height: 100%;
  padding: 0 8px;
`;

const formatTime = (date: Date) =>
  date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });

export function Clock() {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <Tray variant="well">
      <Timedate variant="16x16_4" aria-hidden />
      <time dateTime={now.toISOString()} title={now.toLocaleDateString()}>
        {formatTime(now)}
      </time>
    </Tray>
  );
}
