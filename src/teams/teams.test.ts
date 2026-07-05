import { beforeEach, expect, vi } from 'vitest'
import {
  fetchTeams, fetchTeam, fetchActiveSeason, fetchCategories, fetchRoster,
  fetchEligiblePlayers, groupEligibleByCurrentTeam,
  createTeam, updateTeam, deleteTeam, assignPlayer, movePlayer, removeFromRoster,
} from './teams'
import type { PlayerRow } from '../players/players'

const mocks = vi.hoisted(() => ({
  from: vi.fn(), select: vi.fn(), order: vi.fn(), eq: vi.fn(), eq2: vi.fn(),
  or: vi.fn(), maybeSingle: vi.fn(), insert: vi.fn(), single: vi.fn(),
  update: vi.fn(), updateEq: vi.fn(), updateEq2: vi.fn(), del: vi.fn(), delEq: vi.fn(), delEq2: vi.fn(),
}))
vi.mock('../lib/supabase', () => ({ supabase: { from: mocks.from } }))

function eligible(over: Partial<PlayerRow>): PlayerRow {
  return {
    id: 'p1', tenant_id: 't1', full_name: 'Ana', birth_date: '2015-06-10', curp: null,
    photo_path: null, status: 'activo', enrollment_date: '2026-07-01', tutor_name: 'T',
    tutor_whatsapp: '0', tutor_email: null, emergency_contact_name: null,
    emergency_contact_phone: null, affiliation_status: 'pendiente', affiliation_date: null,
    created_at: '', updated_at: '', edad_liga: 11, division: 'Infantil',
    category_name: 'Infantil Mayor', category_year: 1, category_id: 'cat1',
    team_id: null, team_name: null, ...over,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.order.mockResolvedValue({ data: [], error: null })
  mocks.maybeSingle.mockResolvedValue({ data: null, error: null })
  mocks.single.mockResolvedValue({ data: { id: 'newteam' }, error: null })
  mocks.or.mockReturnValue({ order: mocks.order })
  mocks.eq2.mockReturnValue({ maybeSingle: mocks.maybeSingle, order: mocks.order, or: mocks.or })
  mocks.eq.mockReturnValue({ eq: mocks.eq2, maybeSingle: mocks.maybeSingle, order: mocks.order, or: mocks.or })
  mocks.insert.mockReturnValue({ select: mocks.select })
  mocks.select.mockReturnValue({ order: mocks.order, eq: mocks.eq, single: mocks.single })
  mocks.updateEq2.mockResolvedValue({ error: null })
  mocks.updateEq.mockReturnValue({ eq: mocks.updateEq2 })
  mocks.update.mockReturnValue({ eq: mocks.updateEq })
  mocks.delEq2.mockResolvedValue({ error: null })
  mocks.delEq.mockReturnValue({ eq: mocks.delEq2 })
  mocks.del.mockReturnValue({ eq: mocks.delEq })
  mocks.from.mockReturnValue({
    select: mocks.select, insert: mocks.insert, update: mocks.update, delete: mocks.del,
  })
})

test('fetchTeams reads active-season teams from teams_with_meta', async () => {
  await fetchTeams()
  expect(mocks.from).toHaveBeenCalledWith('teams_with_meta')
  expect(mocks.eq).toHaveBeenCalledWith('season_is_active', true)
})

test('fetchActiveSeason reads the active season', async () => {
  await fetchActiveSeason()
  expect(mocks.from).toHaveBeenCalledWith('seasons')
  expect(mocks.eq).toHaveBeenCalledWith('is_active', true)
})

test('fetchRoster reads players_with_category filtered by team_id', async () => {
  await fetchRoster('team9')
  expect(mocks.from).toHaveBeenCalledWith('players_with_category')
  expect(mocks.eq).toHaveBeenCalledWith('team_id', 'team9')
})

test('fetchEligiblePlayers filters by category, activo, and excludes this team', async () => {
  await fetchEligiblePlayers('cat1', 'team9')
  expect(mocks.from).toHaveBeenCalledWith('players_with_category')
  expect(mocks.eq).toHaveBeenCalledWith('category_id', 'cat1')
  expect(mocks.eq2).toHaveBeenCalledWith('status', 'activo')
  expect(mocks.or).toHaveBeenCalledWith('team_id.is.null,team_id.neq.team9')
})

test('createTeam inserts with tenant and season and coerces blanks to null', async () => {
  const res = await createTeam({ name: 'Rojo', category_id: 'cat1', coach: '', color: 'Rojo' }, 't1', 's1')
  expect(mocks.from).toHaveBeenCalledWith('teams')
  expect(mocks.insert).toHaveBeenCalledWith(
    expect.objectContaining({ name: 'Rojo', category_id: 'cat1', coach: null, color: 'Rojo', tenant_id: 't1', season_id: 's1' }),
  )
  expect(res).toEqual({ ok: true, id: 'newteam' })
})

test('assignPlayer inserts a roster row', async () => {
  mocks.insert.mockResolvedValue({ error: null })
  const res = await assignPlayer('team9', 'p1', 't1', 's1')
  expect(mocks.from).toHaveBeenCalledWith('team_players')
  expect(mocks.insert).toHaveBeenCalledWith({ team_id: 'team9', player_id: 'p1', tenant_id: 't1', season_id: 's1' })
  expect(res).toEqual({ ok: true })
})

test('assignPlayer surfaces the unique-violation error', async () => {
  mocks.insert.mockResolvedValue({ error: { message: 'duplicate key value' } })
  const res = await assignPlayer('team9', 'p1', 't1', 's1')
  expect(res).toEqual({ ok: false, error: 'duplicate key value' })
})

test('movePlayer updates team_id keyed by player and season', async () => {
  const res = await movePlayer('p1', 's1', 'team2')
  expect(mocks.from).toHaveBeenCalledWith('team_players')
  expect(mocks.update).toHaveBeenCalledWith({ team_id: 'team2' })
  expect(mocks.updateEq).toHaveBeenCalledWith('player_id', 'p1')
  expect(mocks.updateEq2).toHaveBeenCalledWith('season_id', 's1')
  expect(res).toEqual({ ok: true })
})

test('removeFromRoster deletes keyed by player and season', async () => {
  const res = await removeFromRoster('p1', 's1')
  expect(mocks.from).toHaveBeenCalledWith('team_players')
  expect(mocks.delEq).toHaveBeenCalledWith('player_id', 'p1')
  expect(mocks.delEq2).toHaveBeenCalledWith('season_id', 's1')
  expect(res).toEqual({ ok: true })
})

test('groupEligibleByCurrentTeam puts free agents first, then groups by current team', () => {
  const groups = groupEligibleByCurrentTeam([
    eligible({ id: 'free', team_id: null, team_name: null }),
    eligible({ id: 'inB', team_id: 'B', team_name: 'MTY AC Azul' }),
    eligible({ id: 'inB2', team_id: 'B', team_name: 'MTY AC Azul' }),
  ])
  expect(groups[0]).toMatchObject({ teamId: null, teamName: null })
  expect(groups[0].players.map((p) => p.id)).toEqual(['free'])
  expect(groups[1]).toMatchObject({ teamId: 'B', teamName: 'MTY AC Azul' })
  expect(groups[1].players.map((p) => p.id)).toEqual(['inB', 'inB2'])
})

test('fetchTeam reads a single team from teams_with_meta by id', async () => {
  const res = await fetchTeam('team9')
  expect(mocks.from).toHaveBeenCalledWith('teams_with_meta')
  expect(mocks.eq).toHaveBeenCalledWith('id', 'team9')
  expect(res).toBeNull()
})

test('fetchCategories reads categories ordered by sort_order', async () => {
  const res = await fetchCategories()
  expect(mocks.from).toHaveBeenCalledWith('categories')
  expect(mocks.order).toHaveBeenCalledWith('sort_order', { ascending: true })
  expect(res).toEqual([])
})

test('updateTeam updates the team and coerces blank coach and color to null', async () => {
  mocks.updateEq.mockResolvedValueOnce({ error: null })
  const res = await updateTeam('team9', { name: 'Azul', category_id: 'cat1', coach: '', color: '' })
  expect(mocks.from).toHaveBeenCalledWith('teams')
  expect(mocks.update).toHaveBeenCalledWith(
    expect.objectContaining({ name: 'Azul', category_id: 'cat1', coach: null, color: null }),
  )
  expect(mocks.updateEq).toHaveBeenCalledWith('id', 'team9')
  expect(res).toEqual({ ok: true })
})

test('updateTeam surfaces the error message on failure', async () => {
  mocks.updateEq.mockResolvedValueOnce({ error: { message: 'update failed' } })
  const res = await updateTeam('team9', { name: 'Azul', category_id: 'cat1', coach: '', color: '' })
  expect(res).toEqual({ ok: false, error: 'update failed' })
})

test('deleteTeam deletes the team by id', async () => {
  mocks.delEq.mockResolvedValueOnce({ error: null })
  const res = await deleteTeam('team9')
  expect(mocks.from).toHaveBeenCalledWith('teams')
  expect(mocks.delEq).toHaveBeenCalledWith('id', 'team9')
  expect(res).toEqual({ ok: true })
})

test('deleteTeam surfaces the error message on failure', async () => {
  mocks.delEq.mockResolvedValueOnce({ error: { message: 'delete failed' } })
  const res = await deleteTeam('team9')
  expect(res).toEqual({ ok: false, error: 'delete failed' })
})
