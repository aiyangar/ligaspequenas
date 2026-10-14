import { useEffect, useRef, useState } from 'react'
import type { ChangeEvent } from 'react'
import Alert from '@mui/material/Alert'
import Avatar from '@mui/material/Avatar'
import Button from '@mui/material/Button'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogContentText from '@mui/material/DialogContentText'
import DialogTitle from '@mui/material/DialogTitle'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { getSignedFileUrl } from '../documents/documents'
import { removePlayerPhoto, uploadPlayerPhoto } from './players'
import type { PlayerRow } from './players'

export interface PlayerPhotoProps {
  player: Pick<PlayerRow, 'id' | 'tenant_id' | 'full_name' | 'photo_path' | 'updated_at'>
  canEdit: boolean
  consentGranted: boolean
  onChanged: (flash: string) => Promise<void> | void
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join('')
}

export function PlayerPhoto({ player, canEdit, consentGranted, onChanged }: PlayerPhotoProps) {
  const [url, setUrl] = useState<{ key: string; src: string } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const inFlight = useRef(false)

  // keyed by path + updated_at so a replaced photo (same path) is re-signed
  const urlKey = player.photo_path ? `${player.photo_path}@${player.updated_at}` : null

  useEffect(() => {
    if (!player.photo_path || !urlKey) return
    let active = true
    void getSignedFileUrl(player.photo_path)
      .then((src) => {
        if (active) setUrl({ key: urlKey, src })
      })
      .catch(() => {
        if (active) setUrl(null)
      })
    return () => {
      active = false
    }
  }, [player.photo_path, urlKey])

  const src = url && url.key === urlKey ? url.src : undefined

  async function run(action: () => Promise<{ ok: boolean; error?: string }>) {
    if (inFlight.current) return
    inFlight.current = true
    setBusy(true)
    setError(null)
    try {
      const res = await action()
      if (res.ok) await onChanged('Foto actualizada')
      else setError(res.error ?? 'No se pudo actualizar la foto.')
    } finally {
      inFlight.current = false
      setBusy(false)
    }
  }

  function handleFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file || !consentGranted) return
    void run(() => uploadPlayerPhoto(player, file, consentGranted))
  }

  function handleRemove() {
    setConfirmOpen(false)
    void run(() => removePlayerPhoto(player))
  }

  const uploadLabel = player.photo_path ? 'Cambiar' : 'Subir foto'

  return (
    <Stack direction="row" spacing={2} sx={{ alignItems: 'center', flexWrap: 'wrap', rowGap: 1 }}>
      <Avatar src={src} alt={src ? `Foto de ${player.full_name}` : undefined} sx={{ width: 72, height: 72 }}>
        {initials(player.full_name)}
      </Avatar>
      {canEdit && (
        <Stack spacing={0.5}>
          <Stack direction="row" spacing={1}>
            <Button component="label" variant="outlined" size="small" disabled={busy || !consentGranted}>
              {uploadLabel}
              <input
                hidden
                type="file"
                accept="image/jpeg,image/png,image/webp"
                aria-label={uploadLabel}
                disabled={busy || !consentGranted}
                onChange={handleFile}
              />
            </Button>
            {player.photo_path && (
              <Button size="small" color="error" disabled={busy} onClick={() => setConfirmOpen(true)}>
                Quitar
              </Button>
            )}
          </Stack>
          {!consentGranted && (
            <Typography variant="caption" color="text.secondary">
              Requiere consentimiento de imagen y aviso de privacidad
            </Typography>
          )}
        </Stack>
      )}
      {error && (
        <Alert role="alert" severity="error" sx={{ width: '100%' }}>
          {error}
        </Alert>
      )}
      <Dialog open={confirmOpen} onClose={() => setConfirmOpen(false)} aria-labelledby="remove-photo-title">
        <DialogTitle id="remove-photo-title">¿Quitar la foto?</DialogTitle>
        <DialogContent>
          <DialogContentText>Se eliminará la foto del jugador.</DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmOpen(false)}>Cancelar</Button>
          <Button color="error" onClick={handleRemove}>
            Quitar foto
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  )
}
