# Lote B — Nits de docs del checklist previo a datos reales (#90, #93) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Antes de despachar:** este plan y su spec se mergean a `develop` en un PR de docs **antes** de despachar al implementer. El implementer los lee desde su propio worktree (cortado de `origin/develop`) y marca `- [x]` ahí, en su copia del plan, al terminar cada paso.

**Goal:** Corregir dos documentos que quedaron imprecisos tras #6: la nota de mecánica MCP del plan del 2026-10-16 (#90), marcar como obsoletas en ese mismo plan las recetas R-0002/R-0012/R-0013 que reemplaza el lote A, y, en el checklist previo a datos reales, la redacción de E4 y las fechas de los resultados de pgTAP y del E2E (#93).

**Architecture:** Solo documentación, tres ediciones de texto en dos archivos. Sin código, sin base de datos, sin cambios de comportamiento. Cada edición se "prueba" con un `grep` que encuentra el texto viejo antes (rojo) y el nuevo después (verde).

**Tech Stack:** Markdown; `grep`; Vitest / TypeScript (`tsc -b`) / ESLint / pnpm (sin cambios, deben seguir en verde).

**Spec:** `docs/superpowers/specs/2026-11-18-tech-debt-sweep-design.md` (§4, lote B). Detalle de cada issue: `gh issue view 90 --repo aiyangar/ligaspequenas`, `gh issue view 93 --repo aiyangar/ligaspequenas`.

## Global Constraints

- **Una rama:** `update/ops-docs-nits`, cortada de `origin/develop` (con este plan ya mergeado). Worktree creado por el orquestador antes de despachar: `/Users/arturoortiz/Proyectos/Personales/ligaspequenas-worktrees/ops-docs-nits`. En este plan `$WT` es esa ruta absoluta (escríbela literal o empieza cada llamada con `WT=/Users/arturoortiz/Proyectos/Personales/ligaspequenas-worktrees/ops-docs-nits;`). La primera acción del implementer es `pnpm install --frozen-lockfile` dentro de él.
- Git: siempre `git -C $WT …`, **un comando git por llamada al shell**. Nunca `CLAUDE_GIT_OVERRIDE`, nunca `git stash`. El implementer nunca hace push, PR ni merge: termina en commit + reporte. Nunca toques `/Users/arturoortiz/Proyectos/Personales/ligaspequenas` (checkout principal).
- Archivos: solo `docs/superpowers/plans/2026-10-16-pre-real-data-checklist.md` y `docs/security/pre-real-data-checklist.md` (más este plan, por sus `- [x]`). Ningún otro lote de la ola 1 los toca (spec §4).
- Los documentos están en el idioma en que ya están: el plan del 2026-10-16 en inglés, el checklist en español. Mensaje de commit en inglés terminado en `Claude-Session: https://claude.ai/code/session_01XWBoZQLb3ti7U2LQcagZvd`.
- La rama cierra con `pnpm exec vitest run`, `pnpm exec tsc -b` y `pnpm lint` en verde, con los mismos conteos que el baseline del Step 0 (`B_files`, `B_tests`).
- PR body: `Closes #90` y `Closes #93`, una línea cada uno.

## Review Focus

- **Las fechas dicen de dónde salen:** las de pgTAP van marcadas "según #93" y la del E2E como inferida; cada una sale de evidencia citada en la sección "Evidencia de las fechas" de abajo (PRs #89 y #92, commit `25377a2`, orden de fases del plan del 2026-10-16). El revisor la contrasta con `gh pr view 89/92` y `git log`.
- **Solo cambia lo que piden los issues:** ninguna otra fila del checklist ni del plan cambia de contenido.

## Evidencia de las fechas (#93.2)

Verificada al escribir este plan (2026-11-18):

Las fechas de pgTAP se escriben como **"según #93"**: las da el issue y el PR #89 respalda la de 0016, pero no hay un log de la corrida de regresión con fecha propia. La del E2E es una inferencia (ventana entre dos timestamps) y también se marca así.

- **0016 en verde, 2026-10-16:** el cuerpo del PR #89 dice "0016 was applied to remote `eksbaugyypadtanyjcje` on 2026-10-16" y "O6 green run: 22/22 ok" (`gh pr view 89 --repo aiyangar/ligaspequenas --json body`). El issue #93 da la misma fecha.
- **Regresión R-0002…R-0015 tras 0016, 2026-10-18 local / 2026-10-19 UTC:** lo afirma el issue #93 y coincide con la fecha de la corrida registrada en el checklist (fila "2026-10-18 (2026-10-19 UTC)").
- **E2E E1–E5, 2026-10-18 local / 2026-10-19 UTC:** el plan del 2026-10-16 corre la fase E "after branch 1 is merged" (l.776) y antes de despachar la rama 2 (l.18–19). El PR #89 (rama 1) se mergeó el `2026-10-19T02:53:01Z` y el commit del checklist `25377a2` (rama 2) es del `2026-10-18 21:41:36 -0600` = `2026-10-19T03:41Z`. La fase E cae entre los dos: 2026-10-18 en Monterrey, 2026-10-19 en UTC.

---

## Task 1 — rama `update/ops-docs-nits`

**Files:**
- Modify: `docs/superpowers/plans/2026-10-16-pre-real-data-checklist.md` (línea 22, #90; nota de obsolescencia bajo l.421, consecuencia del lote A)
- Modify: `docs/security/pre-real-data-checklist.md` (línea 192 y tabla de las líneas 198–208, #93)

**Interfaces:** ninguna (documentación).

- [x] **Step 0: Preparar y medir el baseline**

`git -C $WT branch --show-current` → `update/ops-docs-nits`; `git -C $WT log --oneline origin/develop..HEAD` → vacío. En `$WT`: `pnpm install --frozen-lockfile` y `pnpm exec vitest run`; anota `B_files` y `B_tests` (todo verde).

- [x] **Step 1: Rojo — el texto viejo está y el nuevo no**

En `$WT`:

```bash
grep -c 'plus `throws_ok`/`lives_ok` inside 0002) — no structural pgTAP' docs/superpowers/plans/2026-10-16-pre-real-data-checklist.md
grep -c 'sin selects de Estatus ni inputs de upload' docs/security/pre-real-data-checklist.md
grep -c '^| Escenario E2E | Resultado |$' docs/security/pre-real-data-checklist.md
grep -c 'has_view`/`has_column` of 0014' docs/superpowers/plans/2026-10-16-pre-real-data-checklist.md
grep -c 'fase O6 de #89' docs/security/pre-real-data-checklist.md
```

Expected: `1`, `1`, `1`, `0`, `0`. Confirma además que las líneas siguen donde las cita este plan: `sed -n 22p` del plan muestra la viñeta "**MCP mechanics**"; `sed -n 192p` del checklist empieza con `- **E (pgTAP):**`; `sed -n 207p` empieza con `| E4 |`. (Los issues citan 190 y 205: el archivo creció 2 líneas desde que se abrieron; ver Discrepancias.)

- [x] **Step 2: #90 — nota de mecánica MCP**

En `docs/superpowers/plans/2026-10-16-pre-real-data-checklist.md` línea 22, reemplaza exactamente este texto:

```text
Only `extensions.is()` (plus `throws_ok`/`lives_ok` inside 0002) — no structural pgTAP.
```

por este:

```text
Only `extensions.is()` (plus `throws_ok`/`lives_ok` in 0002/0014/0015 and the `has_view`/`has_column` of 0014) — no other structural pgTAP.
```

El resto de la línea no cambia. (Verificado: `throws_ok` está en `supabase/tests/0014_player_payment_status_view.test.sql` l.64 y `0015_players_view_status_columns.test.sql` l.85; `has_view`/`has_column` en 0014 l.32–35; R-0014 los usa en este mismo plan l.620–623.)

- [x] **Step 3: #93.1 — E4**

En `docs/security/pre-real-data-checklist.md`, la fila E4 (línea 207) queda:

```markdown
| E4 | 2026-10-18 (2026-10-19 UTC) | verde (readonly) — sin selects de Estatus en documentos (solo los del formulario del jugador, deshabilitados) ni inputs de upload ni alerta; "Ver" → URL firmada; upload 400 RLS; PATCH 200 `[]`; SQL sin cambios |
```

(La columna de fecha la agrega el Step 4; esta es la fila final.)

- [x] **Step 4: #93.2 — fecha por resultado**

1. La viñeta de la línea 192 queda:

```markdown
- **E (pgTAP):** 0016 22/22 `ok` en su corrida verde del 2026-10-16 según #93 (fase O6 de #89). Regresión tras 0016, corrida el 2026-10-18 (2026-10-19 UTC) según #93: R-0012 25/25 `ok`, R-0013 21/21 `ok`, R-0002 6/6, R-0014 17/17, R-0015 21/21. La corrida roja de R-0015 antes de 0016 no se obtuvo (la sesión del MCP de Supabase expiraba: "Invalid or expired requestState" repetido).
```

2. La tabla del E2E (líneas 198–208) gana una columna `Fecha` (la fecha es inferida de la ventana entre el merge de #89 y el commit del checklist; por eso, justo debajo de la tabla, agrega la línea `Fecha del E2E inferida: la fase E corrió entre el merge de #89 (2026-10-19T02:53Z) y el commit del checklist 25377a2 (2026-10-19T03:41Z); no hay registro con hora por escenario.`) (spec del 2026-10-16 §3.1-E: "cada escenario con fecha y resultado"). Queda exactamente así:

```markdown
| Escenario E2E | Fecha | Resultado |
|---|---|---|
| E1 | 2026-10-18 (2026-10-19 UTC) | verde — alerta visible; "Subir archivo" deshabilitado en CURP/Acta/Comprobante/Constancia y habilitado en ambos consentimientos; "Subir foto" deshabilitado con leyenda |
| E1-API | 2026-10-18 (2026-10-19 UTC) | verde — upload 400 (RLS 403); PATCH 400 `P0001 consent_required`; SQL: 0 objetos, CURP `pendiente` |
| E2 | 2026-10-18 (2026-10-19 UTC) | verde — consentimientos → Físico; alerta desaparece; uploads y "Subir foto" habilitados |
| E2b | 2026-10-18 (2026-10-19 UTC) | verde — CURP Digital; "Ver" abre `/storage/v1/object/sign/player-files/…?token=`; la foto se muestra |
| E3 | 2026-10-18 (2026-10-19 UTC) | verde — Aviso → opción Pendiente deshabilitada con "Quita primero la foto y los documentos digitales."; PATCH directo 400 `P0001 consent_in_use` |
| E3b | 2026-10-18 (2026-10-19 UTC) | verde — CURP → Físico, quitar foto, Aviso → Pendiente aceptado; alerta de vuelta; uploads no-consentimiento deshabilitados; upload por API 400 RLS |
| E3c | 2026-10-18 (2026-10-19 UTC) | verde — Aviso → Físico; CURP resubida, chip Digital |
| E4 | 2026-10-18 (2026-10-19 UTC) | verde (readonly) — sin selects de Estatus en documentos (solo los del formulario del jugador, deshabilitados) ni inputs de upload ni alerta; "Ver" → URL firmada; upload 400 RLS; PATCH 200 `[]`; SQL sin cambios |
| E5 | 2026-10-18 (2026-10-19 UTC) | verde (sin sesión) — REST `/players` → 401 `42501`; URL pública de storage → 400 |
```

Los textos de resultado de E1–E3c y E5 son los actuales, sin cambios. Aparte de la línea "Fecha del E2E inferida…" agregada justo debajo, lo que sigue a la tabla no cambia.

- [x] **Step 4b: R-0002/R-0012/R-0013 obsoletas en el plan del 2026-10-16 (consecuencia del lote A)**

En `docs/superpowers/plans/2026-10-16-pre-real-data-checklist.md`, justo debajo del encabezado `### Regression calls (orchestrator) — R-0002, R-0012, R-0013, R-0014, R-0015` (l.421), agrega una línea en blanco y este párrafo (el plan está en inglés):

```markdown
> **Obsolete since 0019 (lote A, `docs/superpowers/plans/2026-11-18-techdebt-a-db-tests.md`) for R-0002, R-0012 and R-0013:** the canonical files `supabase/tests/0002_rls.test.sql`, `0012_player_files_storage.test.sql` and `0013_document_consent_rules.test.sql` now carry their own fixtures and cleanup; run them as-is with that plan's `tap` harness (6, 28 and 22 rows). The recipes below for those three are kept only as history. R-0014 and R-0015 are still current.
```

Si el lote A todavía no está mergeado cuando corras esto, el párrafo igual va (describe el estado que deja el lote A, que es de la misma ola); el orquestador mergea B después de A. Nada más de esa sección cambia.

- [x] **Step 5: Verde — el texto nuevo está y el viejo no**

Repite los cinco `grep -c` del Step 1. Expected: `0`, `0`, `0`, `1`, `1`. Además:

- `grep -c 'Obsolete since 0019' docs/superpowers/plans/2026-10-16-pre-real-data-checklist.md` → `1`.
- `grep -c 'según #93' docs/security/pre-real-data-checklist.md` → `2`; `grep -c 'Fecha del E2E inferida' docs/security/pre-real-data-checklist.md` → `1`.

- `grep -c '^| Escenario E2E | Fecha | Resultado |$' docs/security/pre-real-data-checklist.md` → `1`.
- `grep -c '^| E[0-9][a-z-]*[A-Z]* | 2026-10-18 (2026-10-19 UTC) | verde' docs/security/pre-real-data-checklist.md` → `9`.
- `git -C $WT diff --stat` → solo los dos archivos de docs (y este plan).
- `pnpm exec vitest run` → `B_files` / `B_tests`; `pnpm exec tsc -b` → exit 0; `pnpm lint` → exit 0.

- [x] **Step 6: Commit**

```bash
git -C $WT add docs/superpowers/plans/2026-11-18-techdebt-b-ops-docs.md docs/superpowers/plans/2026-10-16-pre-real-data-checklist.md docs/security/pre-real-data-checklist.md
git -C $WT commit -m "docs: correct the pgTAP mechanics note and date the checklist results (#90 #93)" -m "The 10-16 plan's MCP note now lists every non-is() assertion the regression files use, and marks the R-0002/R-0012/R-0013 recipes obsolete now that the canonical files are self-contained. The checklist's E4 row says which Estatus selects readonly still sees, and the pgTAP and E2E results carry their own dates." -m "Claude-Session: https://claude.ai/code/session_01XWBoZQLb3ti7U2LQcagZvd"
```

(Un comando por llamada.)

**Reporte del implementer:** SHA del commit, `B_files`/`B_tests`, salidas de los Steps 1 y 5.

### Orquestador

- [ ] **Step O1: Revisión pre-PR** de la rama (docs: exactitud de las fechas contra la sección "Evidencia de las fechas").
- [ ] **Step O2: PR** a `develop` con `Closes #90` y `Closes #93`; merge **después** del PR del lote A (la nota del Step 4b apunta a sus archivos canónicos).

---

## Discrepancias

- **Números de línea de #93.** El issue cita `pre-real-data-checklist.md:190` (E, pgTAP) y `:205` (E4); hoy son la 192 y la 207. El commit `716b04c` (#87, runbook de respaldos) agregó dos líneas arriba (`Runbook: docs/ops/backups.md.` y una en blanco en la sección F). El contenido citado por el issue es el mismo.
- **#93.2 ofrecía dos opciones** (fecha por resultado o columna de fecha en la tabla E2E). Se aplican las dos: fecha dentro de la viñeta de pgTAP, que tiene dos corridas con fechas distintas, y columna `Fecha` en la tabla E2E, que es lo que pide el spec del 2026-10-16 §3.1-E.
- **Sobre la fecha del E2E:** no hay un registro con hora por escenario; la fecha sale de la ventana entre el merge de #89 y el commit del checklist (ver Evidencia). Si el owner recuerda otra fecha para algún escenario, se corrige en la revisión.
