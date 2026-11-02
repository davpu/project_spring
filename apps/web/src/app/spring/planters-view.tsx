import { useState } from 'react';
import type { PlanterDto } from '@org/shared';
import { Button } from 'react95';
import {
  ConfirmDialog,
  EmptyNote,
  Loaded,
  Muted,
  SoilStatusText,
  Stack,
} from '../../components/win95';
import { formatRelative, formatValue } from '../../lib/format';
import { getThreshold, lastUpdate, soilStatus } from '../../lib/moisture';
import { planters } from '../api/api';
import { useResource } from '../api/use-resource';
import type { Navigate } from './shell';
import { ActionCell, Cell, DataTable, Num, TableRow } from './tables';

export function PlantersView({ go }: { go: Navigate }) {
  const list = useResource(
    (signal) => planters.list(signal),
    'planters',
    30_000,
  );
  const [toDelete, setToDelete] = useState<PlanterDto | null>(null);
  const now = Date.now();

  return (
    <Stack>
      <Muted>Every planter reported by your gateways.</Muted>
      <Loaded resource={list}>
        {(items) =>
          items.length === 0 ? (
            <EmptyNote title="No planters yet">
              A planter appears by itself when one of your nodes sends its first
              reading through a paired gateway.
            </EmptyNote>
          ) : (
            <DataTable
              columns={[
                { label: 'Name' },
                { label: 'Status' },
                { label: 'Soil', numeric: true },
                { label: 'Temperature', numeric: true },
                { label: 'Air humidity', numeric: true },
                { label: 'Gateway' },
                { label: 'Updated' },
                { label: 'Actions', hidden: true },
              ]}
            >
              {items.map((p) => (
                <TableRow key={p.id}>
                  <Cell>
                    <b>{p.name}</b>
                  </Cell>
                  <Cell>
                    <SoilStatusText
                      status={soilStatus(p, getThreshold(p.id), now)}
                    />
                  </Cell>
                  <Num>
                    {formatValue('soilHumidity', p.latest.soilHumidity?.value)}
                  </Num>
                  <Num>
                    {formatValue(
                      'airTemperature',
                      p.latest.airTemperature?.value,
                    )}
                  </Num>
                  <Num>
                    {formatValue('airHumidity', p.latest.airHumidity?.value)}
                  </Num>
                  <Cell>{p.gatewayName}</Cell>
                  <Cell>
                    <Muted>{formatRelative(lastUpdate(p), now)}</Muted>
                  </Cell>
                  <ActionCell>
                    <Button
                      size="sm"
                      onClick={() => go({ tab: 'planters', planterId: p.id })}
                    >
                      Detail
                    </Button>
                    <Button size="sm" onClick={() => setToDelete(p)}>
                      Delete
                    </Button>
                  </ActionCell>
                </TableRow>
              ))}
            </DataTable>
          )
        }
      </Loaded>

      {toDelete && (
        <ConfirmDialog
          title="Delete planter"
          confirmLabel="Delete"
          onConfirm={async () => {
            await planters.remove(toDelete.id);
            setToDelete(null);
            list.reload();
          }}
          onCancel={() => setToDelete(null)}
        >
          Delete <b>{toDelete.name}</b> with its plants and all of its readings?
          This cannot be undone. If the node keeps sending data, the planter
          will show up again, empty.
        </ConfirmDialog>
      )}
    </Stack>
  );
}
