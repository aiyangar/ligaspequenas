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
