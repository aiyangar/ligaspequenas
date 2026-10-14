import { supabase } from '../lib/supabase'

export type DocumentType =
  | 'curp'
  | 'birth_certificate'
  | 'proof_of_address'
  | 'image_consent'
  | 'privacy_notice'
  | 'medical_clearance'
export type DocumentStatus = 'pendiente' | 'fisico' | 'digital'

export interface DocumentRow {
  id: string
  tenant_id: string
  player_id: string
  doc_type: DocumentType
  status: DocumentStatus
  file_path: string | null
  updated_at: string
}

export interface FileResult {
  ok: boolean
  error?: string
}

export const PLAYER_FILES_BUCKET = 'player-files'
export const SIGNED_URL_TTL_SECONDS = 300
const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024
const DOCUMENT_MIME_TYPES = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp']

export const DOCUMENT_TYPES: readonly DocumentType[] = [
  'curp',
  'birth_certificate',
  'proof_of_address',
  'image_consent',
  'privacy_notice',
  'medical_clearance',
]

export const DOCUMENT_LABELS: Record<DocumentType, string> = {
  curp: 'CURP',
  birth_certificate: 'Acta de nacimiento',
  proof_of_address: 'Comprobante de domicilio',
  image_consent: 'Consentimiento de imagen',
  privacy_notice: 'Aviso de privacidad',
  medical_clearance: 'Constancia médica',
}

export const STATUS_LABELS: Record<DocumentStatus, string> = {
  pendiente: 'Pendiente',
  fisico: 'Físico',
  digital: 'Digital',
}

export const CONSENT_REQUIRED_MESSAGE =
  'Primero registra el consentimiento de imagen y el aviso de privacidad.'

const CONSENT_TYPES: readonly DocumentType[] = ['image_consent', 'privacy_notice']

export function isConsentType(t: DocumentType): boolean {
  return CONSENT_TYPES.includes(t)
}

export function consentGranted(docs: Pick<DocumentRow, 'doc_type' | 'status'>[]): boolean {
  return CONSENT_TYPES.every((t) => docs.some((d) => d.doc_type === t && d.status !== 'pendiente'))
}

export function filesInUse(docs: Pick<DocumentRow, 'doc_type' | 'status'>[], hasPhoto: boolean): boolean {
  return hasPhoto || docs.some((d) => !isConsentType(d.doc_type) && d.status === 'digital')
}

export function playerFilePath(tenantId: string, playerId: string, name: DocumentType | 'photo'): string {
  return `${tenantId}/${playerId}/${name}`
}

export function documentErrorMessage(message: string, opts: { consentGranted?: boolean } = {}): string {
  if (message.startsWith('consent_required')) return CONSENT_REQUIRED_MESSAGE
  if (message.startsWith('consent_in_use')) {
    return 'No se puede regresar a pendiente: primero quita la foto y los documentos digitales.'
  }
  if (/^(invalid_file_path|file_path_mismatch|document_identity_immutable)/.test(message)) {
    return 'Ruta de archivo inválida.'
  }
  if (/row-level security|unauthorized|403/i.test(message)) {
    return opts.consentGranted === false ? CONSENT_REQUIRED_MESSAGE : 'No tienes permiso para esta acción.'
  }
  return message
}

export function validateDocumentFile(file: File): string | null {
  if (!DOCUMENT_MIME_TYPES.includes(file.type)) return 'Formato no permitido: usa PDF, JPG, PNG o WebP.'
  if (file.size > MAX_DOCUMENT_BYTES) return 'El archivo supera 10 MB.'
  return null
}

export async function fetchPlayerDocuments(playerId: string): Promise<DocumentRow[]> {
  const { data, error } = await supabase
    .from('documents')
    .select('id, tenant_id, player_id, doc_type, status, file_path, updated_at')
    .eq('player_id', playerId)
  if (error) throw new Error(error.message)
  const rows = (data as DocumentRow[] | null) ?? []
  return [...rows].sort((a, b) => DOCUMENT_TYPES.indexOf(a.doc_type) - DOCUMENT_TYPES.indexOf(b.doc_type))
}

function bucket() {
  return supabase.storage.from(PLAYER_FILES_BUCKET)
}

export async function removeFile(path: string): Promise<FileResult> {
  const { data, error } = await bucket().remove([path])
  if (error) return { ok: false, error: documentErrorMessage(error.message) }
  if (data?.some((o) => o.name === path)) return { ok: true }
  // remove() reports success with an empty list when nothing was deleted
  const slash = path.lastIndexOf('/')
  const name = path.slice(slash + 1)
  const listed = await bucket().list(path.slice(0, slash), { search: name })
  if (listed.error) return { ok: false, error: documentErrorMessage(listed.error.message) }
  if (listed.data?.some((o) => o.name === name)) return { ok: false, error: 'No se pudo eliminar el archivo.' }
  return { ok: true }
}

async function updateDocument(id: string, values: { status: DocumentStatus; file_path: string | null }) {
  return supabase.from('documents').update(values).eq('id', id)
}

export async function setDocumentStatus(
  doc: DocumentRow,
  status: 'pendiente' | 'fisico',
): Promise<FileResult> {
  const values = { status, file_path: null }
  if (doc.status !== 'digital' || !doc.file_path) {
    const { error } = await updateDocument(doc.id, values)
    return error ? { ok: false, error: documentErrorMessage(error.message) } : { ok: true }
  }
  if (isConsentType(doc.doc_type)) {
    // the server may reject a revocation, so the signed consent is only deleted after it accepts
    const { error } = await updateDocument(doc.id, values)
    if (error) return { ok: false, error: documentErrorMessage(error.message) }
    return removeFile(doc.file_path)
  }
  const removed = await removeFile(doc.file_path)
  if (!removed.ok) return removed
  const { error } = await updateDocument(doc.id, values)
  return error ? { ok: false, error: documentErrorMessage(error.message) } : { ok: true }
}

export async function uploadDocument(
  doc: DocumentRow,
  file: File,
  consentGranted: boolean,
): Promise<FileResult> {
  const invalid = validateDocumentFile(file)
  if (invalid) return { ok: false, error: invalid }
  const path = playerFilePath(doc.tenant_id, doc.player_id, doc.doc_type)
  const uploaded = await bucket().upload(path, file, { upsert: true, contentType: file.type })
  if (uploaded.error) return { ok: false, error: documentErrorMessage(uploaded.error.message, { consentGranted }) }
  const { error } = await updateDocument(doc.id, { status: 'digital', file_path: path })
  if (error) {
    if (doc.status !== 'digital') await removeFile(path)
    return { ok: false, error: documentErrorMessage(error.message, { consentGranted }) }
  }
  return { ok: true }
}

export async function getSignedFileUrl(path: string): Promise<string> {
  const { data, error } = await bucket().createSignedUrl(path, SIGNED_URL_TTL_SECONDS)
  if (error || !data) throw new Error(error?.message ?? 'No se pudo firmar la URL')
  return data.signedUrl
}
