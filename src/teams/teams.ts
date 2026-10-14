import { supabase } from '../lib/supabase'
import type { PlayerRow } from '../players/players'

export interface TeamRow {
  id: string
  tenant_id: string
  season_id: string
  category_id: string
  name: string
  coach: string | null
  color: string | null
  created_at: string
  updated_at: string
  category_name: string
  division: string
  category_sort_order: number
  season_is_active: boolean
  player_count: number
}

export interface SeasonRow {
  id: string
  tenant_id: string
  name: string
  cutoff_date: string
  is_active: boolean
}

export interface CategoryRow {
  id: string
  name: string
  division: string
  sort_order: number
}

export interface TeamFormValues {
  name: string
  category_id: string
  coach: string
  color: string
}

export interface EligibleGroup {
  teamId: string | null
  teamName: string | null
  players: PlayerRow[]
}

export interface CreateTeamResult {
  ok: boolean
  id?: string
  error?: string
}

export interface MutationResult {
  ok: boolean
  error?: string
}

export async function fetchActiveSeason(): Promise<SeasonRow | null> {
  const { data, error } = await supabase.from('seasons').select('*').eq('is_active', true).maybeSingle()
  if (error) throw new Error(error.message)
  return (data as SeasonRow | null) ?? null
}

export async function fetchCategories(): Promise<CategoryRow[]> {
  const { data, error } = await supabase.from('categories').select('*').order('sort_order', { ascending: true })
  if (error) throw new Error(error.message)
  return (data as CategoryRow[] | null) ?? []
}

export async function fetchTeams(): Promise<TeamRow[]> {
  const { data, error } = await supabase
    .from('teams_with_meta')
    .select('*')
    .eq('season_is_active', true)
    .order('category_sort_order', { ascending: true })
  if (error) throw new Error(error.message)
  const rows = (data as TeamRow[] | null) ?? []
  return rows.sort((a, b) =>
    a.category_sort_order - b.category_sort_order || a.name.localeCompare(b.name),
  )
}

export async function fetchTeam(id: string): Promise<TeamRow | null> {
  const { data, error } = await supabase.from('teams_with_meta').select('*').eq('id', id).maybeSingle()
  if (error) throw new Error(error.message)
  return (data as TeamRow | null) ?? null
}

export async function fetchRoster(teamId: string): Promise<PlayerRow[]> {
  const { data, error } = await supabase
    .from('players_with_category')
    .select('*')
    .eq('team_id', teamId)
    .order('full_name', { ascending: true })
  if (error) throw new Error(error.message)
  return (data as PlayerRow[] | null) ?? []
}

export async function fetchEligiblePlayers(categoryId: string, teamId: string): Promise<PlayerRow[]> {
  const { data, error } = await supabase
    .from('players_with_category')
    .select('*')
    .eq('category_id', categoryId)
    .eq('status', 'activo')
    .or(`team_id.is.null,team_id.neq.${teamId}`)
    .order('full_name', { ascending: true })
  if (error) throw new Error(error.message)
  return (data as PlayerRow[] | null) ?? []
}

export function groupEligibleByCurrentTeam(players: PlayerRow[]): EligibleGroup[] {
  const free: PlayerRow[] = []
  const byTeam = new Map<string, EligibleGroup>()
  for (const p of players) {
    if (!p.team_id) {
      free.push(p)
    } else {
      const g = byTeam.get(p.team_id) ?? { teamId: p.team_id, teamName: p.team_name, players: [] }
      g.players.push(p)
      byTeam.set(p.team_id, g)
    }
  }
  const others = Array.from(byTeam.values()).sort((a, b) =>
    (a.teamName ?? '').localeCompare(b.teamName ?? ''),
  )
  const groups: EligibleGroup[] = []
  if (free.length) groups.push({ teamId: null, teamName: null, players: free })
  return groups.concat(others)
}

export async function createTeam(
  values: TeamFormValues,
  tenantId: string,
  seasonId: string,
): Promise<CreateTeamResult> {
  const { data, error } = await supabase
    .from('teams')
    .insert({
      name: values.name.trim(),
      category_id: values.category_id,
      coach: values.coach.trim() || null,
      color: values.color.trim() || null,
      tenant_id: tenantId,
      season_id: seasonId,
    })
    .select('id')
    .single()
  if (error) return { ok: false, error: error.message }
  return { ok: true, id: (data as { id: string }).id }
}

export async function updateTeam(id: string, values: TeamFormValues): Promise<MutationResult> {
  const { error } = await supabase
    .from('teams')
    .update({
      name: values.name.trim(),
      category_id: values.category_id,
      coach: values.coach.trim() || null,
      color: values.color.trim() || null,
    })
    .eq('id', id)
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

export async function deleteTeam(id: string): Promise<MutationResult> {
  const { error } = await supabase.from('teams').delete().eq('id', id)
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

export async function assignPlayer(
  teamId: string,
  playerId: string,
  tenantId: string,
  seasonId: string,
): Promise<MutationResult> {
  const { error } = await supabase
    .from('team_players')
    .insert({ team_id: teamId, player_id: playerId, tenant_id: tenantId, season_id: seasonId })
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

export async function movePlayer(
  playerId: string,
  seasonId: string,
  newTeamId: string,
): Promise<MutationResult> {
  const { error } = await supabase
    .from('team_players')
    .update({ team_id: newTeamId })
    .eq('player_id', playerId)
    .eq('season_id', seasonId)
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

export async function removeFromRoster(playerId: string, seasonId: string): Promise<MutationResult> {
  const { error } = await supabase
    .from('team_players')
    .delete()
    .eq('player_id', playerId)
    .eq('season_id', seasonId)
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}
