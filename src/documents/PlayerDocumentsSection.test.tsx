import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, expect, vi } from 'vitest'
import { PlayerDocumentsSection } from './PlayerDocumentsSection'
import { DOCUMENT_TYPES } from './documents'
import type { DocumentRow, DocumentType, DocumentStatus } from './documents'

const mocks = vi.hoisted(() => ({
  setDocumentStatus: vi.fn(),
  uploadDocument: vi.fn(),
  getSignedFileUrl: vi.fn(),
}))
vi.mock('./documents', async (importActual) => {
  const actual = await importActual<typeof import('./documents')>()
  return {
    ...actual,
    setDocumentStatus: mocks.setDocumentStatus,
    uploadDocument: mocks.uploadDocument,
    getSignedFileUrl: mocks.getSignedFileUrl,
  }
})

function docs(over: Partial<Record<DocumentType, DocumentStatus>> = {}): DocumentRow[] {
  return DOCUMENT_TYPES.map((t, i) => {
    const status = over[t] ?? 'pendiente'
    return {
      id: `d${i}`, tenant_id: 't1', player_id: 'p1', doc_type: t, status,
      file_path: status === 'digital' ? `t1/p1/${t}` : null, updated_at: '',
    }
  })
}

const granted = { image_consent: 'fisico', privacy_notice: 'fisico' } as const

function row(label: string) {
  return screen.getByRole('listitem', { name: label })
}

function renderSection(props: Partial<Parameters<typeof PlayerDocumentsSection>[0]> = {}) {
  const onChanged = vi.fn()
  render(
    <PlayerDocumentsSection documents={docs()} canEdit hasPhoto={false} onChanged={onChanged} {...props} />,
  )
  return { onChanged }
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.setDocumentStatus.mockResolvedValue({ ok: true })
  mocks.uploadDocument.mockResolvedValue({ ok: true })
  mocks.getSignedFileUrl.mockResolvedValue('https://signed/url')
})

test('lists the 6 documents with their status', () => {
  renderSection({ documents: docs({ curp: 'fisico', image_consent: 'digital' }) })
  expect(screen.getByRole('heading', { name: 'Documentos' })).toBeInTheDocument()
  // ignore the native <option>s of the status select, which repeat the same words
  expect(within(row('CURP')).getByText('Físico', { ignore: 'option' })).toBeInTheDocument()
  expect(within(row('Consentimiento de imagen')).getByText('Digital', { ignore: 'option' })).toBeInTheDocument()
  expect(within(row('Constancia médica')).getByText('Pendiente', { ignore: 'option' })).toBeInTheDocument()
  expect(screen.getAllByRole('listitem')).toHaveLength(6)
})

test('readonly sees statuses and Ver only', () => {
  renderSection({ canEdit: false, documents: docs({ ...granted, curp: 'digital' }) })
  expect(screen.queryByRole('combobox')).not.toBeInTheDocument()
  expect(screen.queryByText('Subir archivo')).not.toBeInTheDocument()
  expect(within(row('CURP')).getByRole('button', { name: 'Ver' })).toBeInTheDocument()
})

test('without consent the lock alert shows and non-consent uploads are disabled', () => {
  renderSection()
  expect(screen.getByText(/Para subir la foto o documentos digitales/)).toBeInTheDocument()
  expect(within(row('CURP')).getByLabelText('Subir archivo')).toBeDisabled()
  expect(within(row('Consentimiento de imagen')).getByLabelText('Subir archivo')).toBeEnabled()
  expect(within(row('Aviso de privacidad')).getByLabelText('Subir archivo')).toBeEnabled()
})

test('with consent there is no lock alert and every upload is enabled', () => {
  renderSection({ documents: docs(granted) })
  expect(screen.queryByText(/Para subir la foto o documentos digitales/)).not.toBeInTheDocument()
  expect(within(row('CURP')).getByLabelText('Subir archivo')).toBeEnabled()
})

test('changing a non-digital status calls setDocumentStatus directly', async () => {
  const user = userEvent.setup()
  const { onChanged } = renderSection()
  await user.selectOptions(within(row('CURP')).getByRole('combobox'), 'fisico')
  await waitFor(() => expect(mocks.setDocumentStatus).toHaveBeenCalledWith(expect.objectContaining({ doc_type: 'curp' }), 'fisico'))
  expect(onChanged).toHaveBeenCalledWith('Documento actualizado')
})

test('leaving digital asks for confirmation; Cancelar does nothing', async () => {
  const user = userEvent.setup()
  renderSection({ documents: docs({ ...granted, curp: 'digital' }) })
  await user.selectOptions(within(row('CURP')).getByRole('combobox'), 'fisico')
  const dialog = await screen.findByRole('dialog', { name: '¿Eliminar el archivo?' })
  expect(within(dialog).getByText('Se eliminará el archivo subido.')).toBeInTheDocument()
  await user.click(within(dialog).getByRole('button', { name: 'Cancelar' }))
  expect(mocks.setDocumentStatus).not.toHaveBeenCalled()
})

test('leaving digital and confirming calls setDocumentStatus', async () => {
  const user = userEvent.setup()
  renderSection({ documents: docs({ ...granted, curp: 'digital' }) })
  await user.selectOptions(within(row('CURP')).getByRole('combobox'), 'pendiente')
  await user.click(await screen.findByRole('button', { name: 'Eliminar archivo' }))
  await waitFor(() => expect(mocks.setDocumentStatus).toHaveBeenCalledWith(expect.objectContaining({ doc_type: 'curp' }), 'pendiente'))
})

test('Pendiente is disabled on consents while files are in use', () => {
  renderSection({ documents: docs({ ...granted, curp: 'digital' }) })
  const select = within(row('Aviso de privacidad')).getByRole('combobox')
  expect(within(select).getByRole('option', { name: 'Pendiente' })).toBeDisabled()
  expect(within(row('Aviso de privacidad')).getByText('Quita primero la foto y los documentos digitales.')).toBeInTheDocument()
})

test('Pendiente on consents is also disabled when only the photo exists', () => {
  renderSection({ documents: docs(granted), hasPhoto: true })
  const select = within(row('Consentimiento de imagen')).getByRole('combobox')
  expect(within(select).getByRole('option', { name: 'Pendiente' })).toBeDisabled()
})

test('uploading a file calls uploadDocument and reports success', async () => {
  const user = userEvent.setup()
  const { onChanged } = renderSection({ documents: docs(granted) })
  const f = new File(['x'], 'curp.pdf', { type: 'application/pdf' })
  await user.upload(within(row('CURP')).getByLabelText('Subir archivo'), f)
  await waitFor(() => expect(mocks.uploadDocument).toHaveBeenCalledWith(expect.objectContaining({ doc_type: 'curp' }), f, true))
  expect(onChanged).toHaveBeenCalledWith('Documento actualizado')
})

test('a failed upload shows the translated error and does not report success', async () => {
  mocks.uploadDocument.mockResolvedValueOnce({ ok: false, error: 'El archivo supera 10 MB.' })
  const user = userEvent.setup()
  const { onChanged } = renderSection({ documents: docs(granted) })
  await user.upload(within(row('CURP')).getByLabelText('Subir archivo'), new File(['x'], 'a.pdf', { type: 'application/pdf' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('El archivo supera 10 MB.')
  expect(onChanged).not.toHaveBeenCalled()
})

test('cancelling the file picker changes nothing', () => {
  renderSection({ documents: docs(granted) })
  fireEvent.change(within(row('CURP')).getByLabelText('Subir archivo'), { target: { files: [] } })
  expect(mocks.uploadDocument).not.toHaveBeenCalled()
})

test('consent uploads pass consentGranted=true so a Storage 403 is not reported as the lock', async () => {
  mocks.uploadDocument.mockResolvedValueOnce({ ok: true })
  const user = userEvent.setup()
  renderSection()
  const f = new File(['x'], 'aviso.pdf', { type: 'application/pdf' })
  await user.upload(within(row('Aviso de privacidad')).getByLabelText('Subir archivo'), f)
  await waitFor(() =>
    expect(mocks.uploadDocument).toHaveBeenCalledWith(expect.objectContaining({ doc_type: 'privacy_notice' }), f, true),
  )
})

test('controls stay disabled until the parent reload finishes', async () => {
  let finishReload!: () => void
  const onChanged = vi.fn(() => new Promise<void>((r) => { finishReload = r }))
  const user = userEvent.setup()
  render(<PlayerDocumentsSection documents={docs(granted)} canEdit hasPhoto={false} onChanged={onChanged} />)
  const input = within(row('CURP')).getByLabelText('Subir archivo')
  await user.upload(input, new File(['x'], 'a.pdf', { type: 'application/pdf' }))
  await waitFor(() => expect(onChanged).toHaveBeenCalledWith('Documento actualizado'))
  expect(input).toBeDisabled()
  finishReload()
  await waitFor(() => expect(input).toBeEnabled())
})

test('a digital row offers Reemplazar instead of Subir archivo', () => {
  renderSection({ documents: docs({ ...granted, curp: 'digital' }) })
  expect(within(row('CURP')).getByLabelText('Reemplazar')).toBeEnabled()
  expect(within(row('CURP')).queryByLabelText('Subir archivo')).not.toBeInTheDocument()
})

test('a second upload while one is in flight is ignored', async () => {
  let resolve!: (v: { ok: boolean }) => void
  mocks.uploadDocument.mockReturnValueOnce(new Promise((r) => { resolve = r }))
  const user = userEvent.setup()
  renderSection({ documents: docs(granted) })
  const input = within(row('CURP')).getByLabelText('Subir archivo')
  const f = new File(['x'], 'a.pdf', { type: 'application/pdf' })
  await user.upload(input, f)
  await user.upload(input, f)
  expect(mocks.uploadDocument).toHaveBeenCalledTimes(1)
  resolve({ ok: true })
})

test('Ver opens the tab synchronously, drops the opener and assigns the signed URL', async () => {
  const fakeWin = { opener: {} as unknown, location: { href: '' }, close: vi.fn() }
  const open = vi.spyOn(window, 'open').mockReturnValue(fakeWin as unknown as Window)
  const user = userEvent.setup()
  renderSection({ documents: docs({ ...granted, curp: 'digital' }) })
  await user.click(within(row('CURP')).getByRole('button', { name: 'Ver' }))
  expect(open).toHaveBeenCalledWith('', '_blank')
  await waitFor(() => expect(fakeWin.location.href).toBe('https://signed/url'))
  expect(fakeWin.opener).toBeNull()
  expect(mocks.getSignedFileUrl).toHaveBeenCalledWith('t1/p1/curp')
  open.mockRestore()
})

test('Ver closes the tab and shows an error when signing fails', async () => {
  const fakeWin = { opener: null, location: { href: '' }, close: vi.fn() }
  const open = vi.spyOn(window, 'open').mockReturnValue(fakeWin as unknown as Window)
  mocks.getSignedFileUrl.mockRejectedValueOnce(new Error('Object not found'))
  const user = userEvent.setup()
  renderSection({ documents: docs({ ...granted, curp: 'digital' }) })
  await user.click(within(row('CURP')).getByRole('button', { name: 'Ver' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo abrir el archivo.')
  expect(fakeWin.close).toHaveBeenCalled()
  open.mockRestore()
})

test('Ver with a blocked popup shows a hint and does not sign', async () => {
  const open = vi.spyOn(window, 'open').mockReturnValue(null)
  const user = userEvent.setup()
  renderSection({ documents: docs({ ...granted, curp: 'digital' }) })
  await user.click(within(row('CURP')).getByRole('button', { name: 'Ver' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Tu navegador bloqueó la ventana. Permite ventanas emergentes e intenta de nuevo.')
  expect(mocks.getSignedFileUrl).not.toHaveBeenCalled()
  open.mockRestore()
})
