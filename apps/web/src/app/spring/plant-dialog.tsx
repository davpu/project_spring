import { useId } from 'react';
import { PLANT_LIFECYCLES, type PlantDto } from '@org/shared';
import { SelectNative } from 'react95';
import { z } from 'zod';
import { FieldRow, TextField } from '../../components/text-field';
import { FormDialog } from '../../components/win95';
import { requiredText, useForm } from '../../lib/use-form';
import { plants } from '../api/api';

const LIFECYCLE_OPTIONS = PLANT_LIFECYCLES.map((value) => ({
  value,
  label: value.charAt(0).toUpperCase() + value.slice(1),
}));

const PlantFormSchema = z.object({
  species: requiredText('the species', 120),
  lifecycle: z.enum(PLANT_LIFECYCLES),
  /** Empty, or `YYYY-MM-DD` from the date input. */
  plantedAt: z
    .string()
    .refine(
      (value) => value === '' || /^\d{4}-\d{2}-\d{2}$/.test(value),
      'Enter a valid date',
    ),
});

/** Adds a plant to a planter, or edits one when `plant` is given. */
export function PlantDialog({
  planterId,
  plant,
  onClose,
  onSaved,
}: {
  planterId: string;
  plant?: PlantDto;
  onClose: () => void;
  onSaved: () => void;
}) {
  const lifecycleId = useId();
  const form = useForm(
    PlantFormSchema,
    {
      species: plant?.species ?? '',
      lifecycle: plant?.lifecycle ?? 'perennial',
      plantedAt: plant?.plantedAt ?? '',
    },
    async (values) => {
      const body = {
        species: values.species,
        lifecycle: values.lifecycle,
        plantedAt: values.plantedAt || null,
      };
      if (plant) await plants.update(plant.id, body);
      else await plants.create(planterId, body);
      onSaved();
    },
  );
  const lifecycle = form.field('lifecycle');

  return (
    <FormDialog
      title={plant ? 'Edit plant' : 'Add a plant'}
      submitLabel={plant ? 'Save' : 'Add'}
      pending={form.pending}
      formError={form.formError}
      onSubmit={form.handleSubmit}
      onClose={onClose}
    >
      <TextField
        label="Species:"
        placeholder="e.g. Basil"
        autoFocus
        {...form.field('species')}
      />
      <FieldRow label="Lifecycle:" id={lifecycleId}>
        <SelectNative
          id={lifecycleId}
          name={lifecycle.name}
          value={lifecycle.value}
          options={LIFECYCLE_OPTIONS}
          onChange={(option) =>
            lifecycle.onChange({ target: { value: option.value } })
          }
          width="100%"
        />
      </FieldRow>
      <TextField label="Planted on:" type="date" {...form.field('plantedAt')} />
    </FormDialog>
  );
}
