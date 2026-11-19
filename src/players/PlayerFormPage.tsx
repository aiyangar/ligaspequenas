import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import Box from '@mui/material/Box'
import Stack from '@mui/material/Stack'
import Button from '@mui/material/Button'
import Typography from '@mui/material/Typography'
import Alert from '@mui/material/Alert'
import Snackbar from '@mui/material/Snackbar'
import TextField from '@mui/material/TextField'
import { useTenant } from '../tenant/TenantContext'
import { isAdmin } from '../lib/authorize'
import { LoadError } from '../app/LoadError'
import { NotFoundState } from '../app/NotFoundState'
import { PlayerForm } from './PlayerForm'
import {
  fetchPlayer,
  createPlayer,
  updatePlayer,
  emptyPlayer,
  rowToValues,
  playerCategoryText,
} from './players'
import type { PlayerFormValues, PlayerRow } from './players'
import { fetchTeams, fetchActiveSeason, assignPlayer, movePlayer, removeFromRoster } from '../teams/teams'
import type { TeamRow, SeasonRow } from '../teams/teams'
import { consentGranted, fetchPlayerDocuments } from '../documents/documents'
import type { DocumentRow } from '../documents/documents'
import { PlayerDocumentsSection } from '../documents/PlayerDocumentsSection'
import { PlayerPhoto } from './PlayerPhoto'
import { PlayerPaymentsSection } from '../payments/PlayerPaymentsSection'

function flashOf(state: unknown): string | null {
  return (state as { flash?: string } | null)?.flash ?? null
}

export function PlayerFormPage() {
  const { id } = useParams()
  // Remount per id so no state from the previous player (row, loaded, in-flight setRow) leaks in.
  return <PlayerFormContent key={id ?? 'new'} id={id} />
}

function PlayerFormContent({ id }: { id: string | undefined }) {
  const navigate = useNavigate()
  const location = useLocation()
  const { role, tenantId } = useTenant()
  const editing = Boolean(id)
  const canEdit = isAdmin(role)

  const [values, setValues] = useState<PlayerFormValues>(emptyPlayer())
  const [row, setRow] = useState<PlayerRow | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [loadError, setLoadError] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)
  const [loaded, setLoaded] = useState(false)
  // the create flow lands on a fresh instance (keyed by id), so its flash is read once here
  const [toast, setToast] = useState<string | null>(() => flashOf(location.state))
  // a new key per message remounts the Snackbar, so a replacing toast gets its full autoHideDuration
  const [toastKey, setToastKey] = useState(0)
  const hasFlash = flashOf(location.state) !== null

  useEffect(() => {
    // history state survives a reload, so drop the flash once the toast holds it
    if (hasFlash) void navigate(location.pathname, { replace: true, state: null })
  }, [hasFlash, location.pathname, navigate])

  useEffect(() => {
    if (!id) return
    let active = true
    void fetchPlayer(id)
      .then((r) => {
        if (!active) return
        setLoadError(false)
        setLoaded(true)
        if (!r) return
        setRow(r)
        setValues(rowToValues(r))
      })
      .catch(() => {
        if (active) setLoadError(true)
      })
    return () => {
      active = false
    }
  }, [id, reloadKey])

  const [teams, setTeams] = useState<TeamRow[]>([])
  const [season, setSeason] = useState<SeasonRow | null>(null)
  const [teamsLoadError, setTeamsLoadError] = useState(false)
  const [teamsReloadKey, setTeamsReloadKey] = useState(0)

  useEffect(() => {
    if (!editing) return
    let active = true
    void Promise.all([fetchTeams(), fetchActiveSeason()])
      .then(([ts, s]) => {
        if (!active) return
        setTeamsLoadError(false)
        setTeams(ts)
        setSeason(s)
      })
      .catch(() => {
        if (active) setTeamsLoadError(true)
      })
    return () => {
      active = false
    }
  }, [editing, teamsReloadKey])

  const [documents, setDocuments] = useState<DocumentRow[] | null>(null)
  const [docsLoadError, setDocsLoadError] = useState(false)
  const [docsReloadKey, setDocsReloadKey] = useState(0)

  useEffect(() => {
    if (!id) return
    let active = true
    void fetchPlayerDocuments(id)
      .then((ds) => {
        if (!active) return
        setDocsLoadError(false)
        setDocuments(ds)
      })
      .catch(() => {
        if (active) setDocsLoadError(true)
      })
    return () => {
      active = false
    }
  }, [id, docsReloadKey])

  function retryDocuments() {
    setDocsLoadError(false)
    setDocsReloadKey((k) => k + 1)
  }

  // awaited by the section so its controls stay busy until fresh rows arrive
  async function refreshDocuments() {
    if (!id) return
    try {
      setDocuments(await fetchPlayerDocuments(id))
    } catch {
      setDocsLoadError(true)
    }
  }

  function showToast(text: string) {
    setToastKey((k) => k + 1)
    setToast(text)
  }

  // only the row is replaced: typed values stay, while category and team rules follow the saved data
  async function refreshRow(playerId: string) {
    try {
      const refreshed = await fetchPlayer(playerId)
      if (refreshed) setRow(refreshed)
    } catch {
      setMessage('Error: no se pudo actualizar la vista. Recarga la página.')
    }
  }

  function handleRetry() {
    setLoadError(false)
    setReloadKey((k) => k + 1)
  }

  function handleTeamsRetry() {
    setTeamsLoadError(false)
    setTeamsReloadKey((k) => k + 1)
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setMessage(null)
    if (!tenantId) {
      setMessage('Error: no hay tenant activo')
      return
    }
    setSubmitting(true)
    if (editing) {
      const result = await updatePlayer(id!, values)
      setSubmitting(false)
      if (!result.ok) {
        setMessage(`Error: ${result.error ?? 'no se pudo guardar'}`)
        return
      }
      showToast('Cambios guardados')
      await refreshRow(id!)
    } else {
      const result = await createPlayer(values, tenantId)
      setSubmitting(false)
      if (!result.ok) {
        setMessage(`Error: ${result.error ?? 'no se pudo guardar'}`)
        return
      }
      void navigate(`/jugadores/${result.id!}`, { state: { flash: 'Jugador creado' } })
    }
  }

  const categoryText = row ? playerCategoryText(row) : undefined

  const categoryTeams = teams.filter((t) => t.category_id === row?.category_id)
  const teamSelectDisabled =
    !canEdit || !tenantId || !season || row?.status === 'baja' || row?.category_id == null
  const currentTeamId = row?.team_id ?? ''

  async function handlePhotoChanged(text: string) {
    showToast(text)
    if (!row) return
    await refreshRow(row.id)
  }

  async function handleTeamChange(next: string) {
    if (!row || !season || !tenantId) return
    let res
    if (next === '') res = await removeFromRoster(row.id, season.id)
    else if (currentTeamId === '') res = await assignPlayer(next, row.id, tenantId, season.id)
    else res = await movePlayer(row.id, season.id, next)
    if (!res.ok) {
      setMessage(`Error: ${res.error ?? 'no se pudo actualizar el equipo'}`)
      return
    }
    await refreshRow(row.id)
  }

  if (loadError) {
    return (
      <Box sx={{ maxWidth: 640, mx: 'auto', mt: 4, px: 2 }}>
        <LoadError onRetry={handleRetry} />
      </Box>
    )
  }

  if (editing && !loaded) return <Typography sx={{ p: 2 }}>Cargando…</Typography>

  if (editing && !row) {
    return (
      <Box sx={{ maxWidth: 640, mx: 'auto', mt: 4, px: 2 }}>
        <NotFoundState title="Jugador no encontrado" backTo="/" backLabel="Volver a Jugadores" />
      </Box>
    )
  }

  return (
    <Box sx={{ maxWidth: 640, mx: 'auto', mt: 4, px: 2 }}>
      <Stack spacing={3}>
        <Typography variant="h4" component="h1">
          {editing ? 'Jugador' : 'Nuevo jugador'}
        </Typography>
        <Box component="form" onSubmit={handleSubmit}>
          <Stack spacing={2}>
            <PlayerForm values={values} onChange={setValues} disabled={!canEdit} categoryText={categoryText} />
            {message && (
              <Alert role="alert" severity={message.startsWith('Error') ? 'error' : 'success'} sx={{ mt: 1 }}>
                {message}
              </Alert>
            )}
            {canEdit && (
              <Button type="submit" variant="contained" disabled={submitting}>
                Guardar
              </Button>
            )}
          </Stack>
        </Box>
        {editing && row && (teamsLoadError ? (
          <LoadError message="No se pudieron cargar los equipos." onRetry={handleTeamsRetry} />
        ) : (
          <TextField
            select
            label="Equipo"
            value={currentTeamId}
            onChange={(e) => handleTeamChange(e.target.value)}
            disabled={teamSelectDisabled}
            helperText={
              !canEdit
                ? 'Solo lectura: solo un administrador puede cambiar el equipo.'
                : !tenantId
                  ? 'No hay liga activa.'
                  : row.category_id == null
                    ? 'Fuera de categoría: no asignable a un equipo.'
                    : !season
                      ? 'No hay temporada activa.'
                      : row.status === 'baja'
                        ? 'Jugador de baja: no asignable.'
                        : undefined
            }
            slotProps={{ select: { native: true }, inputLabel: { shrink: true } }}
            sx={{ minWidth: 200 }}
          >
            <option value="">Sin equipo</option>
            {categoryTeams.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </TextField>
        ))}
        {editing && row && (
          <Box component="section" aria-labelledby="photo-heading">
            <Typography id="photo-heading" variant="h6" component="h2" gutterBottom>
              Foto
            </Typography>
            <PlayerPhoto
              player={row}
              canEdit={canEdit}
              consentGranted={documents !== null && consentGranted(documents)}
              onChanged={handlePhotoChanged}
              onReload={refreshDocuments}
            />
          </Box>
        )}
        {editing && row && (docsLoadError ? (
          <LoadError message="No se pudieron cargar los documentos." onRetry={retryDocuments} />
        ) : documents && (
          <PlayerDocumentsSection
            documents={documents}
            canEdit={canEdit}
            hasPhoto={row.photo_path !== null}
            onChanged={async (text) => {
              showToast(text)
              await refreshDocuments()
            }}
            onReload={refreshDocuments}
          />
        ))}
        {editing && row && (
          <PlayerPaymentsSection
            playerId={row.id}
            tenantId={row.tenant_id}
            canEdit={canEdit}
            onChanged={showToast}
          />
        )}
      </Stack>
      <Snackbar
        key={toastKey}
        open={toast !== null}
        autoHideDuration={4000}
        onClose={() => setToast(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert onClose={() => setToast(null)} severity="success" variant="filled" sx={{ width: '100%' }}>
          {toast}
        </Alert>
      </Snackbar>
    </Box>
  )
}
