import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import Box from '@mui/material/Box'
import Stack from '@mui/material/Stack'
import Button from '@mui/material/Button'
import Typography from '@mui/material/Typography'
import Alert from '@mui/material/Alert'
import { useTenant } from '../tenant/TenantContext'
import { isAdmin } from '../lib/authorize'
import { LoadError } from '../app/LoadError'
import { TeamForm } from './TeamForm'
import {
  fetchTeam, fetchCategories, fetchActiveSeason, createTeam, updateTeam,
} from './teams'
import type { TeamFormValues, CategoryRow, SeasonRow } from './teams'

const EMPTY: TeamFormValues = { name: '', category_id: '', coach: '', color: '' }

export function TeamFormPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { role, tenantId } = useTenant()
  const editing = Boolean(id)
  const canEdit = isAdmin(role)

  const [values, setValues] = useState<TeamFormValues>(EMPTY)
  const [categories, setCategories] = useState<CategoryRow[]>([])
  const [season, setSeason] = useState<SeasonRow | null>(null)
  const [categoryLocked, setCategoryLocked] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [loadError, setLoadError] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    let active = true
    void Promise.all([
      fetchCategories(),
      fetchActiveSeason(),
      id ? fetchTeam(id) : Promise.resolve(null),
    ])
      .then(([cats, s, team]) => {
        if (!active) return
        setLoadError(false)
        setCategories(cats)
        setSeason(s)
        if (team) {
          setValues({ name: team.name, category_id: team.category_id, coach: team.coach ?? '', color: team.color ?? '' })
          setCategoryLocked(team.player_count > 0)
        } else if (!editing) {
          setValues((v) => ({ ...v, category_id: v.category_id || cats[0]?.id || '' }))
        }
        setLoaded(true)
      })
      .catch(() => {
        if (active) setLoadError(true)
      })
    return () => {
      active = false
    }
  }, [id, editing, reloadKey])

  function handleRetry() {
    setLoadError(false)
    setReloadKey((k) => k + 1)
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
      const result = await updateTeam(id!, values)
      setSubmitting(false)
      if (!result.ok) {
        setMessage(`Error: ${result.error ?? 'no se pudo guardar'}`)
        return
      }
      void navigate(`/equipos/${id!}`, { state: { flash: 'Cambios guardados' } })
    } else {
      if (!season) return
      const result = await createTeam(values, tenantId, season.id)
      setSubmitting(false)
      if (!result.ok) {
        setMessage(`Error: ${result.error ?? 'no se pudo guardar'}`)
        return
      }
      void navigate(`/equipos/${result.id!}`, { state: { flash: 'Equipo creado' } })
    }
  }

  if (loadError) {
    return (
      <Box sx={{ maxWidth: 640, mx: 'auto', mt: 4, px: 2 }}>
        <LoadError onRetry={handleRetry} />
      </Box>
    )
  }

  if (!loaded) return <Typography sx={{ p: 2 }}>Cargando…</Typography>

  if (!editing && !season) {
    return (
      <Box sx={{ maxWidth: 640, mx: 'auto', mt: 4, px: 2 }}>
        <Alert severity="warning">No hay temporada activa. No se pueden crear equipos.</Alert>
      </Box>
    )
  }

  return (
    <Box component="form" onSubmit={handleSubmit} sx={{ maxWidth: 640, mx: 'auto', mt: 4, px: 2 }}>
      <Stack spacing={2}>
        <Typography variant="h4" component="h1" gutterBottom>
          {editing ? 'Editar equipo' : 'Nuevo equipo'}
        </Typography>
        <TeamForm
          values={values}
          categories={categories}
          onChange={setValues}
          disabled={!canEdit}
          categoryLocked={editing && categoryLocked}
        />
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
  )
}
