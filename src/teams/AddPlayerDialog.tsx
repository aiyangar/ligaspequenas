import { useEffect, useMemo, useState } from 'react'
import Dialog from '@mui/material/Dialog'
import DialogTitle from '@mui/material/DialogTitle'
import DialogContent from '@mui/material/DialogContent'
import DialogActions from '@mui/material/DialogActions'
import Button from '@mui/material/Button'
import TextField from '@mui/material/TextField'
import List from '@mui/material/List'
import ListSubheader from '@mui/material/ListSubheader'
import ListItemButton from '@mui/material/ListItemButton'
import ListItemText from '@mui/material/ListItemText'
import Typography from '@mui/material/Typography'
import { LoadError } from '../app/LoadError'
import { fetchEligiblePlayers, groupEligibleByCurrentTeam } from './teams'
import type { PlayerRow } from '../players/players'

export interface AddPlayerDialogProps {
  open: boolean
  categoryId: string
  teamId: string
  onAssign: (playerId: string) => void
  onMove: (playerId: string, fromTeamName: string) => void
  onClose: () => void
}

interface Pending {
  player: PlayerRow
  fromTeamName: string
}

export function AddPlayerDialog({ open, categoryId, teamId, onAssign, onMove, onClose }: AddPlayerDialogProps) {
  const [players, setPlayers] = useState<PlayerRow[]>([])
  const [search, setSearch] = useState('')
  const [pending, setPending] = useState<Pending | null>(null)
  const [loadError, setLoadError] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)

  // Reset search/pending inside the async callback (not synchronously in the
  // effect body) to satisfy react-hooks/set-state-in-effect.
  useEffect(() => {
    if (!open) return
    let active = true
    void fetchEligiblePlayers(categoryId, teamId)
      .then((rows) => {
        if (!active) return
        setLoadError(false)
        setPlayers(rows)
        setSearch('')
        setPending(null)
      })
      .catch(() => {
        if (active) setLoadError(true)
      })
    return () => {
      active = false
    }
  }, [open, categoryId, teamId, reloadKey])

  function handleRetry() {
    setLoadError(false)
    setReloadKey((k) => k + 1)
  }

  const groups = useMemo(() => {
    const filtered = players.filter((p) =>
      p.full_name.toLowerCase().includes(search.toLowerCase()),
    )
    return groupEligibleByCurrentTeam(filtered)
  }, [players, search])

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>Añadir jugador</DialogTitle>
      <DialogContent>
        {loadError ? (
          <LoadError onRetry={handleRetry} />
        ) : (
          <>
            <TextField
              label="Buscar por nombre"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              fullWidth
              sx={{ mt: 1 }}
            />
            {groups.length === 0 && (
              <Typography sx={{ mt: 2, color: 'text.secondary' }}>
                No hay jugadores elegibles.
              </Typography>
            )}
            {groups.map((g) => (
              <List
                key={g.teamId ?? 'free'}
                subheader={<ListSubheader>{g.teamId ? `En ${g.teamName}` : 'Sin equipo'}</ListSubheader>}
              >
                {g.players.map((p) => (
                  <ListItemButton
                    key={p.id}
                    onClick={() =>
                      g.teamId
                        ? setPending({ player: p, fromTeamName: g.teamName ?? '' })
                        : onAssign(p.id)
                    }
                  >
                    <ListItemText primary={p.full_name} secondary={`edad ${p.edad_liga ?? '—'}`} />
                  </ListItemButton>
                ))}
              </List>
            ))}
          </>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cerrar</Button>
      </DialogActions>

      <Dialog open={pending !== null} onClose={() => setPending(null)}>
        <DialogTitle>Mover jugador</DialogTitle>
        <DialogContent>
          <Typography>
            {pending && `Se moverá de ${pending.fromTeamName} a este equipo.`}
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPending(null)}>Cancelar</Button>
          <Button
            variant="contained"
            onClick={() => {
              if (pending) onMove(pending.player.id, pending.fromTeamName)
              setPending(null)
            }}
          >
            Mover
          </Button>
        </DialogActions>
      </Dialog>
    </Dialog>
  )
}
