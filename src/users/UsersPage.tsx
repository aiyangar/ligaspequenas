import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import Box from '@mui/material/Box'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import Button from '@mui/material/Button'
import Typography from '@mui/material/Typography'
import Alert from '@mui/material/Alert'
import List from '@mui/material/List'
import ListItem from '@mui/material/ListItem'
import ListItemText from '@mui/material/ListItemText'
import MenuItem from '@mui/material/MenuItem'
import Select from '@mui/material/Select'
import { LoadError } from '../app/LoadError'
import { supabase } from '../lib/supabase'
import { inviteUser } from './inviteUser'

type Role = 'admin' | 'readonly'

interface ProfileRow {
  id: string
  full_name: string
  role: Role
}

interface Notice {
  severity: 'success' | 'error'
  text: string
}

const ROLE_LABELS: Record<Role, string> = {
  readonly: 'Solo lectura',
  admin: 'Administrador',
}

const ROLES: Role[] = ['readonly', 'admin']

const INVITE_ERROR_MESSAGES: Record<string, string> = {
  email_exists: 'Ese correo ya está registrado',
  invalid_role: 'Rol inválido',
  forbidden: 'No tienes permiso para invitar usuarios',
}

function inviteErrorText(code: string | undefined): string {
  if (code && INVITE_ERROR_MESSAGES[code]) return INVITE_ERROR_MESSAGES[code]
  // only machine codes are shown; free-text errors (e.g. supabase-js messages) stay out of the UI
  return code && /^[a-z_]+$/.test(code) ? `No se pudo enviar la invitación (${code}).` : 'No se pudo enviar la invitación.'
}

async function fetchUsers(): Promise<ProfileRow[]> {
  const { data, error } = await supabase.from('profiles').select('id, full_name, role')
  if (error) throw new Error(error.message)
  return (data as ProfileRow[] | null) ?? []
}

export function UsersPage() {
  const [users, setUsers] = useState<ProfileRow[]>([])
  const [loadError, setLoadError] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)
  const [email, setEmail] = useState('')
  const [fullName, setFullName] = useState('')
  const [role, setRole] = useState<Role>('readonly')
  const [notice, setNotice] = useState<Notice | null>(null)

  useEffect(() => {
    let active = true
    void fetchUsers()
      .then((rows) => {
        if (!active) return
        setLoadError(false)
        setUsers(rows)
      })
      .catch(() => {
        if (active) setLoadError(true)
      })
    return () => {
      active = false
    }
  }, [reloadKey])

  function reload() {
    setReloadKey((k) => k + 1)
  }

  function handleRetry() {
    setLoadError(false)
    reload()
  }

  async function handleInvite(e: FormEvent) {
    e.preventDefault()
    setNotice(null)
    const result = await inviteUser({ email, fullName, role })
    if (!result.ok) {
      setNotice({ severity: 'error', text: inviteErrorText(result.error) })
      return
    }
    setNotice({ severity: 'success', text: 'Usuario creado, se le envió un enlace de acceso' })
    setEmail('')
    setFullName('')
    reload()
  }

  async function changeRole(id: string, newRole: Role) {
    setNotice(null)
    const { error } = await supabase.from('profiles').update({ role: newRole }).eq('id', id)
    if (error) {
      setNotice({ severity: 'error', text: 'No se pudo cambiar el rol.' })
      return
    }
    reload()
  }

  return (
    <Box sx={{ maxWidth: 640, mx: 'auto', mt: 4, px: 2 }}>
      <Typography variant="h4" component="h1" gutterBottom>Usuarios</Typography>
      <Stack
        component="form"
        onSubmit={handleInvite}
        direction={{ xs: 'column', sm: 'row' }}
        spacing={2}
        useFlexGap
        sx={{ flexWrap: 'wrap', alignItems: 'center' }}
      >
        <TextField
          type="email"
          placeholder="Correo"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <TextField
          type="text"
          placeholder="Nombre completo"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          required
        />
        <TextField
          select
          label="Rol de la invitación"
          value={role}
          onChange={(e) => setRole(e.target.value as Role)}
          sx={{ minWidth: 160 }}
        >
          {ROLES.map((r) => (
            <MenuItem key={r} value={r}>
              {ROLE_LABELS[r]}
            </MenuItem>
          ))}
        </TextField>
        <Button type="submit" variant="contained">Invitar</Button>
      </Stack>
      {notice && (
        <Alert role={notice.severity === 'error' ? 'alert' : 'status'} severity={notice.severity} sx={{ mt: 2 }}>
          {notice.text}
        </Alert>
      )}
      {loadError ? (
        <LoadError message="No se pudieron cargar los usuarios." onRetry={handleRetry} />
      ) : (
        <List sx={{ mt: 2 }}>
          {users.map((u) => (
            <ListItem
              key={u.id}
              secondaryAction={
                <Select
                  size="small"
                  value={u.role}
                  onChange={(e) => void changeRole(u.id, e.target.value as Role)}
                  inputProps={{ 'aria-label': `Rol de ${u.full_name}` }}
                  sx={{ minWidth: 150 }}
                >
                  {ROLES.map((r) => (
                    <MenuItem key={r} value={r}>
                      {ROLE_LABELS[r]}
                    </MenuItem>
                  ))}
                </Select>
              }
            >
              <ListItemText primary={u.full_name} />
            </ListItem>
          ))}
        </List>
      )}
    </Box>
  )
}
