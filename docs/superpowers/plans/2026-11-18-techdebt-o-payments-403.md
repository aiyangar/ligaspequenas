# Lote O — Pagos: `403` solo como palabra completa (#124) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Antes de despachar:** este plan y el spec `docs/superpowers/specs/2026-11-18-tech-debt-wave3-design.md` se mergean a `develop` en un PR de docs **antes** de despachar. El implementer los lee desde su propio worktree (cortado de `origin/develop`) y marca `- [x]` ahí, en su copia del plan, al terminar cada paso.

**Goal:** `paymentErrorMessage` deja de leer como error de permiso cualquier mensaje que contenga `403` dentro de otro número o de un id (`14030`, `9f403a2c`); solo `403` como palabra completa, igual que `documentErrorMessage` desde #54 (#124).

**Architecture:** Un cambio de una expresión regular en `src/payments/payments.ts:135`: `/row-level security|unauthorized|403/i` → `/row-level security|unauthorized|\b403\b/i`. Un test unitario nuevo cubre los positivos (`status 403`, `403 Forbidden`, `Unauthorized`) y los falsos positivos.

**Tech Stack:** Vitest 4.1.9, TypeScript 6 (`tsc -b`), ESLint 10, pnpm.

**Spec:** `docs/superpowers/specs/2026-11-18-tech-debt-wave3-design.md` (§1 lote O, §2 decisión #124). Reglas heredadas: `docs/superpowers/specs/2026-11-18-tech-debt-sweep-design.md` §1 y §5. Referencia: `src/documents/documents.ts:89` y sus tests `documentErrorMessage treats Unauthorized and a 403 status as a permission error` / `documentErrorMessage does not read 403 inside a longer number or id`.

## Global Constraints

- Rama `fix/payments-403-match`, cortada de `origin/develop` (con este plan ya mergeado). Worktree: `/Users/arturoortiz/Proyectos/Personales/ligaspequenas-worktrees/payments-403-match` (lo crea el orquestador). En este plan `$WT` es esa ruta absoluta. Primera acción: `pnpm install --frozen-lockfile` dentro de `$WT`. Los tests no necesitan `.env`.
- Git: siempre `git -C $WT …`, **un comando git por llamada al shell**. Nunca `CLAUDE_GIT_OVERRIDE`. El implementer nunca hace push, PR ni merge; nunca usa el Supabase MCP ni toca la base. Nunca toques `/Users/arturoortiz/Proyectos/Personales/ligaspequenas` (checkout principal).
- **Nunca `git stash`**: el stash es compartido entre los worktrees que corren en paralelo y ya se pisaron trabajos así. Para descartar un cambio usa `git -C $WT checkout -- <archivo>`; para apartarlo, `git -C $WT diff -- <archivo> > "$(mktemp)"` (fuera del repo) y luego `git apply`.
- **Archivos permitidos** (solo estos): `src/payments/payments.ts`, `src/payments/payments.test.ts` y este plan. Antes del commit, `git -C $WT status -s` debe listar **solo** esos.
- **Paralelo:** L, M, N, O y P corren a la vez en worktrees distintos y no comparten archivos (verificado por el planner: L toca `supabase/functions/invite-user/*` y `src/users/*`; M `src/teams/*`; N `src/players/*` y `src/documents/documents.ts`; O `src/payments/*`; P `ops/backup/*`). Si necesitas un archivo fuera de tu lista, **detente** y avisa al orquestador.
- Código, identificadores y comentarios en inglés; sin comentarios nuevos. Mensajes de commit en inglés, terminados en la línea `Claude-Session: https://claude.ai/code/session_01XWBoZQLb3ti7U2LQcagZvd`. `git add` incluye este plan para que las marcas `- [x]` queden en el commit.
- Conteos: delta sobre el baseline del Step 0 (`B_files`, `B_tests`). Referencia medida por el planner en `origin/develop` = `9669e97`: **48 archivos, 538 tests**. Este lote agrega **0 archivos y +1 test**.

## Review Focus

- **Un id o monto con `403` dentro** (`14030`, `9f403a2c`) ya no se muestra como "No tienes permiso…": se muestra el mensaje original (Task 1).
- **Los permisos reales siguen traduciéndose:** `row-level security`, `Unauthorized` (cualquier mayúscula) y `403` suelto (`status 403`, `403 Forbidden`) (Task 1 y el test existente `paymentErrorMessage translates RLS rejections only`).
- **Mismo criterio que documentos:** la expresión queda idéntica a la de `documentErrorMessage` (`grep` en Step 1.2).
- **Sin cambios de UI:** el texto traducido sigue siendo `No tienes permiso para esta acción.`.
- **Ningún otro llamador cambia:** `createPayment`, `updatePayment` y `deletePayment` siguen usando `paymentErrorMessage` igual.

---

## Task 0: Preparar y medir el baseline

- [x] **Step 0.1:** `git -C $WT branch --show-current` → `fix/payments-403-match`.
- [x] **Step 0.2:** `git -C $WT log --oneline origin/develop..HEAD` → vacío.
- [x] **Step 0.3:** En `$WT`: `pnpm install --frozen-lockfile` y `pnpm exec vitest run`. Anota `B_files` y `B_tests` (esperado hoy: 48 y 538, todo verde).

---

## Task 1: `\b403\b` en `paymentErrorMessage`

**Files:**
- Modify: `src/payments/payments.test.ts` (test nuevo después de `paymentErrorMessage translates RLS rejections only`, l.134–137)
- Modify: `src/payments/payments.ts:135`

- [x] **Step 1.1: Escribir el test (rojo)**

En `src/payments/payments.test.ts`, justo después del test `paymentErrorMessage translates RLS rejections only`:

```ts
test('paymentErrorMessage reads 403 only as a whole word', () => {
  expect(paymentErrorMessage('Request failed with status 403')).toBe('No tienes permiso para esta acción.')
  expect(paymentErrorMessage('403 Forbidden')).toBe('No tienes permiso para esta acción.')
  expect(paymentErrorMessage('Unauthorized')).toBe('No tienes permiso para esta acción.')
  expect(paymentErrorMessage('amount 14030 is out of range')).toBe('amount 14030 is out of range')
  expect(paymentErrorMessage('payment 9f403a2c not found')).toBe('payment 9f403a2c not found')
})
```

Run: `pnpm exec vitest run src/payments/payments.test.ts`
Expected: FAIL solo en `paymentErrorMessage reads 403 only as a whole word` con `expected 'No tienes permiso para esta acción.' to be 'amount 14030 is out of range'` (verificado por el planner); 35 pasan.

- [x] **Step 1.2: Implementar**

En `src/payments/payments.ts`, dentro de `paymentErrorMessage`, cambia `/row-level security|unauthorized|403/i` por `/row-level security|unauthorized|\b403\b/i`. Nada más.

Comprobación: `grep -n 'row-level security|unauthorized|\\b403\\b' src/payments/payments.ts src/documents/documents.ts` → una línea en cada archivo.

Run: `pnpm exec vitest run src/payments/payments.test.ts` → 36 tests PASS.

- [x] **Step 1.3: Suite completa, tipos y lint**

Run (en `$WT`): `pnpm exec vitest run` → `B_files` archivos, `B_tests + 1` tests, todo verde. `pnpm exec tsc -b` → exit 0. `pnpm lint` → exit 0.

- [x] **Step 1.4: Commit**

`git -C $WT status -s` → solo `payments.ts`, `payments.test.ts` y este plan.

```bash
git -C $WT add docs/superpowers/plans/2026-11-18-techdebt-o-payments-403.md src/payments/payments.ts src/payments/payments.test.ts
```

```bash
git -C $WT commit -m "fix: match 403 as a whole word when translating payment errors (#124)" -m "Any message carrying 403 inside an id or an amount was reported as a permission error. Same whole-word match documents adopted in #54." -m "Claude-Session: https://claude.ai/code/session_01XWBoZQLb3ti7U2LQcagZvd"
```

**Reporte al orquestador:** el SHA, `B_files`/`B_tests` y conteos finales, la salida del rojo 1.1, la del `grep` de 1.2 y las tres salidas verdes del Step 1.3.

---

## Orquestador (después de la revisión pre-PR y del merge)

- PR a `develop` con `Closes #124`.
- Sin verificación en navegador: no cambia ninguna pantalla ni texto, y forzar un error de pagos en vivo exigiría escribir en la base.

---

## Discrepancias

- Ninguna. El issue y el spec piden lo mismo; el test copia los casos de `documents.test.ts` y agrega `Unauthorized` para fijar que esa rama de la expresión no se perdió.
