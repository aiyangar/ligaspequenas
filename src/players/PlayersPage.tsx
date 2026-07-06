import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link as RouterLink } from 'react-router-dom'
import Box from '@mui/material/Box'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import Button from '@mui/material/Button'
import Typography from '@mui/material/Typography'
import List from '@mui/material/List'
import ListItemButton from '@mui/material/ListItemButton'
import ListItemText from '@mui/material/ListItemText'
import { useTenant } from '../tenant/TenantContext'
import { isAdmin } from '../lib/authorize'
import { fetchPlayers, playerCategoryText } from './players'
import type { PlayerRow, PlayerStatus } from './players'

export function PlayersPage() {
  const { role } = useTenant()
  const [players, setPlayers] = useState<PlayerRow[]>([])
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('')
  const [status, setStatus] = useState<'' | PlayerStatus>('')
  const [team, setTeam] = useState('')

  const load = useCallback(async (): Promise<PlayerRow[]> => fetchPlayers(), [])

  useEffect(() => {
    let active = true
    void load().then((rows) => {
      if (active) setPlayers(rows)
    })
    return () => {
      active = false
    }
  }, [load])

  const categories = useMemo(() => {
    const names = players.map((p) => p.category_name).filter((n): n is string => Boolean(n))
    return Array.from(new Set(names)).sort()
  }, [players])

  const teams = useMemo(() => {
    const names = players.map((p) => p.team_name).filter((n): n is string => Boolean(n))
    return Array.from(new Set(names)).sort()
  }, [players])

  const visible = players.filter((p) => {
    if (search && !p.full_name.toLowerCase().includes(search.toLowerCase())) return false
    if (category && p.category_name !== category) return false
    if (status && p.status !== status) return false
    if (team && p.team_name !== team) return false
    return true
  })

  return (
    <Box sx={{ maxWidth: 720, mx: 'auto', mt: 4, px: 2 }}>
      <Stack
        direction={{ xs: 'column', sm: 'row' }}
        spacing={2}
        useFlexGap
        sx={{ flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between' }}
      >
        <Typography variant="h4" component="h1">
          Jugadores
        </Typography>
        {isAdmin(role) && (
          <Button variant="contained" component={RouterLink} to="/jugadores/nuevo">
            Nuevo jugador
          </Button>
        )}
      </Stack>

      <Stack
        direction={{ xs: 'column', sm: 'row' }}
        spacing={2}
        useFlexGap
        sx={{ flexWrap: 'wrap', alignItems: 'center', mt: 2 }}
      >
        <TextField
          label="Buscar por nombre"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          sx={{ flexGrow: 1, minWidth: 200 }}
        />
        <TextField
          select
          label="Categoría"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          slotProps={{ select: { native: true }, inputLabel: { shrink: true } }}
          sx={{ minWidth: 180 }}
        >
          <option value="">Todas</option>
          {categories.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </TextField>
        <TextField
          select
          label="Estatus"
          value={status}
          onChange={(e) => setStatus(e.target.value as '' | PlayerStatus)}
          slotProps={{ select: { native: true }, inputLabel: { shrink: true } }}
          sx={{ minWidth: 140 }}
        >
          <option value="">Todos</option>
          <option value="activo">Activo</option>
          <option value="baja">Baja</option>
        </TextField>
        <TextField
          select
          label="Equipo"
          value={team}
          onChange={(e) => setTeam(e.target.value)}
          slotProps={{ select: { native: true }, inputLabel: { shrink: true } }}
          sx={{ minWidth: 160 }}
        >
          <option value="">Todos</option>
          {teams.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </TextField>
      </Stack>

      <List sx={{ mt: 2 }}>
        {visible.map((p) => (
          <ListItemButton key={p.id} component={RouterLink} to={`/jugadores/${p.id}`}>
            <ListItemText
              primary={p.full_name}
              secondary={`${playerCategoryText(p)} · ${p.status}${p.team_name ? ` · ${p.team_name}` : ''}`}
            />
          </ListItemButton>
        ))}
      </List>
    </Box>
  )
}
