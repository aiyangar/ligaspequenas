import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { Link as RouterLink } from 'react-router-dom'
import Box from '@mui/material/Box'
import Chip from '@mui/material/Chip'
import List from '@mui/material/List'
import ListItemButton from '@mui/material/ListItemButton'
import ListItemText from '@mui/material/ListItemText'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { LoadError } from '../app/LoadError'
import { fetchPlayers, playerCategoryText } from '../players/players'
import type { PlayerRow } from '../players/players'
import {
  PAYMENT_STATE_LABELS,
  PAYMENT_STATUS_COLOR,
  PAYMENT_STATUS_LABELS,
  buildDebtGroups,
  fetchOutstandingPayments,
  fetchPaymentStatuses,
  formatMoney,
  paymentText,
} from './payments'
import type { DebtGroups, PaymentState } from './payments'

function GroupSection({ state, count, children }: { state: PaymentState; count: number; children: ReactNode }) {
  const headingId = `group-${state}`
  return (
    <Box component="section" aria-labelledby={headingId} sx={{ mt: 3 }}>
      <Typography id={headingId} variant="h6" component="h2">
        {`${PAYMENT_STATE_LABELS[state]} (${count})`}
      </Typography>
      {count === 0 ? (
        <Typography color="text.secondary" sx={{ mt: 1 }}>
          Nadie en este grupo.
        </Typography>
      ) : (
        <List disablePadding>{children}</List>
      )}
    </Box>
  )
}

function PlayerLink({ player, children }: { player: PlayerRow; children?: ReactNode }) {
  return (
    <ListItemButton component={RouterLink} to={`/jugadores/${player.id}`} divider sx={{ display: 'block' }}>
      <ListItemText primary={player.full_name} secondary={playerCategoryText(player)} />
      {children}
    </ListItemButton>
  )
}

export function DebtorsPage() {
  const [groups, setGroups] = useState<DebtGroups | null>(null)
  const [loadError, setLoadError] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    let active = true
    void Promise.all([fetchPlayers(), fetchPaymentStatuses(), fetchOutstandingPayments()])
      .then(([players, statuses, outstanding]) => {
        if (!active) return
        setLoadError(false)
        setGroups(buildDebtGroups(players, statuses, outstanding))
      })
      .catch(() => {
        if (active) setLoadError(true)
      })
    return () => {
      active = false
    }
  }, [reloadKey])

  function handleRetry() {
    setLoadError(false)
    setGroups(null)
    setReloadKey((k) => k + 1)
  }

  const total = groups ? groups.con_adeudo.length + groups.sin_pagos.length + groups.al_corriente.length : 0

  return (
    <Box sx={{ maxWidth: 720, mx: 'auto', mt: 4, px: 2 }}>
      <Typography variant="h4" component="h1">
        Quién debe
      </Typography>
      {loadError ? (
        <LoadError onRetry={handleRetry} />
      ) : groups === null ? (
        <Typography sx={{ mt: 2 }}>Cargando…</Typography>
      ) : total === 0 ? (
        <Typography color="text.secondary" sx={{ mt: 2 }}>
          No hay jugadores activos.
        </Typography>
      ) : (
        <>
          <GroupSection state="con_adeudo" count={groups.con_adeudo.length}>
            {groups.con_adeudo.map(({ player, payments }) => (
              <PlayerLink key={player.id} player={player}>
                <Stack spacing={0.5} sx={{ mb: 1 }}>
                  {payments.map((p) => (
                    <Stack key={p.id} direction="row" spacing={1} sx={{ alignItems: 'center', flexWrap: 'wrap', rowGap: 0.5 }}>
                      <Typography variant="body2">{`${paymentText(p)} · ${formatMoney(p.amount)}`}</Typography>
                      <Chip size="small" label={PAYMENT_STATUS_LABELS[p.status]} color={PAYMENT_STATUS_COLOR[p.status]} />
                    </Stack>
                  ))}
                </Stack>
              </PlayerLink>
            ))}
          </GroupSection>
          <GroupSection state="sin_pagos" count={groups.sin_pagos.length}>
            {groups.sin_pagos.map((player) => (
              <PlayerLink key={player.id} player={player} />
            ))}
          </GroupSection>
          <GroupSection state="al_corriente" count={groups.al_corriente.length}>
            {groups.al_corriente.map((player) => (
              <PlayerLink key={player.id} player={player} />
            ))}
          </GroupSection>
        </>
      )}
    </Box>
  )
}
