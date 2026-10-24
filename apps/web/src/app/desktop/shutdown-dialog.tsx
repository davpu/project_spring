import { useState } from 'react';
import { Button, Radio, Window, WindowContent, WindowHeader } from 'react95';
import { Computer4 } from '@react95/icons/Computer4';
import styled from 'styled-components';

export type ShutdownChoice = 'shutdown' | 'restart' | 'logoff';

const CHOICES: { value: ShutdownChoice; label: string }[] = [
  { value: 'shutdown', label: 'Shut down the app?' },
  { value: 'restart', label: 'Restart the app?' },
  {
    value: 'logoff',
    label: 'Close all programs and log on as a different user?',
  },
];

/** Win95 had no transparency, so it greyed the screen with a dither pattern. */
const Dither = styled.div`
  display: grid;
  place-items: center;
  position: fixed;
  inset: 0;
  z-index: 1500;
  padding: 16px;
  background: repeating-conic-gradient(#000 0 25%, transparent 0 50%) 0 0 / 2px
    2px;
`;

const Header = styled(WindowHeader)`
  display: flex;
  align-items: center;
  justify-content: space-between;
`;

const Body = styled(WindowContent)`
  display: flex;
  gap: 16px;
`;

const Choices = styled.fieldset`
  display: flex;
  flex-direction: column;
  margin: 0;
  padding: 0;
  border: none;
`;

const Actions = styled.div`
  display: flex;
  justify-content: center;
  gap: 8px;
  margin-top: 16px;
`;

type ShutdownDialogProps = {
  onConfirm: (choice: ShutdownChoice) => void;
  onCancel: () => void;
};

export function ShutdownDialog({ onConfirm, onCancel }: ShutdownDialogProps) {
  const [choice, setChoice] = useState<ShutdownChoice>('shutdown');

  return (
    <Dither
      onKeyDown={(e) => {
        if (e.key === 'Escape') onCancel();
      }}
    >
      <Window
        role="dialog"
        aria-modal="true"
        aria-labelledby="shutdown-title"
        style={{ maxWidth: 440 }}
      >
        <Header>
          <span id="shutdown-title">Shut Down Windows</span>
          <Button size="sm" square aria-label="Close" onClick={onCancel}>
            <span style={{ fontWeight: 'bold', transform: 'translateY(-1px)' }}>
              ×
            </span>
          </Button>
        </Header>
        <Body>
          <Computer4 variant="32x32_4" aria-hidden style={{ flexShrink: 0 }} />
          <form
            onSubmit={(e) => {
              e.preventDefault();
              onConfirm(choice);
            }}
          >
            <Choices>
              <legend style={{ padding: 0, marginBottom: 8 }}>
                Are you sure you want to:
              </legend>
              {CHOICES.map((c) => (
                <Radio
                  key={c.value}
                  name="shutdown-choice"
                  value={c.value}
                  label={c.label}
                  checked={choice === c.value}
                  onChange={() => setChoice(c.value)}
                />
              ))}
            </Choices>
            <Actions>
              <Button type="submit" primary autoFocus style={{ width: 80 }}>
                Yes
              </Button>
              <Button type="button" style={{ width: 80 }} onClick={onCancel}>
                No
              </Button>
            </Actions>
          </form>
        </Body>
      </Window>
    </Dither>
  );
}
