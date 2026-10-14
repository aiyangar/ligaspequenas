import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link as RouterLink } from 'react-router-dom'
import Box from '@mui/material/Box'
import Stack from '@mui/material/Stack'
import Button from '@mui/material/Button'
import Typography from '@mui/material/Typography'
import List from '@mui/material/List'
import ListSubheader from '@mui/material/ListSubheader'
import ListItemButton from '@mui/material/ListItemButton'
import ListItemText from '@mui/material/ListItemText'
import { useTenant } from '../tenant/TenantContext'
import { isAdmin } from '../lib/authorize'
import { LoadError } from '../app/LoadError'
import { fetchTeams } from './teams'
import type { TeamRow } from './teams'

export function TeamsPage() {
  const { role } = useTenant()
  const [teams, setTeams] = useState<TeamRow[]>([])
  const [loaded, setLoaded] = useState(false)
  const [loadError, setLoadError] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)

  const load = useCallback(async (): Promise<TeamRow[]> => fetchTeams(), [])

  useEffect(() => {
    let active = true
    void load()
      .then((rows) => {
        if (!active) return
        setLoadError(false)
        setTeams(rows)
        setLoaded(true)
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

  const grouped = useMemo(() => {
    const map = new Map<string, TeamRow[]>()
    for (const t of teams) {
      const list = map.get(t.category_name) ?? []
      list.push(t)
      map.set(t.category_name, list)
    }
    return Array.from(map.entries())
  }, [teams])

  return (
    <Box sx={{ maxWidth: 720, mx: 'auto', mt: 4, px: 2 }}>
      <Stack
        direction={{ xs: 'column', sm: 'row' }}
        spacing={2}
        useFlexGap
        sx={{ flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between' }}
      >
        <Typography variant="h4" component="h1">
          Equipos
        </Typography>
        {isAdmin(role) && (
          <Button variant="contained" component={RouterLink} to="/equipos/nuevo">
            Nuevo equipo
          </Button>
        )}
      </Stack>

      {loadError && <LoadError onRetry={handleRetry} />}

      {loaded && !loadError && teams.length === 0 && (
        <Typography sx={{ mt: 3, color: 'text.secondary' }}>
          No hay equipos en la temporada activa (o no hay temporada activa).
        </Typography>
      )}

      {grouped.map(([category, list]) => (
        <List
          key={category}
          subheader={<ListSubheader>{category}</ListSubheader>}
          sx={{ mt: 1 }}
        >
          {list.map((t) => (
            <ListItemButton key={t.id} component={RouterLink} to={`/equipos/${t.id}`}>
              <ListItemText
                primary={t.name}
                secondary={`${t.color ?? 'Sin color'} · ${t.coach ?? 'Sin coach'} · ${t.player_count} jugadores`}
              />
            </ListItemButton>
          ))}
        </List>
      ))}
    </Box>
  )
}
