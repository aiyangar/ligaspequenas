import { supabase } from '../lib/supabase'
import { categoryLabel } from '../lib/category'

export type PlayerStatus = 'activo' | 'baja'
export type AffiliationStatus = 'autoriza' | 'no_autoriza' | 'pendiente'

export interface PlayerRow {
  id: string
  tenant_id: string
  full_name: string
  birth_date: string
  curp: string | null
  photo_path: string | null
  status: PlayerStatus
  enrollment_date: string
  tutor_name: string
  tutor_whatsapp: string
  tutor_email: string | null
  emergency_contact_name: string | null
  emergency_contact_phone: string | null
  affiliation_status: AffiliationStatus
  affiliation_date: string | null
  created_at: string
  updated_at: string
  edad_liga: number | null
  division: string | null
  category_name: string | null
  category_year: number | null
  category_id: string | null
  team_id: string | null
  team_name: string | null
}

export async function fetchPlayers(): Promise<PlayerRow[]> {
  const { data } = await supabase
    .from('players_with_category')
    .select('*')
    .order('full_name', { ascending: true })
  return (data as PlayerRow[] | null) ?? []
}

export async function fetchPlayer(id: string): Promise<PlayerRow | null> {
  const { data } = await supabase
    .from('players_with_category')
    .select('*')
    .eq('id', id)
    .maybeSingle()
  return (data as PlayerRow | null) ?? null
}

export function playerCategoryText(
  row: Pick<PlayerRow, 'category_name' | 'category_year' | 'edad_liga'>,
): string {
  if (row.category_name) return categoryLabel(row.category_name, row.category_year)
  if (row.edad_liga != null) return `Fuera de categoría (edad ${row.edad_liga})`
  return 'Fuera de categoría'
}

export interface PlayerFormValues {
  full_name: string
  birth_date: string
  curp: string
  status: PlayerStatus
  enrollment_date: string
  tutor_name: string
  tutor_whatsapp: string
  tutor_email: string
  emergency_contact_name: string
  emergency_contact_phone: string
  affiliation_status: AffiliationStatus
  affiliation_date: string
}

export interface CreatePlayerResult {
  ok: boolean
  id?: string
  error?: string
}

export interface UpdatePlayerResult {
  ok: boolean
  error?: string
}

export function emptyPlayer(): PlayerFormValues {
  const today = new Date().toISOString().slice(0, 10)
  return {
    full_name: '',
    birth_date: '',
    curp: '',
    status: 'activo',
    enrollment_date: today,
    tutor_name: '',
    tutor_whatsapp: '',
    tutor_email: '',
    emergency_contact_name: '',
    emergency_contact_phone: '',
    affiliation_status: 'pendiente',
    affiliation_date: '',
  }
}

export function rowToValues(row: PlayerRow): PlayerFormValues {
  return {
    full_name: row.full_name,
    birth_date: row.birth_date,
    curp: row.curp ?? '',
    status: row.status,
    enrollment_date: row.enrollment_date,
    tutor_name: row.tutor_name,
    tutor_whatsapp: row.tutor_whatsapp,
    tutor_email: row.tutor_email ?? '',
    emergency_contact_name: row.emergency_contact_name ?? '',
    emergency_contact_phone: row.emergency_contact_phone ?? '',
    affiliation_status: row.affiliation_status,
    affiliation_date: row.affiliation_date ?? '',
  }
}

function toRecord(v: PlayerFormValues) {
  return {
    full_name: v.full_name.trim(),
    birth_date: v.birth_date,
    curp: v.curp.trim() || null,
    status: v.status,
    enrollment_date: v.enrollment_date,
    tutor_name: v.tutor_name.trim(),
    tutor_whatsapp: v.tutor_whatsapp.trim(),
    tutor_email: v.tutor_email.trim() || null,
    emergency_contact_name: v.emergency_contact_name.trim() || null,
    emergency_contact_phone: v.emergency_contact_phone.trim() || null,
    affiliation_status: v.affiliation_status,
    affiliation_date: v.affiliation_date || null,
  }
}

export async function createPlayer(
  values: PlayerFormValues,
  tenantId: string,
): Promise<CreatePlayerResult> {
  const { data, error } = await supabase
    .from('players')
    .insert({ ...toRecord(values), tenant_id: tenantId })
    .select('id')
    .single()
  if (error) return { ok: false, error: error.message }
  return { ok: true, id: (data as { id: string }).id }
}

export async function updatePlayer(
  id: string,
  values: PlayerFormValues,
): Promise<UpdatePlayerResult> {
  const { error } = await supabase.from('players').update(toRecord(values)).eq('id', id)
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}
