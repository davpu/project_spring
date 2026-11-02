import {
  useEffect,
  useId,
  useRef,
  useState,
  type CSSProperties,
  type FormEvent,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import {
  Button,
  Frame,
  Hourglass,
  ProgressBar,
  Window,
  WindowContent,
  WindowHeader,
} from 'react95';
import styled from 'styled-components';
import { describeError } from '../app/api/client';
import { trackBusy } from '../lib/busy';
import type { Resource } from '../app/api/use-resource';
import type { SoilStatus } from '../lib/moisture';

/** Win95-flavoured building blocks shared by the Spring views. */

export const Muted = styled.span`
  color: ${({ theme }) => theme.materialTextDisabled};
`;

const Alert = styled.p`
  margin: 0;
  color: #c00;
`;

/** A button that looks like a Win95 hyperlink, for navigating inside the app. */
export const TextLink = styled.button`
  padding: 0;
  border: none;
  background: none;
  color: ${({ theme }) => theme.anchor};
  font: inherit;
  text-decoration: underline;
`;

/** A form-level error, such as a wrong password or a server failure. */
export function FormError({ children }: { children: ReactNode }) {
  return children ? <Alert role="alert">{children}</Alert> : null;
}

export const Row = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
`;

export const Actions = styled(Row)`
  justify-content: flex-end;
  margin-top: 16px;
`;

export const Stack = styled.div`
  display: flex;
  flex-direction: column;
  gap: 12px;
`;

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
  gap: 8px;
`;

/**
 * A modal dialog window over the whole desktop; Escape and the × button close
 * it. Rendered through a portal so it sits above every desktop window and the
 * taskbar, whichever window opened it.
 */
export function Dialog({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const titleId = useId();
  const ref = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const first = ref.current?.querySelector<HTMLElement>(
      'input, select, textarea, button:not([data-close])',
    );
    first?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      // Capture phase, so the Start menu's own Escape handler does not also fire.
      event.stopPropagation();
      onCloseRef.current();
    };
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('keydown', onKey, true);
      previous?.focus?.();
    };
  }, []);

  return createPortal(
    <Dither>
      <Window
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        style={{ width: 'min(440px, 100%)' }}
      >
        <Header>
          <span id={titleId}>{title}</span>
          <Button
            size="sm"
            square
            aria-label="Close"
            data-close
            onClick={onClose}
          >
            <span style={{ fontWeight: 'bold', transform: 'translateY(-1px)' }}>
              ×
            </span>
          </Button>
        </Header>
        <WindowContent>{children}</WindowContent>
      </Window>
    </Dither>,
    document.body,
  );
}

/**
 * A destructive-action prompt that runs `onConfirm` itself: the buttons are
 * disabled while it is pending and a failure is shown inside the dialog. On
 * success the caller closes the dialog from within `onConfirm`.
 */
export function ConfirmDialog({
  title,
  confirmLabel,
  onConfirm,
  onCancel,
  children,
}: {
  title: string;
  confirmLabel: string;
  onConfirm: () => Promise<void>;
  onCancel: () => void;
  children: ReactNode;
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const confirm = async () => {
    setPending(true);
    setError(null);
    try {
      await trackBusy(onConfirm);
    } catch (err) {
      setError(describeError(err));
      setPending(false);
    }
  };

  return (
    <Dialog
      title={title}
      onClose={() => {
        if (!pending) onCancel();
      }}
    >
      <p style={{ margin: 0 }}>{children}</p>
      <FormError>{error}</FormError>
      <Actions>
        <Button disabled={pending} onClick={onCancel} style={{ width: 90 }}>
          Cancel
        </Button>
        <Button
          primary
          disabled={pending}
          onClick={() => void confirm()}
          style={{ minWidth: 90 }}
        >
          {confirmLabel}
        </Button>
      </Actions>
    </Dialog>
  );
}

/** A dialog around a form; OK submits, Cancel closes. */
export function FormDialog({
  title,
  submitLabel = 'OK',
  pending = false,
  formError,
  onSubmit,
  onClose,
  children,
}: {
  title: string;
  submitLabel?: string;
  pending?: boolean;
  formError?: string | null;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <Dialog
      title={title}
      onClose={() => {
        if (!pending) onClose();
      }}
    >
      <form noValidate onSubmit={onSubmit}>
        <Stack style={{ '--label-width': '140px' } as CSSProperties}>
          {children}
        </Stack>
        <FormError>{formError}</FormError>
        <Actions>
          <Button
            type="button"
            disabled={pending}
            onClick={onClose}
            style={{ width: 90 }}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            primary
            disabled={pending}
            style={{ minWidth: 90 }}
          >
            {submitLabel}
          </Button>
        </Actions>
      </form>
    </Dialog>
  );
}

const Centered = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 24px;
`;

/**
 * Renders a resource's loading and error states once, so views only write the
 * happy path. Data that is already there stays on screen during a reload.
 */
export function Loaded<T>({
  resource,
  children,
}: {
  resource: Resource<T>;
  children: (data: T) => ReactNode;
}) {
  if (resource.data !== undefined) return <>{children(resource.data)}</>;
  if (resource.error !== undefined) {
    return (
      <Centered role="alert">
        <span style={{ color: '#c00' }}>{describeError(resource.error)}</span>
        <Button onClick={resource.reload}>Try again</Button>
      </Centered>
    );
  }
  return (
    <Centered role="status" aria-label="Loading">
      <Hourglass size={32} />
      <Muted>Please wait...</Muted>
    </Centered>
  );
}

/** A grey, sunken message for empty lists. */
export function EmptyNote({
  title,
  children,
  action,
}: {
  title: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <Frame variant="well" style={{ padding: 16 }}>
      <Centered style={{ padding: 8 }}>
        <b>{title}</b>
        {children && (
          <p style={{ margin: 0, textAlign: 'center', maxWidth: 420 }}>
            {children}
          </p>
        )}
        {action}
      </Centered>
    </Frame>
  );
}

export type Tone = 'ok' | 'warn' | 'danger' | 'neutral';

const TONE_COLOR: Record<Tone, string> = {
  ok: '#008000',
  warn: '#808000',
  danger: '#c00000',
  neutral: '#808080',
};

const Led = styled.span<{ $tone: Tone }>`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  white-space: nowrap;

  &::before {
    content: '';
    width: 10px;
    height: 10px;
    border: 1px solid #000;
    background: ${({ $tone }) => TONE_COLOR[$tone]};
  }
`;

/** Win95 had no badges: a small coloured square and a label will do. */
export function Status({
  tone,
  children,
}: {
  tone: Tone;
  children: ReactNode;
}) {
  return <Led $tone={tone}>{children}</Led>;
}

const SOIL: Record<SoilStatus, { tone: Tone; label: string }> = {
  ok: { tone: 'ok', label: 'Healthy' },
  dry: { tone: 'danger', label: 'Needs water' },
  stale: { tone: 'warn', label: 'No recent data' },
  'no-data': { tone: 'neutral', label: 'No data yet' },
};

export function SoilStatusText({ status }: { status: SoilStatus }) {
  const { tone, label } = SOIL[status];
  return <Status tone={tone}>{label}</Status>;
}

const BarWrap = styled.div`
  position: relative;
`;

const Limit = styled.span`
  position: absolute;
  top: -3px;
  bottom: -3px;
  width: 2px;
  background: #c00000;
`;

/** Soil moisture as a progress bar, with a red tick at the "needs water" limit. */
export function MoistureBar({
  value,
  threshold,
}: {
  value: number | undefined;
  threshold: number;
}) {
  const clamped = Math.min(100, Math.max(0, value ?? 0));
  return (
    <BarWrap
      role="meter"
      aria-label="Soil moisture"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={value === undefined ? undefined : clamped}
      aria-valuetext={value === undefined ? 'no data' : `${clamped}%`}
    >
      <ProgressBar value={clamped} hideValue={value === undefined} />
      <Limit
        style={{ left: `${threshold}%` }}
        title={`Needs water below ${threshold}%`}
      />
    </BarWrap>
  );
}

/** A labelled value in a sunken frame, for the top row of a view. */
export function Tile({
  label,
  value,
  note,
  tone,
}: {
  label: string;
  value: ReactNode;
  note?: ReactNode;
  tone?: Tone;
}) {
  return (
    <Frame variant="well" style={{ padding: '8px 12px', flex: '1 1 160px' }}>
      <Stack style={{ gap: 4 }}>
        <Muted>{label}</Muted>
        <span
          style={{
            fontSize: 22,
            fontWeight: 'bold',
            color: tone ? TONE_COLOR[tone] : undefined,
          }}
        >
          {value}
        </span>
        {note && <div style={{ fontSize: 14 }}>{note}</div>}
      </Stack>
    </Frame>
  );
}
