# Lote T — Traducir `permission denied` (Postgres 42501) en pagos y documentos (#139) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Antes de despachar:** este plan y el spec `docs/superpowers/specs/2026-11-18-tech-debt-wave4-design.md` se mergean a `develop` en un PR de docs **antes** de despachar. El implementer los lee desde su propio worktree (cortado de `origin/develop`) y marca `- [x]` ahí, en su copia del plan, al terminar cada paso.

**Goal:** Un error de Postgres 42501 (`permission denied for table …`, `permission denied for schema …`) se muestra como `No tienes permiso para esta acción.` en pagos y en documentos, igual que un rechazo de RLS o un 403, en vez de salir en inglés tal cual (#139).

**Architecture:** La misma expresión en los dos traductores: `/row-level security|permission denied|unauthorized|\b403\b/i`, en `paymentErrorMessage` (`src/payments/payments.ts`) y en la rama de permiso de `documentErrorMessage` (`src/documents/documents.ts`). En documentos, `permission denied` cae en la misma rama que RLS, así que con `consentGranted === false` sigue devolviendo el aviso de consentimiento. Un test por archivo.

**Tech Stack:** TypeScript 6 (`tsc -b`), Vitest 4.1.9, ESLint 10, pnpm.

**Spec:** `docs/superpowers/specs/2026-11-18-tech-debt-wave4-design.md` (§1 lote T, §2 decisión #139, §3 verificación). Reglas heredadas: `docs/superpowers/specs/2026-11-18-tech-debt-sweep-design.md` §1 y §5.

## Global Constraints

- Rama `fix/permission-denied-message`, cortada de `origin/develop` (con este plan ya mergeado). Worktree: `/Users/arturoortiz/Proyectos/Personales/ligaspequenas-worktrees/permission-denied-message` (lo crea el orquestador). En este plan `$WT` es esa ruta absoluta. Primera acción: `pnpm install --frozen-lockfile` dentro de `$WT`. Los tests no necesitan `.env`.
- Git: siempre `git -C $WT …` (un hook bloquea `cd … && git …`), **un comando git por llamada al shell**. Nunca `CLAUDE_GIT_OVERRIDE`. El implementer nunca hace push, PR ni merge; nunca usa el Supabase MCP ni toca la base. Nunca toques `/Users/arturoortiz/Proyectos/Personales/ligaspequenas` (checkout principal).
- **Nunca `git stash`**: el stash es compartido entre los worktrees que corren en paralelo y ya se pisaron trabajos así. Para descartar un cambio usa `git -C $WT checkout -- <archivo>`; para apartarlo, `git -C $WT diff -- <archivo> > "$(mktemp)"` (fuera del repo) y luego `git -C $WT apply <ese archivo>`.
- **Archivos permitidos** (solo estos): `src/payments/payments.ts`, `src/payments/payments.test.ts`, `src/documents/documents.ts`, `src/documents/documents.test.ts` y este plan. Antes del commit, `git -C $WT status -s` debe listar **solo** archivos de esta lista.
- **Paralelo:** Q, S, T, U y V corren a la vez y no comparten archivos (verificado por el planner: Q `src/players/{players,PlayerFormPage}*` — solo **importa** `NO_PERMISSION_MESSAGE` de `documents.ts`, no lo edita; S `ops/backup/*`; T los 4 de arriba; U `supabase/functions/invite-user/*`; V dos `.md` de 2026-10-16). R va después de Q y no toca estos archivos. Si necesitas un archivo fuera de tu lista, **detente** y avisa al orquestador.
- Código, identificadores y comentarios en inglés; sin comentarios nuevos. Mensajes de commit en inglés, terminados en la línea `Claude-Session: https://claude.ai/code/session_01XWBoZQLb3ti7U2LQcagZvd`. `git add` incluye este plan para que las marcas `- [x]` queden en el commit.
- Conteos: delta sobre el baseline del Step 0. Referencia medida por el planner en `origin/develop` = `5effa8f`: **48 archivos, 566 tests**. Este lote agrega **0 archivos y +2 tests**.

## Review Focus

- **Mayúsculas:** `Permission denied for schema private` también se traduce (la regex ya es `/i`) (Task 1).
- **Documentos sin consentimiento:** un 42501 con `consentGranted: false` muestra el aviso de consentimiento, como un rechazo de RLS (Task 1; ver Discrepancias).
- **Misma expresión en los dos archivos:** `grep` de la regex devuelve la misma línea en ambos (Task 1, Step 1.2).
- **Nada más se traduce de más:** los tests existentes (`network down`, `14030`, `9f403a2c`) siguen devolviendo el texto original.
- **Los caminos que usan `documentErrorMessage`** (fotos del jugador en `players.ts`, documentos) heredan la traducción sin cambios propios; la suite completa sigue verde.

---

## Task 0: Preparar y medir el baseline

- [ ] **Step 0.1:** `git -C $WT branch --show-current` → `fix/permission-denied-message`.
- [ ] **Step 0.2:** `git -C $WT log --oneline origin/develop..HEAD` → vacío.
- [ ] **Step 0.3:** En `$WT`: `pnpm install --frozen-lockfile` y `pnpm exec vitest run`. Anota `B_files` y `B_tests` (esperado hoy: 48 y 566, todo verde).

---

## Task 1: `permission denied` se traduce en pagos y documentos (#139)

**Files:**
- Modify: `src/payments/payments.test.ts` (1 test nuevo justo después de `paymentErrorMessage reads 403 only as a whole word`)
- Modify: `src/documents/documents.test.ts` (1 test nuevo justo después de `documentErrorMessage does not read 403 inside a longer number or id`)
- Modify: `src/payments/payments.ts` (regex de `paymentErrorMessage`)
- Modify: `src/documents/documents.ts` (regex de la rama de permiso de `documentErrorMessage`)

**Interfaces:**
- Produces: sin cambios de firma: `paymentErrorMessage(message: string): string`, `documentErrorMessage(message: string, opts?: { consentGranted?: boolean }): string`.

- [ ] **Step 1.1: Escribir los tests (rojo)**

En `src/payments/payments.test.ts`, después del test `paymentErrorMessage reads 403 only as a whole word`:

```ts
test('paymentErrorMessage translates a Postgres 42501 permission denied', () => {
  expect(paymentErrorMessage('permission denied for table payments')).toBe('No tienes permiso para esta acción.')
  expect(paymentErrorMessage('Permission denied for schema private')).toBe('No tienes permiso para esta acción.')
})
```

En `src/documents/documents.test.ts`, después del test `documentErrorMessage does not read 403 inside a longer number or id`:

```ts
test('documentErrorMessage translates a Postgres 42501 permission denied like an RLS rejection', () => {
  expect(documentErrorMessage('permission denied for table player_documents')).toBe('No tienes permiso para esta acción.')
  expect(documentErrorMessage('Permission denied for schema private')).toBe('No tienes permiso para esta acción.')
  expect(documentErrorMessage('permission denied for table players', { consentGranted: false })).toBe(CONSENT_REQUIRED_MESSAGE)
})
```

(`CONSENT_REQUIRED_MESSAGE` ya está importado en `documents.test.ts`.)

Run: `pnpm exec vitest run src/payments/payments.test.ts src/documents/documents.test.ts`
Expected (verificado por el planner): FAIL en los 2 tests nuevos — `expected 'permission denied for table payments' to be 'No tienes permiso para esta acción.'` y `expected 'permission denied for table player_do…' to be 'No tienes permiso para esta acción.'`; 65 pasan.

- [ ] **Step 1.2: Implementar**

En los dos archivos, cambia la regex `/row-level security|unauthorized|\b403\b/i` por `/row-level security|permission denied|unauthorized|\b403\b/i`. Nada más cambia: en `payments.ts` la línea sigue devolviendo `'No tienes permiso para esta acción.'`; en `documents.ts` la rama sigue eligiendo entre `CONSENT_REQUIRED_MESSAGE` y `NO_PERMISSION_MESSAGE`.

Comprobación: `grep -n "permission denied" $WT/src/payments/payments.ts $WT/src/documents/documents.ts` → una línea en cada archivo, las dos con `/row-level security|permission denied|unauthorized|\b403\b/i`.

Run: `pnpm exec vitest run src/payments src/documents src/players` → todo PASS.

- [ ] **Step 1.3: Suite completa, tipos y lint**

Run (en `$WT`): `pnpm exec vitest run` → `B_files` archivos, `B_tests + 2` tests, todo verde (planner: 48 y 568). `pnpm exec tsc -b` → exit 0. `pnpm lint` → exit 0.

- [ ] **Step 1.4: Commit**

`git -C $WT status -s` → solo los 4 archivos de la lista y este plan.

```bash
git -C $WT add docs/superpowers/plans/2026-11-18-techdebt-t-permission-denied.md src/payments/payments.ts src/payments/payments.test.ts src/documents/documents.ts src/documents/documents.test.ts
```

```bash
git -C $WT commit -m "fix: translate a Postgres permission denied error in payments and documents (#139)" -m "Both translators read RLS rejections and 403s as a permission error, but a 42501 permission denied for a table or schema reached the screen in English. Both now use the same expression with permission denied added." -m "Claude-Session: https://claude.ai/code/session_01XWBoZQLb3ti7U2LQcagZvd"
```

**Reporte al orquestador:** el SHA, `B_files`/`B_tests` y conteos finales, la salida del rojo 1.1, el `grep` de 1.2 y las tres salidas verdes de 1.3.

---

## Orquestador (después de la revisión pre-PR y del merge)

- [ ] **O1. PR** a `develop` con `Closes #139`. Sin verificación en navegador ni en vivo: un 42501 solo aparece con grants mal configurados (el issue lo dice), y provocarlo exigiría quitar grants en la base remota. Lo cubren los tests.

---

## Discrepancias

- **42501 con `consentGranted: false` (decisión del planner).** En documentos la regex vive en la rama que, sin consentimiento, devuelve el aviso de consentimiento. El spec pide "la misma expresión en los dos", así que `permission denied` hereda esa rama. Un 42501 real es un problema de grants, no de consentimiento, pero el caso solo ocurre en fotos/documentos digitales de un jugador sin consentimiento, donde el aviso de consentimiento es igual de cierto y más útil. Separarlo exigiría una segunda expresión, contra el spec.
- **Sin traducir otros textos de 42501.** Se busca `permission denied` (lo que PostgREST reenvía de Postgres: `permission denied for table|schema|function …`), no el código `42501`: los mensajes que reciben estas funciones son `error.message`, sin el código.
