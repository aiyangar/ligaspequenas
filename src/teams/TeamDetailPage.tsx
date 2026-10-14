import { useCallback, useEffect, useState } from 'react'
import { Link as RouterLink, useNavigate, useParams } from 'react-router-dom'
import Box from '@mui/material/Box'
import Stack from '@mui/material/Stack'
import Button from '@mui/material/Button'
import Typography from '@mui/material/Typography'
import List from '@mui/material/List'
import ListItem from '@mui/material/ListItem'
import ListItemText from '@mui/material/ListItemText'
import Alert from '@mui/material/Alert'
import Dialog from '@mui/material/Dialog'
import DialogTitle from '@mui/material/DialogTitle'
import DialogContent from '@mui/material/DialogContent'
import DialogActions from '@mui/material/DialogActions'
import { useTenant } from '../tenant/TenantContext'
import { isAdmin } from '../lib/authorize'
import { LoadError } from '../app/LoadError'
import { NotFoundState } from '../app/NotFoundState'
import { AddPlayerDialog } from './AddPlayerDialog'
import {
  fetchTeam, fetchRoster, assignPlayer, movePlayer, removeFromRoster, deleteTeam,
} from './teams'
import type { TeamRow } from './teams'
import type { PlayerRow } from '../players/players'
import { playerCategoryText } from '../players/players'

export function TeamDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { role, tenantId } = useTenant()
  const canEdit = isAdmin(role)

  const [team, setTeam] = useState<TeamRow | null>(null)
  const [roster, setRoster] = useState<PlayerRow[]>([])
  const [addOpen, setAddOpen] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [removing, setRemoving] = useState<PlayerRow | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loadError, setLoadError] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)
  const [loaded, setLoaded] = useState(false)

  const load = useCallback(async () => {
    if (!id) return null
    const [t, r] = await Promise.all([fetchTeam(id), fetchRoster(id)])
    return { team: t, roster: r }
  }, [id])

  const refresh = useCallback(async () => {
    const res = await load()
    if (res) {
      setTeam(res.team)
      setRoster(res.roster)
    }
  }, [load])

  useEffect(() => {
    let active = true
    void load()
      .then((res) => {
        if (!active || !res) return
        setLoadError(false)
        setTeam(res.team)
        setRoster(res.roster)
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

  if (loadError) {
    return (
      <Box sx={{ maxWidth: 720, mx: 'auto', mt: 4, px: 2 }}>
        <LoadError onRetry={handleRetry} />
      </Box>
    )
  }

  if (!loaded) return <Typography sx={{ p: 2 }}>Cargando…</Typography>

  if (!team) {
    return (
      <Box sx={{ maxWidth: 720, mx: 'auto', mt: 4, px: 2 }}>
        <NotFoundState title="Equipo no encontrado" backTo="/equipos" backLabel="Volver a Equipos" />
      </Box>
    )
  }

  async function safeRefresh() {
    try {
      await refresh()
    } catch {
      setError('No se pudo actualizar la vista. Recarga la página.')
    }
  }

  async function bestEffortRefresh() {
    try {
      await refresh()
    } catch {
      // Keep the mutation error; the refresh is best-effort.
    }
  }

  async function handleAssign(playerId: string) {
    if (!tenantId) return
    const res = await assignPlayer(team!.id, playerId, tenantId, team!.season_id)
    if (!res.ok) {
      setError(res.error ?? 'No se pudo asignar')
      setAddOpen(false)
      await bestEffortRefresh()
      return
    }
    setAddOpen(false)
    await safeRefresh()
  }

  async function handleMove(playerId: string) {
    const res = await movePlayer(playerId, team!.season_id, team!.id)
    if (!res.ok) {
      setError(res.error ?? 'No se pudo mover')
      setAddOpen(false)
      await bestEffortRefresh()
      return
    }
    setAddOpen(false)
    await safeRefresh()
  }

  async function handleRemove() {
    if (!removing) return
    const res = await removeFromRoster(removing.id, team!.season_id)
    if (!res.ok) {
      setError(res.error ?? 'No se pudo quitar')
      setRemoving(null)
      await bestEffortRefresh()
      return
    }
    setRemoving(null)
    await safeRefresh()
  }

  async function handleDelete() {
    const res = await deleteTeam(team!.id)
    setConfirmDelete(false)
    if (!res.ok) {
      setError(res.error ?? 'No se pudo eliminar')
      return
    }
    void navigate('/equipos')
  }

  return (
    <Box sx={{ maxWidth: 720, mx: 'auto', mt: 4, px: 2 }}>
      <Stack
        direction={{ xs: 'column', sm: 'row' }}
        spacing={2}
        useFlexGap
        sx={{ flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between' }}
      >
        <Box>
          <Typography variant="h4" component="h1">
            {team.name}
          </Typography>
          <Typography variant="body2" sx={{ color: 'text.secondary' }}>
            {team.category_name} · {team.color ?? 'Sin color'} · {team.coach ?? 'Sin coach'}
          </Typography>
        </Box>
        {canEdit && (
          <Stack direction="row" spacing={1}>
            <Button variant="outlined" component={RouterLink} to={`/equipos/${team.id}/editar`}>
              Editar
            </Button>
            <Button color="error" variant="outlined" onClick={() => setConfirmDelete(true)}>
              Eliminar equipo
            </Button>
          </Stack>
        )}
      </Stack>

      {error && (
        <Alert role="alert" severity="error" sx={{ mt: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      <Stack direction="row" sx={{ mt: 3, alignItems: 'center', justifyContent: 'space-between' }}>
        <Typography variant="h6">Roster ({roster.length})</Typography>
        {canEdit && (
          <Button variant="contained" onClick={() => setAddOpen(true)}>
            Añadir jugador
          </Button>
        )}
      </Stack>

      <List>
        {roster.map((pl) => (
          <ListItem
            key={pl.id}
            secondaryAction={
              canEdit ? (
                <Button size="small" onClick={() => setRemoving(pl)}>
                  Quitar
                </Button>
              ) : undefined
            }
          >
            <ListItemText primary={pl.full_name} secondary={playerCategoryText(pl)} />
          </ListItem>
        ))}
      </List>

      {canEdit && (
        <AddPlayerDialog
          open={addOpen}
          categoryId={team.category_id}
          teamId={team.id}
          onAssign={handleAssign}
          onMove={(playerId) => handleMove(playerId)}
          onClose={() => setAddOpen(false)}
        />
      )}

      <Dialog open={removing !== null} onClose={() => setRemoving(null)}>
        <DialogTitle>Quitar del equipo</DialogTitle>
        <DialogContent>
          <Typography>{removing && `¿Quitar a ${removing.full_name} del equipo?`}</Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setRemoving(null)}>Cancelar</Button>
          <Button color="error" variant="contained" onClick={handleRemove}>
            Quitar del equipo
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={confirmDelete} onClose={() => setConfirmDelete(false)}>
        <DialogTitle>Eliminar equipo</DialogTitle>
        <DialogContent>
          <Typography>
            Se eliminará el equipo y se vaciará su roster. Esta acción no se puede deshacer.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmDelete(false)}>Cancelar</Button>
          <Button color="error" variant="contained" onClick={handleDelete}>
            Eliminar
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  )
}
