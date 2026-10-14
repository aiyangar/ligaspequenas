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
import { LoadError } from '../app/LoadError'
import { fetchPlayers, playerCategoryText } from './players'
import type { PlayerRow, PlayerStatus } from './players'

interface FilterOption {
  id: string
  name: string
}

function uniqueOptions(pairs: Array<[string | null, string | null]>): FilterOption[] {
  const byId = new Map<string, string>()
  for (const [id, name] of pairs) if (id && name) byId.set(id, name)
  return Array.from(byId, ([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name))
}

export function PlayersPage() {
  const { role } = useTenant()
  const [players, setPlayers] = useState<PlayerRow[]>([])
  const [search, setSearch] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [status, setStatus] = useState<'' | PlayerStatus>('')
  const [teamId, setTeamId] = useState('')
  const [loadError, setLoadError] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)

  const load = useCallback(async (): Promise<PlayerRow[]> => fetchPlayers(), [])

  useEffect(() => {
    let active = true
    void load()
      .then((rows) => {
        if (!active) return
        setLoadError(false)
        setPlayers(rows)
      })
      .catch(() => {
        if (active) setLoadError(true)
      })
    return () => {
      active = false
    }
  }, [load, reloadKey])

  function handleRetry() {
    setLoadError(false)
    setReloadKey((k) => k + 1)
  }

  const categories = useMemo(
    () => uniqueOptions(players.map((p) => [p.category_id, p.category_name])),
    [players],
  )

  const teams = useMemo(
    () => uniqueOptions(players.map((p) => [p.team_id, p.team_name])),
    [players],
  )

  const visible = players.filter((p) => {
    if (search && !p.full_name.toLowerCase().includes(search.toLowerCase())) return false
    if (categoryId && p.category_id !== categoryId) return false
    if (status && p.status !== status) return false
    if (teamId && p.team_id !== teamId) return false
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

      {loadError ? (
        <LoadError onRetry={handleRetry} />
      ) : (
        <>
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
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              slotProps={{ select: { native: true }, inputLabel: { shrink: true } }}
              sx={{ minWidth: 180 }}
            >
              <option value="">Todas</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
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
              value={teamId}
              onChange={(e) => setTeamId(e.target.value)}
              slotProps={{ select: { native: true }, inputLabel: { shrink: true } }}
              sx={{ minWidth: 160 }}
            >
              <option value="">Todos</option>
              {teams.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
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
        </>
      )}
    </Box>
  )
}
