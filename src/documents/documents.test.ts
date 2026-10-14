import { beforeEach, expect, vi } from 'vitest'
import {
  DOCUMENT_TYPES, consentGranted, filesInUse, playerFilePath, documentErrorMessage,
  validateDocumentFile, fetchPlayerDocuments, removeFile, setDocumentStatus, uploadDocument,
  getSignedFileUrl, CONSENT_REQUIRED_MESSAGE,
} from './documents'
import type { DocumentRow } from './documents'

const mocks = vi.hoisted(() => ({
  from: vi.fn(), select: vi.fn(), selectEq: vi.fn(), update: vi.fn(), updateEq: vi.fn(),
  storageFrom: vi.fn(), upload: vi.fn(), remove: vi.fn(), list: vi.fn(), createSignedUrl: vi.fn(),
  calls: [] as string[],
}))
vi.mock('../lib/supabase', () => ({
  supabase: { from: mocks.from, storage: { from: mocks.storageFrom } },
}))

function doc(over: Partial<DocumentRow> = {}): DocumentRow {
  return {
    id: 'd1', tenant_id: 't1', player_id: 'p1', doc_type: 'curp', status: 'pendiente',
    file_path: null, updated_at: '', ...over,
  }
}

function file(type: string, size: number): File {
  const f = new File(['x'], 'doc', { type })
  Object.defineProperty(f, 'size', { value: size })
  return f
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.calls.length = 0
  mocks.selectEq.mockResolvedValue({ data: [], error: null })
  mocks.select.mockReturnValue({ eq: mocks.selectEq })
  mocks.updateEq.mockImplementation(async () => {
    mocks.calls.push('update')
    return { error: null }
  })
  mocks.update.mockReturnValue({ eq: mocks.updateEq })
  mocks.from.mockReturnValue({ select: mocks.select, update: mocks.update })
  mocks.upload.mockImplementation(async () => {
    mocks.calls.push('upload')
    return { data: { path: 't1/p1/curp' }, error: null }
  })
  mocks.remove.mockImplementation(async (paths: string[]) => {
    mocks.calls.push('remove')
    return { data: paths.map((name) => ({ name })), error: null }
  })
  mocks.list.mockResolvedValue({ data: [], error: null })
  mocks.createSignedUrl.mockResolvedValue({ data: { signedUrl: 'https://signed/url' }, error: null })
  mocks.storageFrom.mockReturnValue({
    upload: mocks.upload, remove: mocks.remove, list: mocks.list, createSignedUrl: mocks.createSignedUrl,
  })
})

test('consentGranted needs both consents out of pendiente', () => {
  const base = DOCUMENT_TYPES.map((t) => ({ doc_type: t, status: 'pendiente' as const }))
  expect(consentGranted(base)).toBe(false)
  const one = base.map((d) => (d.doc_type === 'image_consent' ? { ...d, status: 'fisico' as const } : d))
  expect(consentGranted(one)).toBe(false)
  const both = one.map((d) => (d.doc_type === 'privacy_notice' ? { ...d, status: 'digital' as const } : d))
  expect(consentGranted(both)).toBe(true)
  expect(consentGranted(both.filter((d) => d.doc_type !== 'privacy_notice'))).toBe(false)
})

test('filesInUse is true with a photo or a non-consent digital document', () => {
  const docs = DOCUMENT_TYPES.map((t) => ({ doc_type: t, status: 'pendiente' as const }))
  expect(filesInUse(docs, false)).toBe(false)
  expect(filesInUse(docs, true)).toBe(true)
  expect(filesInUse(docs.map((d) => (d.doc_type === 'image_consent' ? { ...d, status: 'digital' as const } : d)), false)).toBe(false)
  expect(filesInUse(docs.map((d) => (d.doc_type === 'curp' ? { ...d, status: 'digital' as const } : d)), false)).toBe(true)
})

test('playerFilePath builds tenant/player/name', () => {
  expect(playerFilePath('t1', 'p1', 'curp')).toBe('t1/p1/curp')
  expect(playerFilePath('t1', 'p1', 'photo')).toBe('t1/p1/photo')
})

test('documentErrorMessage translates by prefix', () => {
  expect(documentErrorMessage('consent_required: x')).toBe(CONSENT_REQUIRED_MESSAGE)
  expect(documentErrorMessage('consent_in_use: x')).toBe('No se puede regresar a pendiente: primero quita la foto y los documentos digitales.')
  expect(documentErrorMessage('file_path_mismatch: x')).toBe('Ruta de archivo inválida.')
  expect(documentErrorMessage('invalid_file_path: x')).toBe('Ruta de archivo inválida.')
  expect(documentErrorMessage('document_identity_immutable: x')).toBe('Ruta de archivo inválida.')
  expect(documentErrorMessage('new row violates row-level security policy')).toBe('No tienes permiso para esta acción.')
  expect(documentErrorMessage('new row violates row-level security policy', { consentGranted: false })).toBe(CONSENT_REQUIRED_MESSAGE)
  expect(documentErrorMessage('network down')).toBe('network down')
})

test('validateDocumentFile accepts the 4 MIME types up to exactly 10 MB', () => {
  expect(validateDocumentFile(file('application/pdf', 10 * 1024 * 1024))).toBeNull()
  expect(validateDocumentFile(file('image/webp', 1))).toBeNull()
  expect(validateDocumentFile(file('application/pdf', 10 * 1024 * 1024 + 1))).toBe('El archivo supera 10 MB.')
  expect(validateDocumentFile(file('image/heic', 1))).toBe('Formato no permitido: usa PDF, JPG, PNG o WebP.')
  expect(validateDocumentFile(file('', 1))).toBe('Formato no permitido: usa PDF, JPG, PNG o WebP.')
})

test('fetchPlayerDocuments filters by player and returns the fixed order', async () => {
  mocks.selectEq.mockResolvedValueOnce({
    data: [doc({ id: 'b', doc_type: 'medical_clearance' }), doc({ id: 'a', doc_type: 'curp' }), doc({ id: 'c', doc_type: 'image_consent' })],
    error: null,
  })
  const rows = await fetchPlayerDocuments('p1')
  expect(mocks.from).toHaveBeenCalledWith('documents')
  expect(mocks.selectEq).toHaveBeenCalledWith('player_id', 'p1')
  expect(rows.map((r) => r.doc_type)).toEqual(['curp', 'image_consent', 'medical_clearance'])
})

test('fetchPlayerDocuments throws on error', async () => {
  mocks.selectEq.mockResolvedValueOnce({ data: null, error: { message: 'boom' } })
  await expect(fetchPlayerDocuments('p1')).rejects.toThrow('boom')
})

test('removeFile succeeds when the path is in the result', async () => {
  expect(await removeFile('t1/p1/curp')).toEqual({ ok: true })
  expect(mocks.storageFrom).toHaveBeenCalledWith('player-files')
  expect(mocks.list).not.toHaveBeenCalled()
})

test('removeFile with an empty result treats a missing object as gone', async () => {
  mocks.remove.mockResolvedValueOnce({ data: [], error: null })
  mocks.list.mockResolvedValueOnce({ data: [], error: null })
  expect(await removeFile('t1/p1/curp')).toEqual({ ok: true })
  expect(mocks.list).toHaveBeenCalledWith('t1/p1', { search: 'curp' })
})

test('removeFile with an empty result fails when the object still exists', async () => {
  mocks.remove.mockResolvedValueOnce({ data: [], error: null })
  mocks.list.mockResolvedValueOnce({ data: [{ name: 'curp' }], error: null })
  expect(await removeFile('t1/p1/curp')).toEqual({ ok: false, error: 'No se pudo eliminar el archivo.' })
})

test('setDocumentStatus on a non-digital row only updates', async () => {
  expect(await setDocumentStatus(doc(), 'fisico')).toEqual({ ok: true })
  expect(mocks.update).toHaveBeenCalledWith({ status: 'fisico', file_path: null })
  expect(mocks.updateEq).toHaveBeenCalledWith('id', 'd1')
  expect(mocks.remove).not.toHaveBeenCalled()
})

test('setDocumentStatus on a digital non-consent row removes first, then updates', async () => {
  const res = await setDocumentStatus(doc({ status: 'digital', file_path: 't1/p1/curp' }), 'pendiente')
  expect(res).toEqual({ ok: true })
  expect(mocks.calls).toEqual(['remove', 'update'])
})

test('setDocumentStatus does not update when the remove fails', async () => {
  mocks.remove.mockResolvedValueOnce({ data: null, error: { message: 'boom' } })
  const res = await setDocumentStatus(doc({ status: 'digital', file_path: 't1/p1/curp' }), 'fisico')
  expect(res.ok).toBe(false)
  expect(mocks.update).not.toHaveBeenCalled()
})

test('setDocumentStatus on a digital consent row updates first, then removes', async () => {
  const consent = doc({ doc_type: 'image_consent', status: 'digital', file_path: 't1/p1/image_consent' })
  expect(await setDocumentStatus(consent, 'fisico')).toEqual({ ok: true })
  expect(mocks.calls).toEqual(['update', 'remove'])
})

test('a rejected consent revocation keeps the file', async () => {
  mocks.updateEq.mockResolvedValueOnce({ error: { message: 'consent_in_use: x' } })
  const consent = doc({ doc_type: 'privacy_notice', status: 'digital', file_path: 't1/p1/privacy_notice' })
  const res = await setDocumentStatus(consent, 'pendiente')
  expect(res).toEqual({ ok: false, error: 'No se puede regresar a pendiente: primero quita la foto y los documentos digitales.' })
  expect(mocks.remove).not.toHaveBeenCalled()
})

test('uploadDocument validates before calling Supabase', async () => {
  const res = await uploadDocument(doc(), file('image/heic', 1), true)
  expect(res).toEqual({ ok: false, error: 'Formato no permitido: usa PDF, JPG, PNG o WebP.' })
  expect(mocks.upload).not.toHaveBeenCalled()
})

test('uploadDocument upserts to the fixed path, then marks the row digital', async () => {
  const f = file('application/pdf', 100)
  expect(await uploadDocument(doc(), f, true)).toEqual({ ok: true })
  expect(mocks.upload).toHaveBeenCalledWith('t1/p1/curp', f, { upsert: true, contentType: 'application/pdf' })
  expect(mocks.update).toHaveBeenCalledWith({ status: 'digital', file_path: 't1/p1/curp' })
  expect(mocks.calls).toEqual(['upload', 'update'])
})

test('uploadDocument rolls back the object when the update fails on a new upload', async () => {
  mocks.updateEq.mockResolvedValueOnce({ error: { message: 'consent_required: x' } })
  const res = await uploadDocument(doc(), file('application/pdf', 100), true)
  expect(res).toEqual({ ok: false, error: CONSENT_REQUIRED_MESSAGE })
  expect(mocks.remove).toHaveBeenCalledWith(['t1/p1/curp'])
})

test('uploadDocument does not roll back a replacement', async () => {
  mocks.updateEq.mockResolvedValueOnce({ error: { message: 'boom' } })
  const res = await uploadDocument(doc({ status: 'digital', file_path: 't1/p1/curp' }), file('application/pdf', 100), true)
  expect(res.ok).toBe(false)
  expect(mocks.remove).not.toHaveBeenCalled()
})

test('uploadDocument maps a Storage RLS rejection to the consent message when consent is missing', async () => {
  mocks.upload.mockResolvedValueOnce({ data: null, error: { message: 'new row violates row-level security policy' } })
  const res = await uploadDocument(doc(), file('application/pdf', 100), false)
  expect(res).toEqual({ ok: false, error: CONSENT_REQUIRED_MESSAGE })
  expect(mocks.update).not.toHaveBeenCalled()
})

test('getSignedFileUrl signs for 300 seconds', async () => {
  expect(await getSignedFileUrl('t1/p1/curp')).toBe('https://signed/url')
  expect(mocks.createSignedUrl).toHaveBeenCalledWith('t1/p1/curp', 300)
})

test('getSignedFileUrl throws on error', async () => {
  mocks.createSignedUrl.mockResolvedValueOnce({ data: null, error: { message: 'Object not found' } })
  await expect(getSignedFileUrl('t1/p1/curp')).rejects.toThrow('Object not found')
})
