import { useState } from 'react';
import {
  METRICS,
  type Metric,
  type PlantDto,
  type PlanterDetailDto,
} from '@org/shared';
import { Button, GroupBox, TextInput } from 'react95';
import { z } from 'zod';
import { LineChart } from '../../components/line-chart';
import { TextField } from '../../components/text-field';
import {
  ConfirmDialog,
  EmptyNote,
  FormDialog,
  Loaded,
  MoistureBar,
  Muted,
  Row,
  SoilStatusText,
  Stack,
  Tile,
} from '../../components/win95';
import {
  METRIC_LABELS,
  formatDate,
  formatRelative,
  formatValue,
} from '../../lib/format';
import {
  DEFAULT_THRESHOLD,
  getThreshold,
  setThreshold,
  soilStatus,
} from '../../lib/moisture';
import { requiredText, useForm } from '../../lib/use-form';
import { planters, plants } from '../api/api';
import { ApiError } from '../api/client';
import { useResource } from '../api/use-resource';
import { PlantDialog } from './plant-dialog';

const RANGES = [
  { id: '24h', label: '24 hours', hours: 24 },
  { id: '7d', label: '7 days', hours: 24 * 7 },
  { id: '30d', label: '30 days', hours: 24 * 30 },
] as const;
type RangeId = (typeof RANGES)[number]['id'];

const RenameSchema = z.object({ name: requiredText('a name', 80) });

function RenameDialog({
  planter,
  onClose,
  onSaved,
}: {
  planter: PlanterDetailDto;
  onClose: () => void;
  onSaved: () => void;
}) {
  const form = useForm(
    RenameSchema,
    { name: planter.name },
    async ({ name }) => {
      await planters.rename(planter.id, name);
      onSaved();
    },
  );
  return (
    <FormDialog
      title="Rename planter"
      submitLabel="Save"
      pending={form.pending}
      formError={form.formError}
      onSubmit={form.handleSubmit}
      onClose={onClose}
    >
      <TextField label="Name:" autoFocus {...form.field('name')} />
    </FormDialog>
  );
}

function ReadingsBox({
  planterId,
  threshold,
}: {
  planterId: string;
  threshold: number;
}) {
  const [metric, setMetric] = useState<Metric>('soilHumidity');
  const [range, setRange] = useState<RangeId>('24h');
  const hours = RANGES.find((r) => r.id === range)?.hours ?? 24;

  const readings = useResource(
    (signal) => {
      const to = new Date();
      const from = new Date(to.getTime() - hours * 3_600_000);
      return planters.readings(planterId, { metric, from, to }, signal);
    },
    `${planterId}:${metric}:${range}`,
    60_000,
  );

  return (
    <GroupBox label="Readings">
      <Stack>
        <Row style={{ justifyContent: 'space-between' }}>
          <Row role="group" aria-label="Metric" style={{ gap: 0 }}>
            {METRICS.map((m) => (
              <Button
                key={m}
                size="sm"
                aria-pressed={m === metric}
                active={m === metric}
                onClick={() => setMetric(m)}
              >
                {METRIC_LABELS[m]}
              </Button>
            ))}
          </Row>
          <Row role="group" aria-label="Time range" style={{ gap: 0 }}>
            {RANGES.map((r) => (
              <Button
                key={r.id}
                size="sm"
                aria-pressed={r.id === range}
                active={r.id === range}
                onClick={() => setRange(r.id)}
              >
                {r.label}
              </Button>
            ))}
          </Row>
        </Row>
        <Loaded resource={readings}>
          {(data) => (
            <div style={{ opacity: readings.loading ? 0.6 : 1 }}>
              <LineChart
                metric={metric}
                points={data.points}
                fixedAxis={
                  metric === 'airTemperature' ? undefined : { min: 0, max: 100 }
                }
                threshold={metric === 'soilHumidity' ? threshold : undefined}
              />
            </div>
          )}
        </Loaded>
      </Stack>
    </GroupBox>
  );
}

function ThresholdBox({
  value,
  onChange,
}: {
  value: number;
  onChange: (next: number) => void;
}) {
  return (
    <GroupBox label="Moisture limit">
      <Stack>
        <Muted>
          The planter is flagged as needing water when the soil drops below this
          level. The limit is saved in this browser.
        </Muted>
        <Row>
          {/* react95's Slider relies on findDOMNode, gone in React 19. */}
          <input
            type="range"
            min={0}
            max={100}
            value={value}
            aria-label="Moisture limit slider"
            style={{ flex: '1 1 160px', accentColor: '#000080' }}
            onChange={(event) => onChange(Number(event.target.value))}
          />
          <TextInput
            type="number"
            min={0}
            max={100}
            value={value}
            style={{ width: 90 }}
            aria-label="Moisture limit"
            onChange={(event) => {
              // An emptied field is not "0"; wait for a number.
              if (event.target.value === '') return;
              const next = Number(event.target.value);
              if (Number.isFinite(next))
                onChange(Math.min(100, Math.max(0, Math.round(next))));
            }}
          />
          <span>%</span>
          <Button size="sm" onClick={() => onChange(DEFAULT_THRESHOLD)}>
            Reset
          </Button>
        </Row>
      </Stack>
    </GroupBox>
  );
}

function PlantsBox({
  planter,
  onChanged,
}: {
  planter: PlanterDetailDto;
  onChanged: () => void;
}) {
  const [editing, setEditing] = useState<PlantDto | 'new' | null>(null);
  const [toDelete, setToDelete] = useState<PlantDto | null>(null);

  return (
    <GroupBox label="Plants">
      <Stack>
        {planter.plants.length === 0 ? (
          <EmptyNote title="No plants in this planter yet">
            Add what grows here so you remember what it is.
          </EmptyNote>
        ) : (
          <Stack style={{ gap: 6 }}>
            {planter.plants.map((plant) => (
              <Row key={plant.id} style={{ justifyContent: 'space-between' }}>
                <div>
                  <b>{plant.species}</b>
                  <br />
                  <Muted>
                    {plant.lifecycle}
                    {plant.plantedAt
                      ? `, planted ${formatDate(plant.plantedAt)}`
                      : ''}
                  </Muted>
                </div>
                <Row style={{ gap: 4 }}>
                  <Button size="sm" onClick={() => setEditing(plant)}>
                    Edit
                  </Button>
                  <Button size="sm" onClick={() => setToDelete(plant)}>
                    Remove
                  </Button>
                </Row>
              </Row>
            ))}
          </Stack>
        )}
        <Row style={{ justifyContent: 'flex-end' }}>
          <Button onClick={() => setEditing('new')}>Add plant...</Button>
        </Row>
      </Stack>

      {editing && (
        <PlantDialog
          planterId={planter.id}
          plant={editing === 'new' ? undefined : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            onChanged();
          }}
        />
      )}
      {toDelete && (
        <ConfirmDialog
          title="Remove plant"
          confirmLabel="Remove"
          onConfirm={async () => {
            await plants.remove(toDelete.id);
            setToDelete(null);
            onChanged();
          }}
          onCancel={() => setToDelete(null)}
        >
          Remove <b>{toDelete.species}</b> from this planter? The readings stay.
        </ConfirmDialog>
      )}
    </GroupBox>
  );
}

/** Mounted with `key={id}` by the shell, so each planter starts from scratch. */
export function PlanterView({
  id,
  onBack,
}: {
  id: string;
  onBack: () => void;
}) {
  const planter = useResource(
    (signal) => planters.get(id, signal),
    `planter:${id}`,
    30_000,
  );
  const [threshold, setThresholdValue] = useState(() => getThreshold(id));
  const [renaming, setRenaming] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const changeThreshold = (value: number) => {
    setThreshold(id, value);
    setThresholdValue(value);
  };

  const back = (
    <Button size="sm" onClick={onBack}>
      ← Back to planters
    </Button>
  );

  if (planter.error instanceof ApiError && planter.error.status === 404) {
    return (
      <Stack>
        <Row>{back}</Row>
        <EmptyNote title="Planter not found">
          It may have been deleted.
        </EmptyNote>
      </Stack>
    );
  }

  return (
    <Stack>
      <Loaded resource={planter}>
        {(data) => {
          const now = Date.now();
          const status = soilStatus(data, threshold, now);
          const soil = data.latest.soilHumidity;
          const since = (time: string | undefined) =>
            time ? formatRelative(time, now) : 'no data yet';
          return (
            <>
              <Row style={{ justifyContent: 'space-between' }}>
                <Row>
                  {back}
                  <b style={{ fontSize: 18 }}>{data.name}</b>
                  <SoilStatusText status={status} />
                  <Muted>via {data.gatewayName}</Muted>
                </Row>
                <Row style={{ gap: 4 }}>
                  <Button size="sm" onClick={() => setRenaming(true)}>
                    Rename...
                  </Button>
                  <Button size="sm" onClick={() => setDeleting(true)}>
                    Delete...
                  </Button>
                </Row>
              </Row>

              <Row style={{ alignItems: 'stretch' }}>
                <Tile
                  label={METRIC_LABELS.soilHumidity}
                  value={formatValue('soilHumidity', soil?.value)}
                  tone={status === 'dry' ? 'danger' : undefined}
                  note={
                    <Stack style={{ gap: 4 }}>
                      <MoistureBar value={soil?.value} threshold={threshold} />
                      <Muted>{since(soil?.time)}</Muted>
                    </Stack>
                  }
                />
                <Tile
                  label={METRIC_LABELS.airTemperature}
                  value={formatValue(
                    'airTemperature',
                    data.latest.airTemperature?.value,
                  )}
                  note={
                    <Muted>{since(data.latest.airTemperature?.time)}</Muted>
                  }
                />
                <Tile
                  label={METRIC_LABELS.airHumidity}
                  value={formatValue(
                    'airHumidity',
                    data.latest.airHumidity?.value,
                  )}
                  note={<Muted>{since(data.latest.airHumidity?.time)}</Muted>}
                />
              </Row>

              <ReadingsBox planterId={id} threshold={threshold} />
              <PlantsBox planter={data} onChanged={planter.reload} />
              <ThresholdBox value={threshold} onChange={changeThreshold} />

              {renaming && (
                <RenameDialog
                  planter={data}
                  onClose={() => setRenaming(false)}
                  onSaved={() => {
                    setRenaming(false);
                    planter.reload();
                  }}
                />
              )}
              {deleting && (
                <ConfirmDialog
                  title="Delete planter"
                  confirmLabel="Delete"
                  onConfirm={async () => {
                    await planters.remove(id);
                    onBack();
                  }}
                  onCancel={() => setDeleting(false)}
                >
                  Delete <b>{data.name}</b> with its plants and all of its
                  readings? This cannot be undone. If the node keeps sending
                  data, the planter will show up again, empty.
                </ConfirmDialog>
              )}
            </>
          );
        }}
      </Loaded>
    </Stack>
  );
}
