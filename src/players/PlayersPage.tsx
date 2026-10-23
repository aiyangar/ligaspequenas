import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link as RouterLink } from 'react-router-dom'
import Box from '@mui/material/Box'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import Button from '@mui/material/Button'
import Typography from '@mui/material/Typography'
import List from '@mui/material/List'
import ListItemButton from '@mui/material/ListItemButton'
import ListItemText from '@mui/material/ListItemText'
import Chip from '@mui/material/Chip'
import Alert from '@mui/material/Alert'
import { useTenant } from '../tenant/TenantContext'
import { isAdmin } from '../lib/authorize'
import { LoadError } from '../app/LoadError'
import { PAYMENT_STATE_COLOR, PAYMENT_STATE_LABELS } from '../payments/payments'
import type { PaymentState } from '../payments/payments'
import { DOCUMENT_TOTAL } from '../documents/documents'
import { AFFILIATION_STATUS_LABELS, fetchPlayers, playerCategoryText } from './players'
import type { AffiliationStatus, PlayerRow, PlayerStatus } from './players'
import { exportPlayersToExcel } from './exportPlayers'

interface FilterOption {
  id: string
  name: string
}

type DocsFilter = '' | 'completos' | 'incompletos'

const PAYMENT_STATE_OPTIONS: readonly PaymentState[] = ['con_adeudo', 'sin_pagos', 'al_corriente']

const AFFILIATION_OPTIONS: readonly AffiliationStatus[] = ['autoriza', 'no_autoriza', 'pendiente']

const AFFILIATION_COLOR: Record<AffiliationStatus, 'success' | 'default' | 'warning'> = {
  autoriza: 'success',
  no_autoriza: 'default',
  pendiente: 'warning',
}

function uniqueOptions(pairs: Array<[string | null, string | null]>): FilterOption[] {
  const byId = new Map<string, string>()
  for (const [id, name] of pairs) if (id && name) byId.set(id, name)
  return Array.from(byId, ([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name))
}

// >= so a count above the TS list (enum grew first) still reads as complete
function docsComplete(p: Pick<PlayerRow, 'docs_delivered'>): boolean {
  return p.docs_delivered >= DOCUMENT_TOTAL
}

export function PlayersPage() {
  const { role } = useTenant()
  const [players, setPlayers] = useState<PlayerRow[]>([])
  const [search, setSearch] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [status, setStatus] = useState<'' | PlayerStatus>('')
  const [teamId, setTeamId] = useState('')
  const [paymentState, setPaymentState] = useState<'' | PaymentState>('')
  const [docsFilter, setDocsFilter] = useState<DocsFilter>('')
  const [affiliation, setAffiliation] = useState<'' | AffiliationStatus>('')
  const [loadError, setLoadError] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)
  const [exporting, setExporting] = useState(false)
  const [exportError, setExportError] = useState<string | null>(null)
  const exportingRef = useRef(false)
  const exportButtonRef = useRef<HTMLButtonElement>(null)

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
    if (paymentState && p.payment_state !== paymentState) return false
    if (docsFilter === 'completos' && !docsComplete(p)) return false
    if (docsFilter === 'incompletos' && docsComplete(p)) return false
    if (affiliation && p.affiliation_status !== affiliation) return false
    return true
  })

  async function handleExport() {
    // state-driven disabled lands a render late; the ref stops a second click in the same tick
    if (exportingRef.current) return
    exportingRef.current = true
    setExporting(true)
    setExportError(null)
    try {
      await exportPlayersToExcel(visible)
    } catch {
      setExportError('No se pudo generar el archivo de Excel. Intenta de nuevo.')
    } finally {
      exportingRef.current = false
      setExporting(false)
      if (document.activeElement === document.body) exportButtonRef.current?.focus()
    }
  }

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
          <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: 'wrap' }}>
            <Button
              ref={exportButtonRef}
              variant="outlined"
              onClick={() => void handleExport()}
              disabled={loadError || visible.length === 0 || exporting}
              aria-busy={exporting}
            >
              Exportar a Excel
            </Button>
            <Button variant="contained" component={RouterLink} to="/jugadores/nuevo">
              Nuevo jugador
            </Button>
          </Stack>
        )}
      </Stack>

      {exportError && (
        <Alert role="alert" severity="error" sx={{ mt: 2 }}>
          {exportError}
        </Alert>
      )}

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
            <TextField
              select
              label="Pago"
              value={paymentState}
              onChange={(e) => setPaymentState(e.target.value as '' | PaymentState)}
              slotProps={{ select: { native: true }, inputLabel: { shrink: true } }}
              sx={{ minWidth: 160 }}
            >
              <option value="">Todos</option>
              {PAYMENT_STATE_OPTIONS.map((s) => (
                <option key={s} value={s}>
                  {PAYMENT_STATE_LABELS[s]}
                </option>
              ))}
            </TextField>
            <TextField
              select
              label="Documentos"
              value={docsFilter}
              onChange={(e) => setDocsFilter(e.target.value as DocsFilter)}
              slotProps={{ select: { native: true }, inputLabel: { shrink: true } }}
              sx={{ minWidth: 160 }}
            >
              <option value="">Todos</option>
              <option value="completos">Completos</option>
              <option value="incompletos">Incompletos</option>
            </TextField>
            <TextField
              select
              label="Afiliación"
              value={affiliation}
              onChange={(e) => setAffiliation(e.target.value as '' | AffiliationStatus)}
              slotProps={{ select: { native: true }, inputLabel: { shrink: true } }}
              sx={{ minWidth: 160 }}
            >
              <option value="">Todos</option>
              {AFFILIATION_OPTIONS.map((a) => (
                <option key={a} value={a}>
                  {AFFILIATION_STATUS_LABELS[a]}
                </option>
              ))}
            </TextField>
          </Stack>

          <List sx={{ mt: 2 }}>
            {visible.map((p) => (
              <ListItemButton key={p.id} component={RouterLink} to={`/jugadores/${p.id}`}>
                <Box sx={{ minWidth: 0, flex: 1 }}>
                  <ListItemText
                    primary={p.full_name}
                    secondary={`${playerCategoryText(p)} · ${p.status}${p.team_name ? ` · ${p.team_name}` : ''}`}
                  />
                  <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: 'wrap', mt: 0.5 }}>
                    <Chip
                      size="small"
                      label={PAYMENT_STATE_LABELS[p.payment_state]}
                      color={PAYMENT_STATE_COLOR[p.payment_state]}
                    />
                    <Chip
                      size="small"
                      label={`Docs ${p.docs_delivered}/${DOCUMENT_TOTAL}`}
                      color={docsComplete(p) ? 'success' : 'warning'}
                    />
                    <Chip
                      size="small"
                      label={`Afiliación: ${AFFILIATION_STATUS_LABELS[p.affiliation_status]}`}
                      color={AFFILIATION_COLOR[p.affiliation_status]}
                    />
                  </Stack>
                </Box>
              </ListItemButton>
            ))}
          </List>
        </>
      )}
    </Box>
  )
}
