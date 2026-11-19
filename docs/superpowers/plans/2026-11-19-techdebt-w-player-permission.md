# Lote W — Traducir errores de permiso al crear y guardar jugadores (#152) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Antes de despachar:** este plan y el spec `docs/superpowers/specs/2026-11-19-tech-debt-wave5-design.md` se mergean a `develop` en un PR de docs **antes** de despachar. El implementer los lee desde su propio worktree (cortado de `origin/develop`) y marca `- [x]` ahí, en su copia del plan, al terminar cada paso.

**Goal:** Cuando PostgREST rechaza `createPlayer` o `updatePlayer` por permisos (RLS, `permission denied`, `unauthorized`, `403`), la ficha muestra `No tienes permiso para esta acción.` igual que pagos y documentos, en vez del texto en inglés; cualquier otro error se sigue mostrando tal cual (#152).

**Architecture:** `src/documents/documents.ts` exporta un predicado nuevo `isPermissionError(message: string): boolean` con la expresión que hoy vive dentro de `documentErrorMessage` (`/row-level security|permission denied|unauthorized|\b403\b/i`), y `documentErrorMessage` lo usa en su rama de permiso (mismo resultado, la expresión solo se mueve). En `src/players/players.ts` una función privada `playerErrorMessage(message: string): string` devuelve `NO_PERMISSION_MESSAGE` si `isPermissionError(message)` y si no `message`; `createPlayer` y `updatePlayer` la aplican a `error.message`. No se usa `documentErrorMessage` (traduciría prefijos de documentos y el aviso de consentimiento, que no aplican a la ficha). `fetchPlayer` no cambia. `payments.ts` no se toca.

**Tech Stack:** TypeScript 6 (`tsc -b`), Vitest 4.1.9, ESLint 10, pnpm.

**Spec:** `docs/superpowers/specs/2026-11-19-tech-debt-wave5-design.md` (§1 lote W, §2 decisión #152, §3 verificación). Reglas heredadas: `docs/superpowers/specs/2026-11-18-tech-debt-sweep-design.md` §1 y §5. Precedente: `docs/superpowers/plans/2026-11-18-techdebt-t-permission-denied.md` (lote T, #139).

## Global Constraints

- Rama `fix/player-permission-message`, cortada de `origin/develop` (con este plan ya mergeado). Worktree: `/Users/arturoortiz/Proyectos/Personales/ligaspequenas-worktrees/player-permission-message` (lo crea el orquestador). En este plan `$WT` es esa ruta absoluta. Primera acción: `pnpm install --frozen-lockfile` dentro de `$WT`. Los tests no necesitan `.env`.
- Git: siempre `git -C $WT …` (un hook bloquea `cd … && git …`), **un comando git por llamada al shell**. Nunca `CLAUDE_GIT_OVERRIDE`. El implementer nunca hace push, PR ni merge; nunca usa el Supabase MCP ni toca la base. Nunca toques `/Users/arturoortiz/Proyectos/Personales/ligaspequenas` (checkout principal).
- **Nunca `git stash`**: el stash es compartido entre los worktrees que corren en paralelo y ya se pisaron trabajos así. Para descartar un cambio usa `git -C $WT checkout -- <archivo>`; para apartarlo, `git -C $WT diff -- <archivo> > "$(mktemp)"` (fuera del repo) y luego `git -C $WT apply <ese archivo>`.
- **Archivos permitidos** (solo estos): `src/players/players.ts`, `src/players/players.test.ts`, `src/documents/documents.ts` y este plan. Antes del commit, `git -C $WT status -s` debe listar **solo** archivos de esta lista.
- **Paralelo:** W y X corren a la vez y no comparten archivos (verificado por el planner: W los 3 de arriba; X solo `docs/superpowers/plans/2026-10-16-pre-real-data-checklist.md` y su propio plan). W es el único lote de la ola que toca `documents.ts`; `payments.ts` no lo toca nadie. Si necesitas un archivo fuera de tu lista, **detente** y avisa al orquestador.
- Código, identificadores y comentarios en inglés; sin comentarios nuevos. Mensajes de commit en inglés, terminados en la línea `Claude-Session: https://claude.ai/code/session_01XWBoZQLb3ti7U2LQcagZvd`. `git add` incluye este plan para que las marcas `- [x]` queden en el commit.
- Conteos: delta sobre el baseline del Step 0. Referencia medida por el planner en `origin/develop` = `b722017`: **49 archivos, 584 tests**. Este lote agrega **0 archivos y +2 tests** (y cambia la expectativa de 1 existente).

## Review Focus

- **Otros errores de base pasan tal cual:** un `not-null`/CHECK de Postgres, un mensaje que empieza con `consent_required` y un id que contiene `403` (`9f403a2c`) se devuelven sin traducir al crear; al guardar, `curp_format` sigue igual (Task 1, `createPlayer returns any other database error as it is` y el test existente `updatePlayer returns the PostgREST error message`).
- **Mayúsculas:** `Permission denied for table players` también se traduce al guardar (Task 1).
- **Documentos y fotos no cambian:** `documentErrorMessage` da los mismos resultados (consentimiento con `consentGranted: false` incluido); los tests existentes de `documents.test.ts` y de fotos en `players.test.ts` siguen verdes sin tocarlos (Task 1, Step 1.3).
- **Una sola expresión de permisos en `documents.ts`:** `grep` muestra la regex una vez ahí, otra en `payments.ts` (sin cambio) y ninguna en `players.ts` (Task 1, Step 1.2).
- **Cero filas al guardar** sigue devolviendo `NO_PERMISSION_MESSAGE` (test existente `updatePlayer reports zero updated rows as a permission error`, sin cambios).

---

## Task 0: Preparar y medir el baseline

- [x] **Step 0.1:** `git -C $WT branch --show-current` → `fix/player-permission-message`.
- [x] **Step 0.2:** `git -C $WT log --oneline origin/develop..HEAD` → vacío.
- [x] **Step 0.3:** En `$WT`: `pnpm install --frozen-lockfile` y `pnpm exec vitest run`. Anota `B_files` y `B_tests` (esperado hoy: 49 y 584, todo verde).

---

## Task 1: `createPlayer` y `updatePlayer` traducen errores de permiso (#152)

**Files:**
- Modify: `src/players/players.test.ts` (expectativa de `createPlayer surfaces an RLS/DB error as ok:false`; 1 test nuevo justo después de él; 1 test nuevo justo después de `updatePlayer returns the PostgREST error message`)
- Modify: `src/documents/documents.ts` (nuevo `isPermissionError` justo antes de `documentErrorMessage`; la rama de permiso lo usa)
- Modify: `src/players/players.ts` (import; `playerErrorMessage` privada justo antes de `createPlayer`; las dos líneas `if (error) return { ok: false, error: error.message }`)

**Interfaces:**
- Consumes: `NO_PERMISSION_MESSAGE` (`'No tienes permiso para esta acción.'`), ya importado en `players.ts` desde `../documents/documents`.
- Produces: `export function isPermissionError(message: string): boolean` en `src/documents/documents.ts`. Sin cambios de firma en `createPlayer`, `updatePlayer` ni `documentErrorMessage`.

- [x] **Step 1.1: Escribir los tests (rojo)**

En `src/players/players.test.ts`:

1. En `createPlayer surfaces an RLS/DB error as ok:false`, cambia `expect(result).toEqual({ ok: false, error: 'permission denied' })` por `expect(result).toEqual({ ok: false, error: 'No tienes permiso para esta acción.' })`. El mock (`'permission denied'`) y el nombre no cambian.

2. Justo después de ese test:

```ts
test('createPlayer returns any other database error as it is', async () => {
  const values = { ...emptyPlayer(), full_name: 'X', birth_date: '2015-01-01', tutor_name: 'T', tutor_whatsapp: '0' }
  mocks.single.mockResolvedValueOnce({ data: null, error: { message: 'null value in column "full_name" of relation "players" violates not-null constraint' } })
  expect(await createPlayer(values, 'tenant-1')).toEqual({ ok: false, error: 'null value in column "full_name" of relation "players" violates not-null constraint' })
  mocks.single.mockResolvedValueOnce({ data: null, error: { message: 'consent_required: x' } })
  expect(await createPlayer(values, 'tenant-1')).toEqual({ ok: false, error: 'consent_required: x' })
  mocks.single.mockResolvedValueOnce({ data: null, error: { message: 'player 9f403a2c not found' } })
  expect(await createPlayer(values, 'tenant-1')).toEqual({ ok: false, error: 'player 9f403a2c not found' })
})
```

3. Justo después de `updatePlayer returns the PostgREST error message`:

```ts
test('updatePlayer translates a PostgREST permission error', async () => {
  const values = { ...emptyPlayer(), full_name: 'Ana', birth_date: '2015-01-01', tutor_name: 'T', tutor_whatsapp: '0' }
  mocks.updateSelect.mockResolvedValueOnce({ data: null, error: { message: 'new row violates row-level security policy for table "players"' } })
  expect(await updatePlayer('p1', values)).toEqual({ ok: false, error: 'No tienes permiso para esta acción.' })
  mocks.updateSelect.mockResolvedValueOnce({ data: null, error: { message: 'Permission denied for table players' } })
  expect(await updatePlayer('p1', values)).toEqual({ ok: false, error: 'No tienes permiso para esta acción.' })
})
```

Run: `pnpm exec vitest run src/players/players.test.ts`
Expected (verificado por el planner): FAIL en 2 — `createPlayer surfaces an RLS/DB error as ok:false` y `updatePlayer translates a PostgREST permission error`, ambos con `AssertionError: expected { ok: false, …(1) } to deeply equal { ok: false, …(1) }`; `Tests  2 failed | 30 passed (32)`. El test nuevo de `createPlayer` pasa ya en rojo: es el pin de que nada más se traduce.

- [x] **Step 1.2: Implementar**

1. En `src/documents/documents.ts`, justo antes de `documentErrorMessage`, agrega `export function isPermissionError(message: string): boolean` que devuelve `/row-level security|permission denied|unauthorized|\b403\b/i.test(message)`. En `documentErrorMessage`, la condición `if (/row-level security|permission denied|unauthorized|\b403\b/i.test(message)) {` pasa a `if (isPermissionError(message)) {`; el cuerpo de la rama (consentimiento vs `NO_PERMISSION_MESSAGE`) no cambia.
2. En `src/players/players.ts`, agrega `isPermissionError` al import de `../documents/documents` (orden alfabético: después de `documentErrorMessage`). Justo antes de `createPlayer`, agrega la función **no exportada** `playerErrorMessage(message: string): string` → `isPermissionError(message) ? NO_PERMISSION_MESSAGE : message`. En `createPlayer` y en `updatePlayer`, `if (error) return { ok: false, error: error.message }` pasa a `if (error) return { ok: false, error: playerErrorMessage(error.message) }`. Nada más cambia (la rama de cero filas, `fetchPlayer` y las fotos quedan igual).

Comprobación: `grep -rn 'permission denied|' $WT/src | grep -v '\.test\.'` → exactamente 2 líneas: `src/payments/payments.ts:135` (sin cambio) y `src/documents/documents.ts` dentro de `isPermissionError`. `grep -n "playerErrorMessage\|isPermissionError" $WT/src/players/players.ts` → 4 líneas (import, definición, uso, uso).

Run: `pnpm exec vitest run src/players src/documents src/payments` → todo PASS (planner: 14 archivos, 281 tests).

- [x] **Step 1.3: Suite completa, tipos y lint**

Run (en `$WT`): `pnpm exec vitest run` → `B_files` archivos, `B_tests + 2` tests, todo verde (planner: 49 y 586). `pnpm exec tsc -b` → exit 0. `pnpm lint` → exit 0.
`git -C $WT diff --stat` → 3 archivos (planner: `documents.ts` 5+/1-, `players.ts` 7+/3-, `players.test.ts` 19+/1-).

- [x] **Step 1.4: Commit**

`git -C $WT status -s` → solo los 3 archivos de la lista y este plan.

```bash
git -C $WT add docs/superpowers/plans/2026-11-19-techdebt-w-player-permission.md src/documents/documents.ts src/players/players.ts src/players/players.test.ts
```

```bash
git -C $WT commit -m "fix: translate permission errors when creating or saving a player (#152)" -m "Payments and documents show a permission rejection in Spanish, but the player form showed PostgREST's raw English text. The documents permission check is now an exported predicate that the player writes reuse, so the expression is not copied again; any other database error is still shown as it is." -m "Claude-Session: https://claude.ai/code/session_01XWBoZQLb3ti7U2LQcagZvd"
```

**Reporte al orquestador:** el SHA, `B_files`/`B_tests` y conteos finales, la salida del rojo 1.1, los dos `grep` de 1.2 y las tres salidas verdes de 1.3.

---

## Orquestador (después de la revisión pre-PR y del merge)

- [ ] **O1. PR** a `develop` con `Closes #152`. Sin verificación en navegador (spec §3): el camino de error no se reproduce en vivo sin quitarse permisos y el camino feliz no cambia. `PlayerFormPage.test.tsx` mockea `createPlayer` con `'permission denied'` y solo comprueba que la alerta muestra lo que devuelve la función; no cambia.

---

## Discrepancias

- **Cómo se comparte la expresión (decisión del planner, pedida por el spec §2).** Se exporta `isPermissionError` desde `documents.ts`, que ya es la fuente de `NO_PERMISSION_MESSAGE` y de la que `players.ts` ya importa: la expresión se **mueve** dentro del mismo archivo, no se copia, y `documentErrorMessage` da exactamente los mismos resultados (la suite de documentos lo cubre sin cambios). Descartado: (a) llamar a `documentErrorMessage` desde la ficha, porque también traduce `consent_required`, `consent_in_use` y prefijos de ruta, y el spec pide que todo lo que no sea permiso pase tal cual; (b) un módulo nuevo en `src/lib/`, porque obligaría a tocar también `payments.ts` sin necesidad.
- **`payments.ts` conserva su copia (decisión del planner).** Queda en dos copias, no tres, como pide el spec. Hacer que `paymentErrorMessage` use `isPermissionError` no cambiaría su comportamiento, pero es una limpieza fuera de #152 y añadiría un import `payments → documents`; si se quiere, va en otro issue.
- **`isPermissionError` sin test propio en `documents.test.ts`.** Lo ejercen los tests existentes de `documentErrorMessage` (RLS, `permission denied`, `Unauthorized`, `403` como palabra) y los dos nuevos de jugadores; un test unitario aparte repetiría esos casos.
