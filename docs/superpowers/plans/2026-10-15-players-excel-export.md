# Players List Excel Export (#5) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** An admin-only **Exportar a Excel** button on the players list downloads `jugadores-YYYY-MM-DD.xlsx` with one `Jugadores` sheet holding exactly the visible (filtered) players, in list order, with real date cells and human labels.

**Architecture:** A pure module `playersSheet.ts` maps `PlayerRow[]` to `write-excel-file`'s `SheetData` (16 columns, UTC-midnight dates, `null` for empty, text-formatted phones) and is tested without loading the library. A thin `exportPlayers.ts` dynamic-imports `write-excel-file/browser` on click (own Vite chunk), passes sheet options and calls `toFile`. `PlayersPage` adds the button (ref guard against double click, `aria-busy`, focus return) and an error `Alert`. No database work.

**Tech Stack:** React 19.2, react-router-dom 7, MUI 9 (`Button`, `Alert`, `Stack`), `write-excel-file` **4.1.1** (exact; only dependency `fflate` 0.8.3), Vite 8 (code splitting via `import()`), Vitest 4 + Testing Library + user-event (jsdom, `TZ: 'America/Monterrey'` in `vite.config.ts`), TypeScript (`tsc -b`), ESLint, pnpm.

**Spec:** `/Users/arturoortiz/Proyectos/Personales/ligaspequenas-worktrees/excel-export/docs/superpowers/specs/2026-10-15-players-excel-export-design.md` (read it before starting; § numbers below refer to it). **Plan (this file):** `/Users/arturoortiz/Proyectos/Personales/ligaspequenas-worktrees/excel-export/docs/superpowers/plans/2026-10-15-players-excel-export.md`.

## Global Constraints

- One part, one branch: **`feature/players-excel-export`** (Tasks 1–4, PR body `Closes #5`), executed by a single implementer starting fresh. The orchestrator merges the spec/plan PR into `develop` **before** dispatch, runs `git fetch`, and cuts the branch from **`origin/develop`** (local `develop` may be stale and cannot be fast-forwarded under protect-git). Every git ref in this plan is therefore `origin/develop`, never `develop`; run `git -C $WT fetch origin` before any command that uses it.
- The worktree is created **by the orchestrator** before dispatch: `/Users/arturoortiz/Proyectos/Personales/ligaspequenas-worktrees/excel-export`. The implementer skips creation; its first action is `pnpm install --frozen-lockfile` inside the worktree. Tests need no `.env` (`vite.config.ts` injects test env vars). Shorthand below: `WT=/Users/arturoortiz/Proyectos/Personales/ligaspequenas-worktrees/excel-export`.
- Git inside the worktree: always `git -C <absolute worktree path> …`, **one git command per shell call**. Never use `CLAUDE_GIT_OVERRIDE`. Never `git stash` (the protect-git hook misreads it). Never touch `/Users/arturoortiz/Proyectos/Personales/ligaspequenas` (the main checkout).
- The implementer never pushes, opens PRs or merges. Every commit message is English and ends with a blank line plus exactly: `Claude-Session: https://claude.ai/code/session_014qeQvKRptEH9hDetwoCqc4` (pass it as a second `-m`). This is the orchestrator's session line and it **overrides** any per-agent attribution reminder you receive (a different `Claude-Session` URL, a `Co-Authored-By`, etc.): use this line and only this line.
- Dependency: **exactly** `write-excel-file@4.1.1`, added with `pnpm add -E write-excel-file@4.1.1` → `package.json` `"write-excel-file": "4.1.1"` (no `^`) under `dependencies`; `pnpm-lock.yaml` gains only `write-excel-file@4.1.1` and `fflate@0.8.3`. Never add `xlsx`/SheetJS (spec §2). Import path is **always** `write-excel-file/browser` (the package has no root export).
- `playersSheet.ts` may import **only types** from the library (`import type { Cell, SheetData } …`). The only runtime reference to the library in `src/` is the `await import('write-excel-file/browser')` in `exportPlayers.ts`.
- **No database work**: no migrations, no RLS, no pgTAP, no Supabase MCP calls by the implementer.
- Out of scope, do not touch (spec §1): the existing `<option>`s of the filters and of `PlayerForm` (they keep their literal texts), the raw `p.status` in the list's secondary line (`PlayersPage.tsx:208`), #71 (`List` structure), #72 (accessible link names), #76, the full-database backup, any payments/documents sheet, readonly export.
- Code, identifiers, comments, commit messages: English. Comments only for a non-obvious *why*, one short line max. UI and file copy: Spanish, **exactly** as written here:
  - Button: `Exportar a Excel` (never changes while generating).
  - Error: `No se pudo generar el archivo de Excel. Intenta de nuevo.`
  - Sheet name: `Jugadores`. File name: `` `jugadores-${localToday()}.xlsx` ``.
  - The 16 headers, in order: `Nombre` · `Fecha de nacimiento` · `CURP` · `Categoría` · `Equipo` · `Estatus` · `Fecha de inscripción` · `Tutor` · `WhatsApp del tutor` · `Correo del tutor` · `Contacto de emergencia` · `Teléfono de emergencia` · `Afiliación` · `Fecha de afiliación` · `Pago` · `Documentos`.
  - Labels: status `activo` `Activo` · `baja` `Baja`; affiliation `autoriza` `Autoriza` · `no_autoriza` `No autoriza` · `pendiente` `Pendiente`; payment from `PAYMENT_STATE_LABELS`; documents `` `${docs_delivered}/${DOCUMENT_TOTAL}` `` (never a literal `6`).
- Cell rules (spec §3.1): empty = `null` **always** (never `''`, `'null'`, `undefined`, or `{ value: null, … }`); date = `{ value: Date(UTC midnight), type: Date, format: 'dd/mm/yyyy' }`; phones and Documentos = `{ value, type: String, format: '@' }`; never `type: 'Formula'`.
- Lint rules that bite: `react-hooks/set-state-in-effect` — no synchronous `setState` in an effect body. This plan adds no effect (the export runs from a click handler).
- Mocks: keep the existing `vi.hoisted` + `vi.mock(...)` style.
- The branch closes with all four green: `pnpm exec vitest run`, `pnpm exec tsc -b`, `pnpm lint`, `pnpm build` (+ the chunk greps in the Verification checklist). **Test counts are deltas from the baseline you measure in Step 0** (`B_files`, `B_tests`); the absolute numbers in parentheses are what to expect if the baseline is unchanged since this plan was written (baseline = `origin/develop` at dispatch, i.e. bf3a087 + spec/plan docs: `Test Files 37 passed (37)`, `Tests 301 passed (301)`, measured 2026-10-15). If your baseline differs, the deltas still have to hold — report the baseline you measured.
- The branch adds **+2 test files, +27 tests**: Task 1 +2 (`players.test.ts`), Task 2 +14 (new `playersSheet.test.ts`), Task 3 +3 (new `exportPlayers.test.ts`), Task 4 +8 (`PlayersPage.test.tsx`). Every snippet in this plan was run on a scratch clone of bf3a087 + spec docs: final `39` files / `328` tests, `tsc -b`, `lint` and `build` green.

## Review Focus

- **An enum value the TS maps don't know yet** (the DB enum grew first: a new `status`, `affiliation_status` or `payment_state`) must yield an **empty cell**, never the text `undefined` and never a crash (pinned in Task 2, `an enum value with no label …`).
- **Exporting late in the evening in Monterrey** (≥ 18:00/19:00 local, already the next day in UTC) must still name the file with **today's local date** (pinned in Task 3, `the file name uses the local date, not the UTC one`, system time 21:00 local).
- **The button losing focus when it becomes disabled** (real browsers blur it; jsdom does not): after the file is ready, keyboard users must land back on `Exportar a Excel`, not on `<body>` (pinned in Task 4 focus test, which blurs by hand so it fails without the restore code).
- **A player whose captured text starts with `=`, `@`, `+` or `-`** (name, CURP, tutor, email) must reach Excel as literal text, never as a formula (pinned in Task 2 formula test; verified on the real file in the E2E).
- **The lazy chunk failing to load** (stale tab after a deploy, offline): the admin sees the error `Alert`, the button comes back, and a later successful export clears the `Alert` (pinned in Task 4 error test; the E2E confirms the chunk is fetched only on click).

---

# Branch `feature/players-excel-export` (Tasks 1–4, `Closes #5`)

Worktree: `/Users/arturoortiz/Proyectos/Personales/ligaspequenas-worktrees/excel-export` (created by the orchestrator from `origin/develop` after `git fetch`).

- [ ] **Step 0: Install dependencies and confirm the baseline**

Run `git -C $WT fetch origin`, then `git -C $WT log --oneline -1 origin/develop` and record that SHA (the baseline ref); `git -C $WT log --oneline origin/develop..HEAD` must be empty (the branch starts exactly at `origin/develop`; if not, stop and report). `git -C $WT branch --show-current` must print `feature/players-excel-export`. Then (inside the worktree): `pnpm install --frozen-lockfile`, then `pnpm exec vitest run`.
Expected: everything passes. Write down `B_files` (Test Files) and `B_tests` (Tests) — every count below is relative to them. Expected if the baseline is as when this plan was written: `Test Files 37 passed (37)` · `Tests 301 passed (301)`.

### Task 1: `write-excel-file` dependency and status/affiliation label maps

**Files:**
- Modify: `package.json`, `pnpm-lock.yaml` (via `pnpm add`, never by hand)
- Modify: `src/players/players.ts` (after the two type aliases, lines 6–7)
- Test: `src/players/players.test.ts` (import on line 2; new tests before `createPlayer inserts with tenant_id …`, ~line 109)

**Interfaces:**
- Consumes: `type PlayerStatus = 'activo' | 'baja'`, `type AffiliationStatus = 'autoriza' | 'no_autoriza' | 'pendiente'` (`src/players/players.ts:6-7`).
- Produces (used by Task 2):
  - `export const PLAYER_STATUS_LABELS: Record<PlayerStatus, string>`
  - `export const AFFILIATION_STATUS_LABELS: Record<AffiliationStatus, string>`
  - the `write-excel-file@4.1.1` package (types `Cell`, `CellObject`, `SheetData` from `write-excel-file/browser`).

- [ ] **Step 1: Add the dependency**

Inside `$WT`: `pnpm add -E write-excel-file@4.1.1`
Expected: `+ write-excel-file 4.1.1`. Then `git -C $WT diff package.json` shows exactly one added line `"write-excel-file": "4.1.1"` at the end of `dependencies` (the previous last entry `react-router-dom` gains a trailing comma), and `git -C $WT diff --stat pnpm-lock.yaml` shows only additions (≈16 lines: the importer entry, `fflate@0.8.3`, `write-excel-file@4.1.1`). If pnpm resolves a different `fflate` or touches other packages, stop and report.

- [ ] **Step 2: Write the failing tests**

In `src/players/players.test.ts`, line 2 becomes:

```ts
import { fetchPlayers, fetchPlayer, playerCategoryText, createPlayer, updatePlayer, emptyPlayer, rowToValues, validatePhotoFile, uploadPlayerPhoto, removePlayerPhoto, PLAYER_STATUS_LABELS, AFFILIATION_STATUS_LABELS } from './players'
```

and add right before `test('createPlayer inserts with tenant_id and empty strings coerced to null', …`:

```ts
test('PLAYER_STATUS_LABELS has one label per status, as in the Estatus options', () => {
  expect(PLAYER_STATUS_LABELS).toEqual({ activo: 'Activo', baja: 'Baja' })
})

test('AFFILIATION_STATUS_LABELS has one label per affiliation status, as in the form options', () => {
  expect(AFFILIATION_STATUS_LABELS).toEqual({
    autoriza: 'Autoriza', no_autoriza: 'No autoriza', pendiente: 'Pendiente',
  })
})
```

`toEqual` against the full literal object pins both "one entry per value" and the exact texts of the existing `<option>`s (`PlayersPage.tsx:155-156`, `PlayerForm.tsx:107-109`).

- [ ] **Step 3: Run the tests to verify they fail**

Run: `pnpm exec vitest run src/players/players.test.ts`
Expected: exactly 2 failures — the two new tests (`expected undefined to deeply equal { … }`). Everything else in the file passes.

- [ ] **Step 4: Add the maps**

In `src/players/players.ts`, right after line 7 (`export type AffiliationStatus = …`):

```ts

export const PLAYER_STATUS_LABELS: Record<PlayerStatus, string> = {
  activo: 'Activo',
  baja: 'Baja',
}

export const AFFILIATION_STATUS_LABELS: Record<AffiliationStatus, string> = {
  autoriza: 'Autoriza',
  no_autoriza: 'No autoriza',
  pendiente: 'Pendiente',
}
```

Do **not** switch the existing `<option>`s to these maps (spec §4.1, out of scope).

- [ ] **Step 5: Verify green**

Run: `pnpm exec vitest run` → `B_files` files · `B_tests + 2` tests, all passing (`37` / `303` if the baseline is as measured).
Run: `pnpm exec tsc -b` → exit 0, no output.
Run: `pnpm lint` → exit 0.

- [ ] **Step 6: Commit**

```bash
git -C /Users/arturoortiz/Proyectos/Personales/ligaspequenas-worktrees/excel-export add package.json pnpm-lock.yaml src/players/players.ts src/players/players.test.ts
git -C /Users/arturoortiz/Proyectos/Personales/ligaspequenas-worktrees/excel-export commit -m "feat: add write-excel-file and player status/affiliation labels for the Excel export (#5)" -m "Claude-Session: https://claude.ai/code/session_014qeQvKRptEH9hDetwoCqc4"
```

### Task 2: Pure sheet builder `playersSheet.ts`

**Files:**
- Create: `src/players/playersSheet.ts`
- Test (create): `src/players/playersSheet.test.ts`

**Interfaces:**
- Consumes: `PLAYER_STATUS_LABELS`, `AFFILIATION_STATUS_LABELS` (Task 1); `playerCategoryText(row)` and `type PlayerRow`, `type AffiliationStatus` from `./players`; `PAYMENT_STATE_LABELS`, `localToday(): string`, `type PaymentState` from `../payments/payments`; `DOCUMENT_TOTAL` from `../documents/documents`; `import type { Cell, CellObject, SheetData } from 'write-excel-file/browser'`.
- Produces (used by Task 3):
  - `export const PLAYERS_SHEET_COLUMNS: readonly { header: string; width: number }[]` (16 entries, spec §3.1 order)
  - `export function excelDate(value: string): Date | null`
  - `export function dateCell(value: string | null): Cell`
  - `export function buildPlayersSheet(rows: readonly PlayerRow[]): SheetData` (row 0 = headers, then one row per player in input order)
  - `export function playersExportFileName(today: string = localToday()): string`

- [ ] **Step 1: Write the failing tests**

Create `src/players/playersSheet.test.ts` (its own `row()` builder; nothing is imported from `PlayersPage.test.tsx` — spec §8.1):

```ts
import { expect } from 'vitest'
import type { CellObject } from 'write-excel-file/browser'
import { PLAYERS_SHEET_COLUMNS, buildPlayersSheet, dateCell, excelDate, playersExportFileName } from './playersSheet'
import type { AffiliationStatus, PlayerRow } from './players'
import { PAYMENT_STATE_LABELS } from '../payments/payments'
import type { PaymentState } from '../payments/payments'
import { DOCUMENT_TOTAL } from '../documents/documents'

const HEADERS = [
  'Nombre', 'Fecha de nacimiento', 'CURP', 'Categoría', 'Equipo', 'Estatus',
  'Fecha de inscripción', 'Tutor', 'WhatsApp del tutor', 'Correo del tutor',
  'Contacto de emergencia', 'Teléfono de emergencia', 'Afiliación', 'Fecha de afiliación',
  'Pago', 'Documentos',
]
const col = (header: string) => HEADERS.indexOf(header)

function row(over: Partial<PlayerRow> = {}): PlayerRow {
  return {
    id: 'p1', tenant_id: 't1', full_name: 'Ana Ruiz', birth_date: '2015-06-10',
    curp: 'RUAA150610MNLZNN09', photo_path: null, status: 'activo', enrollment_date: '2026-07-01',
    tutor_name: 'Luis Ruiz', tutor_whatsapp: '8112345678', tutor_email: 'luis@example.com',
    emergency_contact_name: 'Marta Ruiz', emergency_contact_phone: '8187654321',
    affiliation_status: 'autoriza', affiliation_date: '2026-07-02',
    created_at: '2026-07-01T00:00:00Z', updated_at: '2026-07-01T00:00:00Z',
    edad_liga: 11, division: 'Infantil', category_name: 'Infantil Mayor', category_year: 1,
    category_id: 'cat1', team_id: 'team9', team_name: 'MTY AC Rojo',
    payment_state: 'al_corriente', docs_delivered: 2,
    ...over,
  }
}

function dataRow(over: Partial<PlayerRow> = {}) {
  return buildPlayersSheet([row(over)])[1]
}

test('there is one column definition per header, with a width', () => {
  expect(PLAYERS_SHEET_COLUMNS).toHaveLength(16)
  expect(PLAYERS_SHEET_COLUMNS.map((c) => c.header)).toEqual(HEADERS)
  for (const c of PLAYERS_SHEET_COLUMNS) expect(c.width).toBeGreaterThan(0)
})

test('the first row holds the 16 headers in bold', () => {
  const [header] = buildPlayersSheet([])
  expect(header).toEqual(HEADERS.map((value) => ({ value, fontWeight: 'bold' })))
})

test('one row per player, in the order received', () => {
  const sheet = buildPlayersSheet([
    row({ id: 'p3', full_name: 'Carla Paz' }),
    row({ id: 'p1', full_name: 'Ana Ruiz' }),
    row({ id: 'p2', full_name: 'Beto Gómez' }),
  ])
  expect(sheet).toHaveLength(4)
  expect(sheet.slice(1).map((r) => r[col('Nombre')])).toEqual(['Carla Paz', 'Ana Ruiz', 'Beto Gómez'])
})

test('a full player maps to the expected cells', () => {
  expect(dataRow()).toEqual([
    'Ana Ruiz',
    { value: new Date(Date.UTC(2015, 5, 10)), type: Date, format: 'dd/mm/yyyy' },
    'RUAA150610MNLZNN09',
    'Infantil Mayor (1ro)',
    'MTY AC Rojo',
    'Activo',
    { value: new Date(Date.UTC(2026, 6, 1)), type: Date, format: 'dd/mm/yyyy' },
    'Luis Ruiz',
    { value: '8112345678', type: String, format: '@' },
    'luis@example.com',
    'Marta Ruiz',
    { value: '8187654321', type: String, format: '@' },
    'Autoriza',
    { value: new Date(Date.UTC(2026, 6, 2)), type: Date, format: 'dd/mm/yyyy' },
    'Al corriente',
    { value: `2/${DOCUMENT_TOTAL}`, type: String, format: '@' },
  ])
})

test('dates are UTC midnight of the calendar day, also at year end', () => {
  const cell = dataRow({ birth_date: '2015-06-10', enrollment_date: '2026-12-31' })
  const birth = cell[col('Fecha de nacimiento')] as CellObject
  const enrollment = cell[col('Fecha de inscripción')] as CellObject
  expect(birth.type).toBe(Date)
  expect(birth.format).toBe('dd/mm/yyyy')
  expect((birth.value as Date).getTime()).toBe(Date.UTC(2015, 5, 10))
  expect((enrollment.value as Date).getTime()).toBe(Date.UTC(2026, 11, 31))
})

test('excelDate rejects malformed strings and impossible calendar dates', () => {
  expect(excelDate('2015-06-10')?.getTime()).toBe(Date.UTC(2015, 5, 10))
  expect(excelDate('10/06/2015')).toBeNull()
  expect(excelDate('')).toBeNull()
  expect(excelDate('2015-02-30')).toBeNull()
  expect(excelDate('2015-6-10')).toBeNull()
})

test('dateCell leaves null empty and keeps a malformed value as raw text', () => {
  expect(dateCell(null)).toBeNull()
  expect(dateCell('10/06/2015')).toBe('10/06/2015')
  expect(dateCell('2015-02-30')).toBe('2015-02-30')
})

test('nullable fields become empty cells, never "" or "null" or a styled empty object', () => {
  const cells = dataRow({
    curp: null, team_name: null, tutor_email: null,
    emergency_contact_name: null, emergency_contact_phone: null, affiliation_date: null,
  })
  for (const header of ['CURP', 'Equipo', 'Correo del tutor', 'Contacto de emergencia', 'Teléfono de emergencia', 'Fecha de afiliación']) {
    expect(cells[col(header)]).toBeNull()
  }
})

test('enums use their human labels', () => {
  expect(dataRow({ status: 'baja' })[col('Estatus')]).toBe('Baja')
  const affiliations: Record<AffiliationStatus, string> = {
    autoriza: 'Autoriza', no_autoriza: 'No autoriza', pendiente: 'Pendiente',
  }
  for (const [value, label] of Object.entries(affiliations)) {
    expect(dataRow({ affiliation_status: value as AffiliationStatus })[col('Afiliación')]).toBe(label)
  }
  for (const state of ['con_adeudo', 'sin_pagos', 'al_corriente'] as PaymentState[]) {
    expect(dataRow({ payment_state: state })[col('Pago')]).toBe(PAYMENT_STATE_LABELS[state])
  }
})

test('category falls back to the out-of-category text with the league age', () => {
  const cells = dataRow({ category_id: null, category_name: null, category_year: null, edad_liga: 25 })
  expect(cells[col('Categoría')]).toBe('Fuera de categoría (edad 25)')
})

test('phones and the documents count are text-formatted cells', () => {
  const cells = dataRow({ docs_delivered: DOCUMENT_TOTAL })
  for (const header of ['WhatsApp del tutor', 'Teléfono de emergencia', 'Documentos']) {
    expect(cells[col(header)]).toMatchObject({ type: String, format: '@' })
  }
  expect(cells[col('Documentos')]).toMatchObject({ value: `${DOCUMENT_TOTAL}/${DOCUMENT_TOTAL}` })
})

test('a value that looks like a formula stays a plain string and no cell is a formula', () => {
  const sheet = buildPlayersSheet([
    row({ full_name: '=1+1', curp: '@SUM(1)', tutor_name: '+52 81', tutor_email: '-1' }),
  ])
  expect(sheet[1][col('Nombre')]).toBe('=1+1')
  for (const cell of sheet.flat()) {
    if (cell !== null && typeof cell === 'object' && !(cell instanceof Date)) {
      expect((cell as CellObject).type).not.toBe('Formula')
    }
  }
})

test('the file name carries the given local date', () => {
  expect(playersExportFileName('2026-10-15')).toBe('jugadores-2026-10-15.xlsx')
})

test('an enum value with no label (DB grew first) leaves an empty cell instead of "undefined"', () => {
  const cells = dataRow({
    status: 'suspendido' as PlayerRow['status'],
    affiliation_status: 'revocada' as AffiliationStatus,
    payment_state: 'condonado' as PaymentState,
  })
  expect(cells[col('Estatus')]).toBeNull()
  expect(cells[col('Afiliación')]).toBeNull()
  expect(cells[col('Pago')]).toBeNull()
})
```

Why these pin real bugs: the suite runs with `TZ: 'America/Monterrey'` (`vite.config.ts`), so a local-midnight `new Date(y, m - 1, d)` turns 3 tests red (`a full player …`, `dates are UTC midnight …`, `excelDate rejects …` — verified by mutation). `toEqual` treats `{ value: null, format: '@' }` ≠ `null`, so the emergency-phone case pins spec §3.1's "never a styled empty object".

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm exec vitest run src/players/playersSheet.test.ts`
Expected: the file fails to load — `Failed to resolve import "./playersSheet"` (1 failed file, 0 tests run).

- [ ] **Step 3: Implement the builder**

Create `src/players/playersSheet.ts`:

```ts
import type { Cell, SheetData } from 'write-excel-file/browser'
import { PAYMENT_STATE_LABELS, localToday } from '../payments/payments'
import { DOCUMENT_TOTAL } from '../documents/documents'
import { AFFILIATION_STATUS_LABELS, PLAYER_STATUS_LABELS, playerCategoryText } from './players'
import type { PlayerRow } from './players'

export const PLAYERS_SHEET_COLUMNS: readonly { header: string; width: number }[] = [
  { header: 'Nombre', width: 28 },
  { header: 'Fecha de nacimiento', width: 12 },
  { header: 'CURP', width: 20 },
  { header: 'Categoría', width: 24 },
  { header: 'Equipo', width: 20 },
  { header: 'Estatus', width: 10 },
  { header: 'Fecha de inscripción', width: 12 },
  { header: 'Tutor', width: 24 },
  { header: 'WhatsApp del tutor', width: 16 },
  { header: 'Correo del tutor', width: 28 },
  { header: 'Contacto de emergencia', width: 24 },
  { header: 'Teléfono de emergencia', width: 16 },
  { header: 'Afiliación', width: 12 },
  { header: 'Fecha de afiliación', width: 12 },
  { header: 'Pago', width: 14 },
  { header: 'Documentos', width: 12 },
]

const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/

// UTC midnight: the library converts Dates to Excel serials in UTC
export function excelDate(value: string): Date | null {
  const match = DATE_PATTERN.exec(value)
  if (!match) return null
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])]
  const date = new Date(Date.UTC(year, month - 1, day))
  if (date.getUTCFullYear() !== year || date.getUTCMonth() + 1 !== month || date.getUTCDate() !== day) return null
  return date
}

export function dateCell(value: string | null): Cell {
  if (value === null) return null
  const date = excelDate(value)
  if (!date) return value
  return { value: date, type: Date, format: 'dd/mm/yyyy' }
}

function textCell(value: string | null): Cell {
  if (value === null) return null
  return { value, type: String, format: '@' }
}

function playerRow(p: PlayerRow): Cell[] {
  return [
    p.full_name,
    dateCell(p.birth_date),
    p.curp,
    playerCategoryText(p),
    p.team_name,
    PLAYER_STATUS_LABELS[p.status] ?? null,
    dateCell(p.enrollment_date),
    p.tutor_name,
    textCell(p.tutor_whatsapp),
    p.tutor_email,
    p.emergency_contact_name,
    textCell(p.emergency_contact_phone),
    AFFILIATION_STATUS_LABELS[p.affiliation_status] ?? null,
    dateCell(p.affiliation_date),
    PAYMENT_STATE_LABELS[p.payment_state] ?? null,
    textCell(`${p.docs_delivered}/${DOCUMENT_TOTAL}`),
  ]
}

export function buildPlayersSheet(rows: readonly PlayerRow[]): SheetData {
  const header: Cell[] = PLAYERS_SHEET_COLUMNS.map(({ header }) => ({ value: header, fontWeight: 'bold' }))
  return [header, ...rows.map(playerRow)]
}

export function playersExportFileName(today: string = localToday()): string {
  return `jugadores-${today}.xlsx`
}
```

Notes: `?? null` is what turns an unknown enum into an empty cell (spec §6). The `import type` line is erased at build time, so this module never pulls the library into the main bundle (checked by the `index-*.js` grep at the end). Order of the 16 cells **must** match `PLAYERS_SHEET_COLUMNS`.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm exec vitest run src/players/playersSheet.test.ts`
Expected: `Tests 14 passed (14)`.

- [ ] **Step 5: Full verification**

Run: `pnpm exec vitest run` → `B_files + 1` files · `B_tests + 16` tests, all passing (`38` / `317` if the baseline is as measured).
Run: `pnpm exec tsc -b` → exit 0, no output.
Run: `pnpm lint` → exit 0.

- [ ] **Step 6: Commit**

```bash
git -C /Users/arturoortiz/Proyectos/Personales/ligaspequenas-worktrees/excel-export add src/players/playersSheet.ts src/players/playersSheet.test.ts
git -C /Users/arturoortiz/Proyectos/Personales/ligaspequenas-worktrees/excel-export commit -m "feat: map visible players to an Excel sheet with UTC dates and human labels (#5)" -m "Claude-Session: https://claude.ai/code/session_014qeQvKRptEH9hDetwoCqc4"
```

### Task 3: Lazy-loading exporter `exportPlayers.ts`

**Files:**
- Create: `src/players/exportPlayers.ts`
- Test (create): `src/players/exportPlayers.test.ts`

**Interfaces:**
- Consumes: `PLAYERS_SHEET_COLUMNS`, `buildPlayersSheet`, `playersExportFileName` (Task 2); `type PlayerRow`; default export of `write-excel-file/browser`: `writeExcelFile(sheetData: SheetData, sheetOptions?: SheetOptions) → { toFile(fileName: string): Promise<void>; toBlob(): Promise<Blob> }` (4.1.1 typings).
- Produces (used by Task 4): `export async function exportPlayersToExcel(rows: readonly PlayerRow[]): Promise<void>` — resolves after `toFile` resolves; any failure (chunk load, zip) rejects.

- [ ] **Step 1: Write the failing tests**

Create `src/players/exportPlayers.test.ts`:

```ts
import { afterEach, beforeEach, expect, vi } from 'vitest'
import { exportPlayersToExcel } from './exportPlayers'
import { buildPlayersSheet } from './playersSheet'
import type { PlayerRow } from './players'

const mocks = vi.hoisted(() => ({ writeExcelFile: vi.fn(), toFile: vi.fn() }))
vi.mock('write-excel-file/browser', () => ({ default: mocks.writeExcelFile }))

function row(over: Partial<PlayerRow> = {}): PlayerRow {
  return {
    id: 'p1', tenant_id: 't1', full_name: 'Ana Ruiz', birth_date: '2015-06-10',
    curp: null, photo_path: null, status: 'activo', enrollment_date: '2026-07-01',
    tutor_name: 'Luis Ruiz', tutor_whatsapp: '8110000000', tutor_email: null,
    emergency_contact_name: null, emergency_contact_phone: null,
    affiliation_status: 'pendiente', affiliation_date: null,
    created_at: '2026-07-01T00:00:00Z', updated_at: '2026-07-01T00:00:00Z',
    edad_liga: 11, division: 'Infantil', category_name: 'Infantil Mayor', category_year: 1,
    category_id: 'cat1', team_id: null, team_name: null,
    payment_state: 'sin_pagos', docs_delivered: 0,
    ...over,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers()
  vi.setSystemTime(new Date(2026, 9, 15, 12))
  mocks.toFile.mockResolvedValue(undefined)
  mocks.writeExcelFile.mockReturnValue({ toFile: mocks.toFile })
})

afterEach(() => {
  vi.useRealTimers()
})

test('writes the sheet built from the rows with the Jugadores options and downloads it', async () => {
  const rows = [row({ id: 'p2', full_name: 'Beto Gómez' }), row()]
  await exportPlayersToExcel(rows)
  expect(mocks.writeExcelFile).toHaveBeenCalledTimes(1)
  const [sheet, options] = mocks.writeExcelFile.mock.calls[0]
  expect(sheet).toEqual(buildPlayersSheet(rows))
  expect(options).toMatchObject({ sheet: 'Jugadores', stickyRowsCount: 1 })
  expect(options.columns).toHaveLength(16)
  expect(mocks.toFile).toHaveBeenCalledWith('jugadores-2026-10-15.xlsx')
})

test('the file name uses the local date, not the UTC one', async () => {
  // 21:00 on Oct 15 in Monterrey is already Oct 16 in UTC
  vi.setSystemTime(new Date(2026, 9, 15, 21))
  await exportPlayersToExcel([row()])
  expect(mocks.toFile).toHaveBeenCalledWith('jugadores-2026-10-15.xlsx')
})

test('a failed download rejects', async () => {
  mocks.toFile.mockRejectedValue(new Error('zip failed'))
  await expect(exportPlayersToExcel([row()])).rejects.toThrow('zip failed')
})
```

(`vi.mock` with a factory also intercepts the dynamic `import()`, so the real library is never loaded in tests.)

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm exec vitest run src/players/exportPlayers.test.ts`
Expected: the file fails to load — `Failed to resolve import "./exportPlayers"` (1 failed file, 0 tests run).

- [ ] **Step 3: Implement the exporter**

Create `src/players/exportPlayers.ts` (spec §4.3, verbatim):

```ts
import { PLAYERS_SHEET_COLUMNS, buildPlayersSheet, playersExportFileName } from './playersSheet'
import type { PlayerRow } from './players'

export async function exportPlayersToExcel(rows: readonly PlayerRow[]): Promise<void> {
  const { default: writeExcelFile } = await import('write-excel-file/browser')
  await writeExcelFile(buildPlayersSheet(rows), {
    sheet: 'Jugadores',
    stickyRowsCount: 1,
    columns: PLAYERS_SHEET_COLUMNS.map(({ width }) => ({ width })),
  }).toFile(playersExportFileName())
}
```

No `try/catch` here: rejection is the contract Task 4 relies on.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm exec vitest run src/players/exportPlayers.test.ts`
Expected: `Tests 3 passed (3)`.

- [ ] **Step 5: Full verification**

Run: `pnpm exec vitest run` → `B_files + 2` files · `B_tests + 19` tests, all passing (`39` / `320` if the baseline is as measured).
Run: `pnpm exec tsc -b` → exit 0, no output.
Run: `pnpm lint` → exit 0.

- [ ] **Step 6: Commit**

```bash
git -C /Users/arturoortiz/Proyectos/Personales/ligaspequenas-worktrees/excel-export add src/players/exportPlayers.ts src/players/exportPlayers.test.ts
git -C /Users/arturoortiz/Proyectos/Personales/ligaspequenas-worktrees/excel-export commit -m "feat: generate and download the players workbook with a lazily loaded writer (#5)" -m "Claude-Session: https://claude.ai/code/session_014qeQvKRptEH9hDetwoCqc4"
```

### Task 4: "Exportar a Excel" button on `PlayersPage`

**Files:**
- Modify: `src/players/PlayersPage.tsx` (imports l.1-19, state l.43-51, new handler after `visible` l.86-95, header `Stack` l.99-113)
- Test: `src/players/PlayersPage.test.tsx` (imports l.1, mocks l.9-14, `beforeEach` l.46-54, new tests appended at the end)

**Interfaces:**
- Consumes: `exportPlayersToExcel(rows: readonly PlayerRow[]): Promise<void>` from `./exportPlayers` (Task 3); existing `visible: PlayerRow[]`, `loadError: boolean`, `isAdmin(role)`.
- Produces: UI only — `button` named `Exportar a Excel` (admin only; `disabled`, `aria-busy`), `Alert` `role="alert"` with the export error. Nothing downstream imports from this task.

- [ ] **Step 1: Write the failing tests**

In `src/players/PlayersPage.test.tsx`:

1. Line 1 becomes:

```tsx
import { act, render, screen, waitFor, within } from '@testing-library/react'
```

2. Replace the mocks block (lines 9–13: `const mocks = vi.hoisted(…)` through the `vi.mock('./players', …)` closing `})`) with:

```tsx
const mocks = vi.hoisted(() => ({ fetchPlayers: vi.fn(), useTenant: vi.fn(), exportPlayersToExcel: vi.fn() }))
vi.mock('./players', async (importActual) => {
  const actual = await importActual<typeof import('./players')>()
  return { ...actual, fetchPlayers: mocks.fetchPlayers }
})
vi.mock('./exportPlayers', () => ({ exportPlayersToExcel: mocks.exportPlayersToExcel }))
```

(the existing `vi.mock('../tenant/TenantContext', …)` line stays right after it.)

3. At the end of `beforeEach`, after the `mocks.fetchPlayers.mockResolvedValue([...])` call, add:

```tsx
  mocks.exportPlayersToExcel.mockResolvedValue(undefined)
```

4. Append at the end of the file:

```tsx
function exportButton() {
  return screen.getByRole('button', { name: 'Exportar a Excel' })
}

function deferred() {
  let resolve!: () => void
  let reject!: (error: Error) => void
  const promise = new Promise<void>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

test('admin sees "Exportar a Excel"; readonly does not', async () => {
  const { unmount } = renderPage()
  await screen.findByText('Ana Ruiz')
  expect(exportButton()).toBeEnabled()
  unmount()
  mocks.useTenant.mockReturnValue({ status: 'ready', role: 'readonly', fullName: 'Lector', tenantId: 't1' })
  renderPage()
  await screen.findByText('Ana Ruiz')
  expect(screen.queryByRole('button', { name: 'Exportar a Excel' })).not.toBeInTheDocument()
})

test('export is disabled while loading and when the filters leave no player', async () => {
  const load = deferred()
  mocks.fetchPlayers.mockReturnValueOnce(load.promise.then(() => [player({})]))
  const user = userEvent.setup()
  renderPage()
  expect(exportButton()).toBeDisabled()
  await act(async () => load.resolve())
  await waitFor(() => expect(exportButton()).toBeEnabled())
  await user.type(screen.getByLabelText('Buscar por nombre'), 'zzz')
  await waitFor(() => expect(exportButton()).toBeDisabled())
})

test('export is disabled when the list failed to load', async () => {
  mocks.fetchPlayers.mockRejectedValueOnce(new Error('boom'))
  renderPage()
  expect(await screen.findByText('No se pudo cargar la información.')).toBeInTheDocument()
  expect(exportButton()).toBeDisabled()
})

test('export sends exactly the visible players, in list order', async () => {
  const user = userEvent.setup()
  renderPage()
  await screen.findByText('Beto Gómez')
  await user.selectOptions(screen.getByLabelText('Estatus'), 'activo')
  await waitFor(() => expect(screen.queryByText('Beto Gómez')).not.toBeInTheDocument())
  await user.click(exportButton())
  expect(mocks.exportPlayersToExcel).toHaveBeenCalledTimes(1)
  const [rows] = mocks.exportPlayersToExcel.mock.calls[0] as [PlayerRow[]]
  expect(rows.map((p) => p.id)).toEqual(['p1', 'p3'])
})

test('a double click exports once and the button is busy until the file is ready', async () => {
  const run = deferred()
  mocks.exportPlayersToExcel.mockReturnValue(run.promise)
  const user = userEvent.setup()
  renderPage()
  await screen.findByText('Ana Ruiz')
  await user.dblClick(exportButton())
  expect(mocks.exportPlayersToExcel).toHaveBeenCalledTimes(1)
  expect(exportButton()).toBeDisabled()
  expect(exportButton()).toHaveAttribute('aria-busy', 'true')
  await act(async () => run.resolve())
  await waitFor(() => expect(exportButton()).toBeEnabled())
  expect(exportButton()).toHaveAttribute('aria-busy', 'false')
})

test('two clicks in the same tick export once', async () => {
  const run = deferred()
  mocks.exportPlayersToExcel.mockReturnValue(run.promise)
  renderPage()
  await screen.findByText('Ana Ruiz')
  const button = exportButton()
  act(() => {
    button.click()
    button.click()
  })
  expect(mocks.exportPlayersToExcel).toHaveBeenCalledTimes(1)
  await act(async () => run.resolve())
})

test('focus returns to the export button when the file is ready', async () => {
  const run = deferred()
  mocks.exportPlayersToExcel.mockReturnValue(run.promise)
  const user = userEvent.setup()
  renderPage()
  await screen.findByText('Ana Ruiz')
  await user.click(exportButton())
  // Browsers drop focus from a button that becomes disabled; jsdom does not, so drop it by hand.
  act(() => exportButton().blur())
  expect(document.body).toHaveFocus()
  await act(async () => run.resolve())
  await waitFor(() => expect(exportButton()).toBeEnabled())
  expect(exportButton()).toHaveFocus()
})

test('a failed export shows an error, re-enables the button, and a later success clears it', async () => {
  mocks.exportPlayersToExcel.mockRejectedValueOnce(new Error('chunk failed'))
  const user = userEvent.setup()
  renderPage()
  await screen.findByText('Ana Ruiz')
  await user.click(exportButton())
  expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo generar el archivo de Excel. Intenta de nuevo.')
  expect(exportButton()).toBeEnabled()
  await user.click(exportButton())
  await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument())
  expect(mocks.exportPlayersToExcel).toHaveBeenCalledTimes(2)
})
```

Do not change any existing test (spec §8.3). `deferred().reject` is unused by these tests; `tsc -b` and `pnpm lint` accept it as written (verified).

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm exec vitest run src/players/PlayersPage.test.tsx`
Expected: exactly the 8 new tests fail (`Unable to find an accessible element with the role "button" and name "Exportar a Excel"`); the 21 existing tests pass.

- [ ] **Step 3: Implement the button**

In `src/players/PlayersPage.tsx`:

1. Line 1 becomes:

```tsx
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
```

2. After `import Chip from '@mui/material/Chip'` (line 11) add:

```tsx
import Alert from '@mui/material/Alert'
```

3. After `import type { PlayerRow, PlayerStatus } from './players'` (line 19) add:

```tsx
import { exportPlayersToExcel } from './exportPlayers'
```

4. After `const [reloadKey, setReloadKey] = useState(0)` (line 51) add:

```tsx
  const [exporting, setExporting] = useState(false)
  const [exportError, setExportError] = useState<string | null>(null)
  const exportingRef = useRef(false)
  const exportButtonRef = useRef<HTMLButtonElement>(null)
```

5. Between the end of the `visible` filter (line 95, `})`) and `return (`, add:

```tsx
  async function handleExport() {
    // state-driven disabled lands a render late; the ref stops a second click in the same tick
    if (exportingRef.current) return
    exportingRef.current = true
    setExporting(true)
    setExportError(null)
    try {
      await exportPlayersToExcel(visible)
    } catch {
      setExportError('No se pudo generar el archivo de Excel. Intenta de nuevo.')
    } finally {
      exportingRef.current = false
      setExporting(false)
      if (document.activeElement === document.body) exportButtonRef.current?.focus()
    }
  }
```

6. Replace the admin block and the end of the header `Stack` (lines 108–113):

```tsx
        {isAdmin(role) && (
          <Button variant="contained" component={RouterLink} to="/jugadores/nuevo">
            Nuevo jugador
          </Button>
        )}
      </Stack>
```

with:

```tsx
        {isAdmin(role) && (
          <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: 'wrap' }}>
            <Button
              ref={exportButtonRef}
              variant="outlined"
              onClick={() => void handleExport()}
              disabled={loadError || visible.length === 0 || exporting}
              aria-busy={exporting}
            >
              Exportar a Excel
            </Button>
            <Button variant="contained" component={RouterLink} to="/jugadores/nuevo">
              Nuevo jugador
            </Button>
          </Stack>
        )}
      </Stack>

      {exportError && (
        <Alert role="alert" severity="error" sx={{ mt: 2 }}>
          {exportError}
        </Alert>
      )}
```

The `Alert` sits **before** `{loadError ? <LoadError … /> : …}`, outside both branches (spec §4.4). `visible` is the array of the render that handled the click, so changing filters while the file is generated does not alter it (spec §2 "Qué filas"). Leave `secondary={… p.status …}` (line 208) untouched.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm exec vitest run src/players/PlayersPage.test.tsx`
Expected: `Tests 29 passed (29)` (21 existing + 8 new).

Guard check (optional; edit by hand, rerun, then undo by hand — never `git checkout`/`stash` the file): commenting out `if (exportingRef.current) return` makes exactly `two clicks in the same tick export once` fail; removing the `document.activeElement === document.body` line makes exactly the focus test fail. Both verified while writing this plan.

- [ ] **Step 5: Full verification**

Run: `pnpm exec vitest run` → `B_files + 2` files · `B_tests + 27` tests, all passing (`Test Files 39 passed (39)` · `Tests 328 passed (328)` if the baseline is as measured).
Run: `pnpm exec tsc -b` → exit 0, no output.
Run: `pnpm lint` → exit 0.
Run: `pnpm build` and the chunk greps from the Verification checklist.

- [ ] **Step 6: Commit**

```bash
git -C /Users/arturoortiz/Proyectos/Personales/ligaspequenas-worktrees/excel-export add src/players/PlayersPage.tsx src/players/PlayersPage.test.tsx
git -C /Users/arturoortiz/Proyectos/Personales/ligaspequenas-worktrees/excel-export commit -m "feat: let admins export the visible players to Excel from the players list (#5)" -m "Claude-Session: https://claude.ai/code/session_014qeQvKRptEH9hDetwoCqc4"
```

## Verification checklist (implementer, before reporting)

- [ ] `pnpm exec vitest run` → `B_files + 2` files · `B_tests + 27` tests, all passing (`Test Files 39 passed (39)` · `Tests 328 passed (328)` if the baseline is as measured).
- [ ] `pnpm exec tsc -b` → exit 0, no output.
- [ ] `pnpm lint` → exit 0.
- [ ] `pnpm build` → exit 0; the output lists a separate `dist/assets/browser-<hash>.js` chunk (measured ≈ 70.8 kB / 19.7 kB gzip) next to `index-<hash>.js`. Record both sizes for the PR.
- [ ] `grep -c sharedStrings dist/assets/index-*.js` → prints `0` (grep exits 1 on zero matches; that is the expected outcome) — the entry chunk does not contain the library.
- [ ] `grep -l sharedStrings dist/assets/browser-*.js` → prints **exactly one** path (positive control: the string exists in the library chunk, so the `0` above means something).
- [ ] `grep -rn "write-excel-file" src --include='*.ts' --include='*.tsx' | grep -v '\.test\.'` → exactly two lines: the `import type { Cell, SheetData } from 'write-excel-file/browser'` in `playersSheet.ts` and the `import('write-excel-file/browser')` in `exportPlayers.ts`.
- [ ] `grep -n '"write-excel-file"' package.json` → `"write-excel-file": "4.1.1"` (no `^`/`~`); `grep -n "xlsx" package.json` → empty.
- [ ] `grep -rn "'Formula'" src/players/playersSheet.ts` → empty.
- [ ] `git -C $WT fetch origin` first; then `git -C $WT diff --stat origin/develop..HEAD` lists only: `package.json`, `pnpm-lock.yaml`, `src/players/players.ts`, `src/players/players.test.ts`, `src/players/playersSheet.ts`, `src/players/playersSheet.test.ts`, `src/players/exportPlayers.ts`, `src/players/exportPlayers.test.ts`, `src/players/PlayersPage.tsx`, `src/players/PlayersPage.test.tsx` (10 files; nothing under `supabase/`).
- [ ] `git -C $WT log --oneline origin/develop..HEAD` shows exactly 4 commits (Tasks 1–4), each ending with the `Claude-Session` line; `git -C $WT status --short` is empty (`dist/` is git-ignored).
- [ ] `git -C $WT ls-files | grep -E '^\.env'` → empty.

**Report:** commit SHAs, baseline and final test counts, build sizes (`index-*.js` and `browser-*.js`, raw + gzip) and the two grep outputs, anything adapted from the plan and why. The orchestrator copies sizes and greps into the PR body (`Closes #5`).

## Manual browser E2E (orchestrator, Playwright — no tester agent)

Run by the orchestrator against the dev server (from the implementer worktree before the PR, or from the main checkout on `develop` after the merge — orchestrator's call), using the **persistent Chromium already logged in as admin** over CDP (never close it). Readonly runs in a **separate browser context** (`browser.newContext()`, not the admin one); the owner pastes the readonly magic link. The orchestrator owns the dev server and the test-data cleanup. Scratch dir below: `$SP` = the orchestrator's session scratchpad.

**Preflight (orchestrator, SQL via `mcp__supabase__execute_sql`):**

```sql
select (select count(*) from public.players where full_name like 'E2E Export%') as players,
       (select count(*) from public.teams where name like 'E2E Export%') as teams;
```

Expected: `0` / `0` (if not, run the cleanup block first).

**Test data rule:** only dedicated `E2E Export …` players and one `E2E Export …` team, created through the UI. Never use or modify a real player or team; never export or inspect the unfiltered real list.

**Create the data (admin, through the UI):**
- [ ] **Nuevo jugador** → `E2E Export Uno`: birth date `2015-06-10`, tutor `Tutor Uno`, WhatsApp `8112345678`, CURP / correo / contacto y teléfono de emergencia **empty**, afiliación `Pendiente`, fecha de afiliación **empty**, Estatus `Activo`. Guardar.
- [ ] **Nuevo jugador** → `E2E Export Dos`: birth date `2015-12-31`, CURP `EEXD151231HNLXXX09`, tutor `=HYPERLINK("http://x")` (formula-injection probe), WhatsApp `8187654321`, correo `dos@example.com`, emergencia `Marta` / `8100000000`, afiliación `Autoriza` with fecha de afiliación `2026-07-02`, Estatus `Activo`. Guardar.
- [ ] **Nuevo jugador** → `E2E Export Tres`: birth date `2015-06-10`, tutor `Tutor Tres`, WhatsApp `8111111111`, Estatus **`Baja`**. Guardar.
- [ ] Read `E2E Export Dos`'s category in the list; **Equipos → Nuevo equipo** → `E2E Export Equipo` with that category. Guardar. In the team page **Añadir jugador** → pick `E2E Export Dos`.

**Export (admin):**
- [ ] Before clicking, start recording requests: `page.on('request', r => urls.push(r.url()))`; reload `/jugadores`; confirm no URL contains `write-excel-file` (dev server: `/node_modules/.vite/deps/write-excel-file_browser.js`) nor `/assets/browser-` (preview build).
- [ ] Buscar por nombre `E2E Export` → three players listed; `Exportar a Excel` and `Nuevo jugador` both visible, export enabled.
- [ ] Estatus = `Activo` → only `Uno` and `Dos` remain. `const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Exportar a Excel' }).click()])`; `download.suggestedFilename()` = `jugadores-<today local YYYY-MM-DD>.xlsx`; `await download.saveAs('$SP/e2e-export/jugadores.xlsx')`. If no `download` event fires within 10 s over CDP, take the file from `~/Downloads/jugadores-<date>.xlsx` and move it to `$SP/e2e-export/`.
- [ ] Now `urls` contains exactly one library request (the chunk was fetched only on click). The button is enabled again and has focus; no `Alert`.
- [ ] Search `zzz` → button disabled. Clear the search.

**Inspect the file (orchestrator scratchpad, outside the repo):**

```bash
mkdir -p $SP/xlsx-reader && cd $SP/xlsx-reader && npm init -y >/dev/null && npm i -E read-excel-file@9.3.12
cat > $SP/xlsx-reader/inspect.mjs <<'EOF'
import readXlsxFile from 'read-excel-file/node'
console.log(JSON.stringify(await readXlsxFile(process.argv[2]), null, 1))
EOF
node $SP/xlsx-reader/inspect.mjs $SP/e2e-export/jugadores.xlsx
mkdir -p $SP/e2e-export/x && unzip -o -q $SP/e2e-export/jugadores.xlsx -d $SP/e2e-export/x
grep -c '<f>' $SP/e2e-export/x/xl/worksheets/sheet1.xml
grep -o 'formatCode="[^"]*"' $SP/e2e-export/x/xl/styles.xml
grep -o '<pane[^/]*' $SP/e2e-export/x/xl/worksheets/sheet1.xml
```

- [ ] One sheet named `Jugadores`; row 1 = the 16 headers of spec §3.1 in order; then exactly 2 rows: `E2E Export Dos`, `E2E Export Uno` (list order, `full_name` asc); `Tres` (baja) absent.
- [ ] Dates come back as `…T00:00:00.000Z` of the right day: Dos birth `2015-12-31`, affiliation `2026-07-02`; Uno birth `2015-06-10`; enrollment = the day you created them. `formatCode="dd/mm/yyyy"` and `formatCode="@"` both present.
- [ ] Uno: CURP, Correo, Contacto/Teléfono de emergencia, Fecha de afiliación → `null`; Afiliación `Pendiente`; Pago `Sin pagos`; Documentos `0/6`; Equipo `null`.
- [ ] Dos: Equipo `E2E Export Equipo`; Estatus `Activo`; Afiliación `Autoriza`; Tutor is the literal text `=HYPERLINK("http://x")`; WhatsApp `8187654321` as text.
- [ ] `grep -c '<f>'` → `0` (no formulas); `<pane … ySplit="1" … state="frozen"` present (header row sticky).
- [ ] Optional: open the file in Numbers/LibreOffice and confirm dates show `dd/mm/yyyy` and the header row stays fixed on scroll.

**Readonly (separate browser context, owner pastes the magic link):**
- [ ] `/jugadores` lists the players with filters; **no** `Exportar a Excel` and **no** `Nuevo jugador` (not even disabled).

**Mobile (admin and readonly), viewports 360 × 740 and 390 × 844:**
- [ ] Header stacks; the two admin buttons sit in one row or wrap; no horizontal scroll (`document.documentElement.scrollWidth <= window.innerWidth`).

**Cleanup (orchestrator; players first, then the team — `team_players`, documents and payments cascade):**

```sql
delete from public.players where full_name like 'E2E Export%';
delete from public.teams where name like 'E2E Export%';
select (select count(*) from public.players where full_name like 'E2E Export%') as players,
       (select count(*) from public.teams where name like 'E2E Export%') as teams;
```

Expected: `0` / `0`. Then `rm -rf $SP/e2e-export` (the downloaded workbook holds test data only, but it never stays on disk) and, if the fallback was used, confirm `~/Downloads/jugadores-<date>.xlsx` is gone. Close only the readonly context, never the admin Chromium.

After merge: #5 closes via `Closes #5`.

---

## Spec coverage (self-review)

| Spec § | Requirement | Task |
|---|---|---|
| §1 | Admin-only button, visible rows only, same order, real dates, human labels, local-date file name, dynamic import | Tasks 2–4 |
| §1 | Out of scope: full backup, payments sheet, readonly export, #71/#72/#76, DB, refactor of `<option>`s | Global Constraints; no task touches them |
| §2 library | `write-excel-file` 4.1.1 exact, `/browser` entry, `toFile` | Task 1 Step 1; Task 3 Step 3; checklist greps |
| §2 deviations (no `xlsx`, admin-only) | | Global Constraints; checklist `grep xlsx`; Task 4 readonly test |
| §2 dynamic import / separate chunk | | Task 3 Step 3; checklist `pnpm build` + `sharedStrings` greps; E2E request log |
| §2 pure function + thin module | `buildPlayersSheet` / `exportPlayersToExcel` | Tasks 2, 3 |
| §2 rows = `visible` at click time, same order | | Task 4 Step 3 + `export sends exactly the visible players` |
| §2 dates via `Date.UTC`, labels, `DOCUMENT_TOTAL`, `localToday()`, error `Alert`, no DB | | Tasks 1–4 |
| §3 sheet `Jugadores`, bold headers, sticky row 1, no totals | | Task 2 header test; Task 3 options test; E2E `<pane>` |
| §3.1 16 columns, origins, null → `null` (incl. `format: '@'` columns), `format: '@'` on phones/Documentos, not-exported fields, widths | | Task 2 (tests 1, 4, 8, 11); Task 3 `columns.length` |
| §3.2 UTC midnight, regex, round-trip → `null`, `dateCell` raw text fallback, Monterrey TZ | | Task 2 (tests 4–7) |
| §4.1 label maps, same texts as `<option>`s, `<option>`s untouched | | Task 1 |
| §4.2 `PLAYERS_SHEET_COLUMNS`, `excelDate`, `dateCell`, `buildPlayersSheet`, `playersExportFileName(today = localToday())`, type-only import | | Task 2 Step 3; checklist grep |
| §4.3 `exportPlayersToExcel` verbatim, rejection propagates | | Task 3 |
| §4.4 state, ref guard, focus return, header `Stack`, `disabled` incl. `loadError`, `aria-busy`, fixed text, `Alert` outside `LoadError` branch, cleared on retry | | Task 4 Step 3; tests 2–8 |
| §5.1 roles | | Task 4 test 1; E2E readonly |
| §5.2 button states table, baja exported when visible | | Task 4 tests 2–6, 8; E2E (Tres excluded by Activo filter, included by default) |
| §5.3 mobile 360 px, wrap | | E2E mobile (360 and 390) |
| §6 errors: chunk/zip failure, empty list, malformed date, missing label | | Task 4 test 8; Task 4 test 2; Task 2 test 7; Task 2 last test |
| §7 formula injection: no `type: 'Formula'`, literal strings | | Task 2 formula test; checklist grep; E2E `<f>` count + `=HYPERLINK` tutor |
| §7 generated in browser only, admin-only is UI | | Task 3 (no network/storage code); Global Constraints |
| §8.1 / §8.2 / §8.3 test lists | | Tasks 1–4 Step 1 |
| §9 file list | 10 files | Checklist `diff --stat` |
| §10 one branch `feature/players-excel-export`, order dep+labels → sheet → exporter → page, verification, E2E data/cleanup | | Tasks 1–4, checklists, E2E |
| §11 risks | accepted; no task (CSP `worker-src blob:` and iOS preview noted for reviewers) | — |

Decisions the spec left open, resolved here:
- **Column widths** (spec gave three examples): Nombre 28, fechas 12, CURP 20, Categoría 24, Equipo 20, Estatus 10, Tutor 24, teléfonos 16, Correo 28, Contacto 24, Afiliación 12, Pago 14, Documentos 12.
- **Missing enum label** (spec §6 "la celda queda vacía"): implemented as `LABELS[x] ?? null` and pinned by a test, so it is `null`, never `undefined` (which the library would also write as empty, but `toEqual` would not distinguish from a missing cell).
- **Local-date file name**: spec §8.2 fixes the time at 12:00; this plan adds a 21:00 case (UTC already the next day) so a `toISOString()` regression fails.
- **Focus test**: jsdom does not blur a button when it becomes disabled, so a plain "has focus after export" test passes even without the restore code (verified). The test blurs by hand during the pending export, which makes it fail without the restore (verified).
- **`loadError` in `disabled`**: in today's UI a failed load always leaves `players` empty (retry is only reachable from the error state), so the `LoadError` test passes with or without the explicit term; it stays as the spec's defense-in-depth and the test pins the visible behavior.
- **`players.test.ts` "one entry per value"**: done with a full-object `toEqual`, which also pins the exact Spanish texts.
- **Test count**: Task 2 has 14 tests (spec §8.1 bullets + the missing-label case); Task 3 has 3; Task 4 has 8 (spec §8.3's double-click split into two tests, plus separate loading/empty and `LoadError` tests). Total +27.
- **E2E data**: three players created through the UI (one with every nullable empty, one with a team + formula-injection probe + year-end birth date, one `baja` excluded by the Estatus filter) and one dedicated team; the exported file is read with `read-excel-file/node` 9.3.12 plus `unzip`/`grep` in the orchestrator's scratchpad; download captured with `page.waitForEvent('download')` with a `~/Downloads` fallback for CDP sessions.
- **Base ref**: the spec/plan PR is merged into `develop` before dispatch and the branch is cut from `origin/develop`, so every range check is against the remote ref.
