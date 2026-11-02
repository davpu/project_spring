import type { GatewayDto, PlanterDto } from '@org/shared';
import { Button, GroupBox } from 'react95';
import {
  EmptyNote,
  Loaded,
  MoistureBar,
  Muted,
  Row,
  SoilStatusText,
  Stack,
  Status,
  TextLink,
  Tile,
} from '../../components/win95';
import { formatRelative, formatValue } from '../../lib/format';
import {
  gatewayOnline,
  getThreshold,
  lastUpdate,
  soilStatus,
} from '../../lib/moisture';
import { gateways, planters } from '../api/api';
import { useResource } from '../api/use-resource';
import type { Navigate } from './shell';
import { ActionCell, Cell, DataTable, Num, TableRow } from './tables';

const REFRESH_MS = 30_000;

export function DashboardView({ go }: { go: Navigate }) {
  const overview = useResource(
    (signal) =>
      Promise.all([planters.list(signal), gateways.list(signal)]).then(
        ([items, gatewayItems]) => ({ items, gatewayItems }),
      ),
    'dashboard',
    REFRESH_MS,
  );

  return (
    <Loaded resource={overview}>
      {({ items, gatewayItems }) =>
        gatewayItems.length === 0 ? (
          <EmptyNote
            title="Pair your first gateway"
            action={
              <Button
                primary
                onClick={() => go({ tab: 'gateways', pair: true })}
              >
                Pair a gateway...
              </Button>
            }
          >
            A gateway collects the readings from your planters and sends them
            here. Pair one to see your plants on this page.
          </EmptyNote>
        ) : (
          <Overview items={items} gatewayItems={gatewayItems} go={go} />
        )
      }
    </Loaded>
  );
}

function Overview({
  items,
  gatewayItems,
  go,
}: {
  items: PlanterDto[];
  gatewayItems: GatewayDto[];
  go: Navigate;
}) {
  const now = Date.now();
  const statusOf = (p: PlanterDto) => soilStatus(p, getThreshold(p.id), now);
  const dry = items.filter((p) => statusOf(p) === 'dry');
  const stale = items.filter((p) => statusOf(p) === 'stale');
  // A gateway that never reported is not "offline", it is still being set up.
  const offline = gatewayItems.filter(
    (g) => g.lastSeenAt !== null && !gatewayOnline(g, now),
  );
  const online = gatewayItems.filter((g) => gatewayOnline(g, now)).length;
  const attention = dry.length + stale.length + offline.length;

  const openPlanter = (id: string) => () =>
    go({ tab: 'planters', planterId: id });

  return (
    <Stack>
      <Row style={{ alignItems: 'stretch' }}>
        <Tile label="Planters" value={items.length} />
        <Tile
          label="Need water"
          value={dry.length}
          tone={dry.length > 0 ? 'danger' : 'ok'}
          note={dry.length > 0 ? 'Below their moisture limit' : 'All good'}
        />
        <Tile
          label="Gateways online"
          value={`${online} of ${gatewayItems.length}`}
          tone={offline.length > 0 ? 'warn' : 'ok'}
        />
      </Row>

      <GroupBox label="Needs attention">
        {attention === 0 ? (
          <Muted>Everything looks good. Nothing needs your attention.</Muted>
        ) : (
          <Stack style={{ gap: 6 }}>
            {dry.map((p) => (
              <Row key={p.id}>
                <Status tone="danger">Needs water</Status>
                <TextLink type="button" onClick={openPlanter(p.id)}>
                  {p.name}
                </TextLink>
                <Muted>
                  soil at{' '}
                  {formatValue('soilHumidity', p.latest.soilHumidity?.value)}
                </Muted>
              </Row>
            ))}
            {stale.map((p) => (
              <Row key={p.id}>
                <Status tone="warn">No recent data</Status>
                <TextLink type="button" onClick={openPlanter(p.id)}>
                  {p.name}
                </TextLink>
                <Muted>last reading {formatRelative(lastUpdate(p), now)}</Muted>
              </Row>
            ))}
            {offline.map((g) => (
              <Row key={g.id}>
                <Status tone="warn">Gateway offline</Status>
                <TextLink type="button" onClick={() => go({ tab: 'gateways' })}>
                  {g.name}
                </TextLink>
                <Muted>last seen {formatRelative(g.lastSeenAt, now)}</Muted>
              </Row>
            ))}
          </Stack>
        )}
      </GroupBox>

      <GroupBox label="Your planters">
        {items.length === 0 ? (
          <Muted>
            A planter shows up here by itself as soon as one of your nodes sends
            its first reading.
          </Muted>
        ) : (
          <DataTable
            columns={[
              { label: 'Name' },
              { label: 'Status' },
              { label: 'Soil moisture' },
              { label: 'Temperature', numeric: true },
              { label: 'Updated' },
              { label: 'Actions', hidden: true },
            ]}
          >
            {items.map((p) => (
              <TableRow key={p.id}>
                <Cell>
                  <b>{p.name}</b>
                  <br />
                  <Muted>{p.gatewayName}</Muted>
                </Cell>
                <Cell>
                  <SoilStatusText status={statusOf(p)} />
                </Cell>
                <Cell style={{ minWidth: 140 }}>
                  <div style={{ marginBottom: 4 }}>
                    {formatValue('soilHumidity', p.latest.soilHumidity?.value)}
                  </div>
                  <MoistureBar
                    value={p.latest.soilHumidity?.value}
                    threshold={getThreshold(p.id)}
                  />
                </Cell>
                <Num>
                  {formatValue(
                    'airTemperature',
                    p.latest.airTemperature?.value,
                  )}
                </Num>
                <Cell>
                  <Muted>{formatRelative(lastUpdate(p), now)}</Muted>
                </Cell>
                <ActionCell>
                  <Button size="sm" onClick={openPlanter(p.id)}>
                    Detail
                  </Button>
                </ActionCell>
              </TableRow>
            ))}
          </DataTable>
        )}
      </GroupBox>
    </Stack>
  );
}
