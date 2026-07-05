import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import type { CategoryRow, TeamFormValues } from './teams'

export interface TeamFormProps {
  values: TeamFormValues
  categories: CategoryRow[]
  onChange: (next: TeamFormValues) => void
  disabled?: boolean
  categoryLocked?: boolean
}

export function TeamForm({ values, categories, onChange, disabled, categoryLocked }: TeamFormProps) {
  const set = (patch: Partial<TeamFormValues>) => onChange({ ...values, ...patch })
  return (
    <Stack spacing={2}>
      <TextField
        label="Nombre"
        value={values.name}
        onChange={(e) => set({ name: e.target.value })}
        required
        disabled={disabled}
      />
      <TextField
        select
        label="Categoría"
        value={values.category_id}
        onChange={(e) => set({ category_id: e.target.value })}
        disabled={disabled || categoryLocked}
        helperText={categoryLocked ? 'Vacía el roster para cambiar la categoría.' : undefined}
        slotProps={{ select: { native: true }, inputLabel: { shrink: true } }}
        sx={{ minWidth: 200 }}
      >
        {categories.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </TextField>
      <TextField
        label="Coach"
        value={values.coach}
        onChange={(e) => set({ coach: e.target.value })}
        disabled={disabled}
      />
      <TextField
        label="Color"
        value={values.color}
        onChange={(e) => set({ color: e.target.value })}
        disabled={disabled}
      />
    </Stack>
  )
}
