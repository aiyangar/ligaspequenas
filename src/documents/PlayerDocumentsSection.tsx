import { useRef, useState } from 'react'
import type { ChangeEvent } from 'react'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import CircularProgress from '@mui/material/CircularProgress'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogContentText from '@mui/material/DialogContentText'
import DialogTitle from '@mui/material/DialogTitle'
import List from '@mui/material/List'
import ListItem from '@mui/material/ListItem'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import {
  DOCUMENT_LABELS,
  STATUS_LABELS,
  consentGranted,
  filesInUse,
  getSignedFileUrl,
  isConsentType,
  setDocumentStatus,
  uploadDocument,
} from './documents'
import type { DocumentRow, DocumentStatus } from './documents'

export interface PlayerDocumentsSectionProps {
  documents: DocumentRow[]
  canEdit: boolean
  hasPhoto: boolean
  onChanged: (flash: string) => Promise<void> | void
}

const CHIP_COLOR: Record<DocumentStatus, 'default' | 'info' | 'success'> = {
  pendiente: 'default',
  fisico: 'info',
  digital: 'success',
}

const ACCEPT = 'application/pdf,image/jpeg,image/png,image/webp'

export function PlayerDocumentsSection({ documents, canEdit, hasPhoto, onChanged }: PlayerDocumentsSectionProps) {
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [confirm, setConfirm] = useState<{ doc: DocumentRow; next: 'pendiente' | 'fisico' } | null>(null)
  // synchronous guard: busyId only disables controls after a re-render
  const inFlight = useRef(false)

  const granted = consentGranted(documents)
  const inUse = filesInUse(documents, hasPhoto)

  async function run(doc: DocumentRow, action: () => Promise<{ ok: boolean; error?: string }>) {
    if (inFlight.current) return
    inFlight.current = true
    setBusyId(doc.id)
    setError(null)
    try {
      const res = await action()
      // stay busy until the parent has reloaded, so no control acts on a stale row
      if (res.ok) await onChanged('Documento actualizado')
      else setError(res.error ?? 'No se pudo actualizar el documento.')
    } finally {
      inFlight.current = false
      setBusyId(null)
    }
  }

  function handleStatus(doc: DocumentRow, next: string) {
    if (next !== 'pendiente' && next !== 'fisico') return
    if (doc.status === 'digital') {
      setConfirm({ doc, next })
      return
    }
    void run(doc, () => setDocumentStatus(doc, next))
  }

  function handleConfirm() {
    if (!confirm) return
    const { doc, next } = confirm
    setConfirm(null)
    void run(doc, () => setDocumentStatus(doc, next))
  }

  function handleFile(doc: DocumentRow, e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    // consent documents are exempt from the lock, so a Storage 403 there is a real permission error
    void run(doc, () => uploadDocument(doc, file, granted || isConsentType(doc.doc_type)))
  }

  async function handleView(doc: DocumentRow) {
    if (!doc.file_path) return
    setError(null)
    // opened synchronously in the click: Safari blocks window.open after an await
    const w = window.open('', '_blank')
    if (!w) {
      setError('Tu navegador bloqueó la ventana. Permite ventanas emergentes e intenta de nuevo.')
      return
    }
    w.opener = null
    try {
      w.location.href = await getSignedFileUrl(doc.file_path)
    } catch {
      w.close()
      setError('No se pudo abrir el archivo.')
    }
  }

  return (
    <Box component="section" aria-labelledby="documents-heading">
      <Typography id="documents-heading" variant="h6" component="h2" gutterBottom>
        Documentos
      </Typography>
      {canEdit && !granted && (
        <Alert role="status" severity="info" sx={{ mb: 1 }}>
          Para subir la foto o documentos digitales, primero registra el consentimiento de imagen y el aviso de privacidad.
        </Alert>
      )}
      {error && (
        <Alert role="alert" severity="error" sx={{ mb: 1 }}>
          {error}
        </Alert>
      )}
      <List disablePadding>
        {documents.map((doc) => {
          const label = DOCUMENT_LABELS[doc.doc_type]
          const consent = isConsentType(doc.doc_type)
          const busy = busyId === doc.id
          const uploadLocked = !consent && !granted
          const pendingLocked = consent && inUse
          const uploadLabel = doc.status === 'digital' ? 'Reemplazar' : 'Subir archivo'
          return (
            <ListItem key={doc.id} aria-label={label} divider disableGutters sx={{ display: 'block', py: 1.5 }}>
              <Stack direction="row" spacing={1} sx={{ alignItems: 'center', flexWrap: 'wrap', rowGap: 1 }}>
                <Typography sx={{ flexGrow: 1, minWidth: 160 }}>{label}</Typography>
                <Chip size="small" label={STATUS_LABELS[doc.status]} color={CHIP_COLOR[doc.status]} />
                {busy && <CircularProgress size={20} aria-label="Guardando" />}
              </Stack>
              <Stack direction="row" spacing={1} sx={{ mt: 1, alignItems: 'flex-start', flexWrap: 'wrap', rowGap: 1 }}>
                {canEdit && (
                  <TextField
                    select
                    size="small"
                    label="Estatus"
                    value={doc.status}
                    onChange={(e) => handleStatus(doc, e.target.value)}
                    disabled={busy}
                    helperText={pendingLocked ? 'Quita primero la foto y los documentos digitales.' : undefined}
                    slotProps={{ select: { native: true }, inputLabel: { shrink: true } }}
                    sx={{ minWidth: 140 }}
                  >
                    <option value="pendiente" disabled={pendingLocked}>
                      Pendiente
                    </option>
                    <option value="fisico">Físico</option>
                    {doc.status === 'digital' && (
                      <option value="digital" disabled>
                        Digital
                      </option>
                    )}
                  </TextField>
                )}
                {canEdit && (
                  <Button component="label" variant="outlined" size="small" disabled={busy || uploadLocked}>
                    {uploadLabel}
                    <input
                      hidden
                      type="file"
                      accept={ACCEPT}
                      aria-label={uploadLabel}
                      disabled={busy || uploadLocked}
                      onChange={(e) => handleFile(doc, e)}
                    />
                  </Button>
                )}
                {doc.status === 'digital' && doc.file_path && (
                  <Button size="small" onClick={() => void handleView(doc)}>
                    Ver
                  </Button>
                )}
              </Stack>
            </ListItem>
          )
        })}
      </List>
      <Dialog open={confirm !== null} onClose={() => setConfirm(null)} aria-labelledby="delete-file-title">
        <DialogTitle id="delete-file-title">¿Eliminar el archivo?</DialogTitle>
        <DialogContent>
          <DialogContentText>Se eliminará el archivo subido.</DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirm(null)}>Cancelar</Button>
          <Button color="error" onClick={handleConfirm}>
            Eliminar archivo
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  )
}
