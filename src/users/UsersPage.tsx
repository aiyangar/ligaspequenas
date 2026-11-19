import { useCallback, useEffect, useState } from 'react'
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
import { supabase } from '../lib/supabase'
import { inviteUser } from './inviteUser'

type Role = 'admin' | 'readonly'

interface ProfileRow {
  id: string
  full_name: string
  role: Role
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

export function UsersPage() {
  const [users, setUsers] = useState<ProfileRow[]>([])
  const [email, setEmail] = useState('')
  const [fullName, setFullName] = useState('')
  const [role, setRole] = useState<Role>('readonly')
  const [message, setMessage] = useState<string | null>(null)

  const fetchUsers = useCallback(async (): Promise<ProfileRow[]> => {
    const { data } = await supabase.from('profiles').select('id, full_name, role')
    return (data as ProfileRow[] | null) ?? []
  }, [])

  useEffect(() => {
    let active = true
    void fetchUsers().then((rows) => {
      if (active) setUsers(rows)
    })
    return () => {
      active = false
    }
  }, [fetchUsers])

  async function handleInvite(e: FormEvent) {
    e.preventDefault()
    setMessage(null)
    const result = await inviteUser({ email, fullName, role })
    if (!result.ok) {
      const reason =
        (result.error && INVITE_ERROR_MESSAGES[result.error]) || result.error || 'No se pudo enviar la invitación'
      setMessage(`Error: ${reason}`)
      return
    }
    setMessage('Usuario creado, se le envió un enlace de acceso')
    setEmail('')
    setFullName('')
    setUsers(await fetchUsers())
  }

  async function changeRole(id: string, newRole: Role) {
    await supabase.from('profiles').update({ role: newRole }).eq('id', id)
    setUsers(await fetchUsers())
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
      {message && (
        <Alert
          role="status"
          severity={message.startsWith('Error') ? 'error' : 'success'}
          sx={{ mt: 2 }}
        >
          {message}
        </Alert>
      )}
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
    </Box>
  )
}
