import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import type { PlayerFormValues, PlayerStatus, AffiliationStatus } from './players'

export interface PlayerFormProps {
  values: PlayerFormValues
  onChange: (next: PlayerFormValues) => void
  disabled?: boolean
  categoryText?: string
}

export function PlayerForm({ values, onChange, disabled, categoryText }: PlayerFormProps) {
  const set = (patch: Partial<PlayerFormValues>) => onChange({ ...values, ...patch })

  return (
    <Stack spacing={2}>
      <TextField
        label="Nombre completo"
        value={values.full_name}
        onChange={(e) => set({ full_name: e.target.value })}
        required
        disabled={disabled}
      />
      <TextField
        label="Fecha de nacimiento"
        type="date"
        value={values.birth_date}
        onChange={(e) => set({ birth_date: e.target.value })}
        required
        disabled={disabled}
        slotProps={{ inputLabel: { shrink: true } }}
      />
      {categoryText != null && (
        <Typography variant="body2" sx={{ color: 'text.secondary' }}>
          Categoría: {categoryText}
        </Typography>
      )}
      <TextField
        label="CURP"
        value={values.curp}
        onChange={(e) => set({ curp: e.target.value })}
        disabled={disabled}
      />
      <TextField
        select
        label="Estatus"
        value={values.status}
        onChange={(e) => set({ status: e.target.value as PlayerStatus })}
        disabled={disabled}
        slotProps={{ select: { native: true }, inputLabel: { shrink: true } }}
        sx={{ minWidth: 160 }}
      >
        <option value="activo">Activo</option>
        <option value="baja">Baja</option>
      </TextField>
      <TextField
        label="Fecha de inscripción"
        type="date"
        value={values.enrollment_date}
        onChange={(e) => set({ enrollment_date: e.target.value })}
        disabled={disabled}
        slotProps={{ inputLabel: { shrink: true } }}
      />
      <TextField
        label="Nombre del tutor"
        value={values.tutor_name}
        onChange={(e) => set({ tutor_name: e.target.value })}
        required
        disabled={disabled}
      />
      <TextField
        label="WhatsApp del tutor"
        value={values.tutor_whatsapp}
        onChange={(e) => set({ tutor_whatsapp: e.target.value })}
        required
        disabled={disabled}
      />
      <TextField
        label="Correo del tutor"
        type="email"
        value={values.tutor_email}
        onChange={(e) => set({ tutor_email: e.target.value })}
        disabled={disabled}
      />
      <TextField
        label="Contacto de emergencia"
        value={values.emergency_contact_name}
        onChange={(e) => set({ emergency_contact_name: e.target.value })}
        disabled={disabled}
      />
      <TextField
        label="Teléfono de emergencia"
        value={values.emergency_contact_phone}
        onChange={(e) => set({ emergency_contact_phone: e.target.value })}
        disabled={disabled}
      />
      <TextField
        select
        label="Estatus de afiliación"
        value={values.affiliation_status}
        onChange={(e) => set({ affiliation_status: e.target.value as AffiliationStatus })}
        disabled={disabled}
        slotProps={{ select: { native: true }, inputLabel: { shrink: true } }}
        sx={{ minWidth: 160 }}
      >
        <option value="pendiente">Pendiente</option>
        <option value="autoriza">Autoriza</option>
        <option value="no_autoriza">No autoriza</option>
      </TextField>
      <TextField
        label="Fecha de afiliación"
        type="date"
        value={values.affiliation_date}
        onChange={(e) => set({ affiliation_date: e.target.value })}
        disabled={disabled}
        slotProps={{ inputLabel: { shrink: true } }}
      />
    </Stack>
  )
}
