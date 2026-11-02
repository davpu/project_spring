import { useEffect, useRef, useState } from 'react';
import type { CreatePairingCodeResponse, GatewayDto } from '@org/shared';
import { Button, Frame } from 'react95';
import { z } from 'zod';
import { TextField } from '../../components/text-field';
import {
  Actions,
  ConfirmDialog,
  Dialog,
  EmptyNote,
  FormDialog,
  FormError,
  Loaded,
  Muted,
  Row,
  Stack,
  Status,
} from '../../components/win95';
import { formatDate, formatRelative } from '../../lib/format';
import { gatewayOnline } from '../../lib/moisture';
import { requiredText, useForm } from '../../lib/use-form';
import { gateways, pairing } from '../api/api';
import { describeError } from '../api/client';
import { useResource } from '../api/use-resource';
import type { Navigate } from './shell';
import { ActionCell, Cell, DataTable, Num, TableRow } from './tables';

const POLL_MS = 2000;

const GatewayNameSchema = z.object({ gatewayName: requiredText('a name', 80) });

function formatCountdown(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = String(total % 60).padStart(2, '0');
  return `${minutes}:${seconds}`;
}

/** Shows the code, then waits until the gateway has redeemed it. */
function CodeStep({
  code,
  onPaired,
  onRestart,
  onClose,
}: {
  code: CreatePairingCodeResponse;
  onPaired: () => void;
  onRestart: () => void;
  onClose: () => void;
}) {
  const [now, setNow] = useState(() => Date.now());
  const [expired, setExpired] = useState(false);
  const [pollError, setPollError] = useState<string | null>(null);
  const remaining = Date.parse(code.expiresAt) - now;
  const isExpired = expired || remaining <= 0;
  // The parent re-renders on its own schedule; the poll must not restart with it.
  const onPairedRef = useRef(onPaired);
  onPairedRef.current = onPaired;

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (isExpired) return;
    const controller = new AbortController();
    const id = setInterval(() => {
      pairing
        .status(code.id, controller.signal)
        .then((result) => {
          if (controller.signal.aborted) return;
          setPollError(null);
          if (result.status === 'redeemed') onPairedRef.current();
          if (result.status === 'expired') setExpired(true);
        })
        .catch((err: unknown) => {
          if (!controller.signal.aborted) setPollError(describeError(err));
        });
    }, POLL_MS);
    return () => {
      clearInterval(id);
      controller.abort();
    };
  }, [code.id, isExpired]);

  return (
    <Dialog title="Pair a gateway" onClose={onClose}>
      {isExpired ? (
        <p role="status" style={{ margin: 0 }}>
          This code has expired. Get a new one to continue.
        </p>
      ) : (
        <Stack style={{ alignItems: 'center' }}>
          <p style={{ margin: 0, alignSelf: 'flex-start' }}>
            Enter this code on your gateway:
          </p>
          <Frame
            variant="well"
            aria-label="Pairing code"
            style={{
              padding: '12px 24px',
              fontSize: 32,
              fontWeight: 'bold',
              letterSpacing: '0.12em',
              fontFamily: 'ui-monospace, Consolas, monospace',
            }}
          >
            {code.code}
          </Frame>
          <Muted role="status">
            Waiting for the gateway... expires in {formatCountdown(remaining)}
          </Muted>
          <FormError>{pollError}</FormError>
        </Stack>
      )}
      <Actions>
        <Button onClick={onClose} style={{ width: 90 }}>
          Close
        </Button>
        {isExpired && (
          <Button primary onClick={onRestart}>
            Get a new code
          </Button>
        )}
      </Actions>
    </Dialog>
  );
}

function PairDialog({
  onClose,
  onPaired,
}: {
  onClose: () => void;
  onPaired: () => void;
}) {
  const [code, setCode] = useState<CreatePairingCodeResponse | null>(null);
  const form = useForm(GatewayNameSchema, { gatewayName: '' }, async (values) =>
    setCode(await pairing.start(values)),
  );

  if (code) {
    return (
      <CodeStep
        code={code}
        onPaired={onPaired}
        onRestart={() => setCode(null)}
        onClose={onClose}
      />
    );
  }

  return (
    <FormDialog
      title="Pair a gateway"
      submitLabel="Get code"
      pending={form.pending}
      formError={form.formError}
      onSubmit={form.handleSubmit}
      onClose={onClose}
    >
      <TextField
        label="Gateway name:"
        placeholder="e.g. Balcony"
        hint="Choose a name that tells you where it is."
        autoFocus
        {...form.field('gatewayName')}
      />
    </FormDialog>
  );
}

/**
 * The API has no online flag: it only records when telemetry last arrived, so
 * "online" means "sent data within the last `STALE_AFTER_MS`".
 */
function GatewayStatus({ gateway, now }: { gateway: GatewayDto; now: number }) {
  if (gateway.lastSeenAt === null) {
    return <Status tone="neutral">Never connected</Status>;
  }
  return gatewayOnline(gateway, now) ? (
    <Status tone="ok">Online</Status>
  ) : (
    <Status tone="warn">Offline</Status>
  );
}

export function GatewaysView({
  pairNow,
  go,
}: {
  pairNow: boolean;
  go: Navigate;
}) {
  const list = useResource(
    (signal) => gateways.list(signal),
    'gateways',
    30_000,
  );
  const [pairingOpen, setPairingOpen] = useState(pairNow);
  const [justPaired, setJustPaired] = useState(false);
  const [toRemove, setToRemove] = useState<GatewayDto | null>(null);

  const openPairing = () => {
    setJustPaired(false);
    setPairingOpen(true);
  };
  const closePairing = () => {
    setPairingOpen(false);
    // Forget the "open the dialog" request so it does not reopen on re-render.
    if (pairNow) go({ tab: 'gateways' });
  };

  const now = Date.now();

  return (
    <Stack>
      <Row style={{ justifyContent: 'space-between' }}>
        <Muted>
          Gateways collect readings from your planters and send them here.
        </Muted>
        <Button primary onClick={openPairing}>
          Pair a gateway...
        </Button>
      </Row>

      {justPaired && (
        <p role="status" style={{ margin: 0 }}>
          Gateway paired. Its planters will appear as soon as it sends the first
          readings.
        </p>
      )}

      <Loaded resource={list}>
        {(items) =>
          items.length === 0 ? (
            <EmptyNote title="No gateways yet">
              Pair a gateway with a one-time code to start receiving readings.
            </EmptyNote>
          ) : (
            <DataTable
              columns={[
                { label: 'Name' },
                { label: 'Status' },
                { label: 'Last seen' },
                { label: 'Planters', numeric: true },
                { label: 'Paired' },
                { label: 'Actions', hidden: true },
              ]}
            >
              {items.map((g) => (
                <TableRow key={g.id}>
                  <Cell>
                    <b>{g.name}</b>
                  </Cell>
                  <Cell>
                    <GatewayStatus gateway={g} now={now} />
                  </Cell>
                  <Cell>
                    <Muted>{formatRelative(g.lastSeenAt, now)}</Muted>
                  </Cell>
                  <Num>{g.planterCount}</Num>
                  <Cell>
                    <Muted>{formatDate(g.createdAt)}</Muted>
                  </Cell>
                  <ActionCell>
                    <Button size="sm" onClick={() => setToRemove(g)}>
                      Unpair
                    </Button>
                  </ActionCell>
                </TableRow>
              ))}
            </DataTable>
          )
        }
      </Loaded>

      {pairingOpen && (
        <PairDialog
          onClose={closePairing}
          onPaired={() => {
            closePairing();
            setJustPaired(true);
            list.reload();
          }}
        />
      )}
      {toRemove && (
        <ConfirmDialog
          title="Unpair gateway"
          confirmLabel="Unpair"
          onConfirm={async () => {
            await gateways.remove(toRemove.id);
            setToRemove(null);
            list.reload();
          }}
          onCancel={() => setToRemove(null)}
        >
          Unpair <b>{toRemove.name}</b>? It is cut off from the broker and its
          planters, plants and readings are deleted. To use it again it needs a
          new pairing code.
        </ConfirmDialog>
      )}
    </Stack>
  );
}
