# Lote V — Notas "superseded by 0019" en el checklist pre-datos-reales (#149) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Antes de despachar:** este plan y el spec `docs/superpowers/specs/2026-11-18-tech-debt-wave4-design.md` se mergean a `develop` en un PR de docs **antes** de despachar. El implementer los lee desde su propio worktree (cortado de `origin/develop`) y marca `- [x]` ahí, en su copia del plan, al terminar cada paso.

**Goal:** Los documentos del checklist pre-datos-reales (2026-10-16) dejan de afirmar, sin aviso, cosas que la migración 0019 (#48, PR #148) volvió falsas: en el spec, cada mención del grant explícito de `private.player_consent_granted` a `authenticated` y de B3 = `true` lleva una nota corta "Superseded by 0019 (#48, PR #148)" (#149); y en el plan, el párrafo que dice en presente que los archivos canónicos de pgTAP "no se pueden pegar tal cual" pasa a pasado (añadido del orquestador). El texto histórico se conserva.

**Architecture:** Solo docs. En el spec `docs/superpowers/specs/2026-10-16-pre-real-data-checklist-design.md`, cuatro notas en cursiva **añadidas** dentro de la misma celda de tabla (l.26, l.156, l.282, l.390 hoy), sin borrar ni cambiar una palabra del texto original. En el plan `docs/superpowers/plans/2026-10-16-pre-real-data-checklist.md`, el párrafo que sigue a la nota `> **Obsolete since 0019 (lote A, …)**` (sección "Regression calls (orchestrator)") se reescribe en pasado con el mínimo de palabras. RED/GREEN con `grep -c`.

**Tech Stack:** Markdown; `grep`, `git diff --word-diff`.

**Spec:** `docs/superpowers/specs/2026-11-18-tech-debt-wave4-design.md` (§1 lote V, §2 decisión #149). Contexto: `supabase/migrations/0019_harden_player_file_helpers.sql` (`revoke execute on function private.player_consent_granted(uuid) from authenticated;`) y `supabase/tests/0016_revoke_anon_privileges.test.sql` (B3 de `player_consent_granted` = `false`).

## Global Constraints

- Rama `update/checklist-spec-0019-note`, cortada de `origin/develop` (con este plan ya mergeado; incluye el PR #151, que agregó la nota `Obsolete since 0019` en el plan de 2026-10-16). Worktree: `/Users/arturoortiz/Proyectos/Personales/ligaspequenas-worktrees/checklist-spec-0019-note` (lo crea el orquestador). En este plan `$WT` es esa ruta absoluta. No hace falta `pnpm install`.
- Git: siempre `git -C $WT …` (un hook bloquea `cd … && git …`), **un comando git por llamada al shell**. Nunca `CLAUDE_GIT_OVERRIDE`. El implementer nunca hace push, PR ni merge. Nunca toques `/Users/arturoortiz/Proyectos/Personales/ligaspequenas` (checkout principal).
- **Nunca `git stash`**: el stash es compartido entre los worktrees que corren en paralelo y ya se pisaron trabajos así. Para descartar un cambio usa `git -C $WT checkout -- <archivo>`; para apartarlo, `git -C $WT diff -- <archivo> > "$(mktemp)"` (fuera del repo) y luego `git -C $WT apply <ese archivo>`.
- **Archivos permitidos** (solo estos): `docs/superpowers/specs/2026-10-16-pre-real-data-checklist-design.md`, `docs/superpowers/plans/2026-10-16-pre-real-data-checklist.md` y este plan. Antes del commit, `git -C $WT status -s` debe listar **solo** esos.
- **Paralelo:** Q, S, T, U y V corren a la vez y no comparten archivos (verificado por el planner: Q `src/players/*`; S `ops/backup/*`; T `src/payments/*` y `src/documents/*`; U `supabase/functions/invite-user/*`; V solo los dos `.md` de arriba). R va después de Q y no toca estos archivos. Si necesitas un archivo fuera de tu lista, **detente** y avisa al orquestador.
- Las notas del spec quedan en el idioma del documento (español) con la etiqueta fija en inglés `Superseded by 0019 (#48, PR #148)`, como pide el spec §2. El plan de 2026-10-16 está en inglés y se edita en inglés. Mensaje de commit en inglés, terminado en la línea `Claude-Session: https://claude.ai/code/session_01XWBoZQLb3ti7U2LQcagZvd`. `git add` incluye este plan.
- Sin cambios de código: la suite no se mueve (referencia del planner en `origin/develop` = `5effa8f`: 48 archivos, 566 tests); no hace falta correrla.

## Review Focus

- **El texto histórico no se toca en el spec:** `git diff --word-diff=porcelain` del spec no tiene ninguna palabra borrada (Step 1.3).
- **Las cuatro menciones llevan nota** y solo esas: `grep -c` = 4 (Step 1.3). Ninguna otra línea del spec menciona el grant de `player_consent_granted` ni B3 = `true` (comprobado por el planner con `grep -n "player_consent_granted\|B3\|0019"`).
- **Las notas dicen lo que hizo 0019** y nada más: revoca EXECUTE de `authenticated` sobre `player_consent_granted`; B3 de ese helper espera `false`; los otros tres helpers conservan el grant (coincide con 0019 y con el test 0016).
- **Las tablas siguen siendo tablas:** cada nota va dentro de la celda, antes del `|` que la cierra; ningún `|` nuevo (Step 1.3).
- **El párrafo del plan** conserva la frase de la forma `begin; plan; …; finish; rollback;` (sigue siendo cierta: `supabase/tests/0002_rls.test.sql` empieza con `begin;` y termina con `rollback;`) y solo pasa a pasado lo que dejó de serlo (Step 1.3).

---

## Task 0: Preparar

- [ ] **Step 0.1:** `git -C $WT branch --show-current` → `update/checklist-spec-0019-note`.
- [ ] **Step 0.2:** `git -C $WT log --oneline origin/develop..HEAD` → vacío.
- [ ] **Step 0.3:** `grep -c "Obsolete since 0019" $WT/docs/superpowers/plans/2026-10-16-pre-real-data-checklist.md` → `1` (el PR #151 está en la base). Si da `0`, **detente** y avisa al orquestador.

---

## Task 1: Notas en el spec y párrafo del plan en pasado (#149)

**Files:**
- Modify: `docs/superpowers/specs/2026-10-16-pre-real-data-checklist-design.md` (4 celdas)
- Modify: `docs/superpowers/plans/2026-10-16-pre-real-data-checklist.md` (1 párrafo)

En este Task, `$S` = `$WT/docs/superpowers/specs/2026-10-16-pre-real-data-checklist-design.md` y `$P` = `$WT/docs/superpowers/plans/2026-10-16-pre-real-data-checklist.md`.

- [ ] **Step 1.1: Rojo**

Run: `grep -c "Superseded by 0019 (#48, PR #148)" "$S"` → `0`.
Run: `grep -c "cannot be pasted as they are" "$P"` → `1`.
(Verificado por el planner.)

- [ ] **Step 1.2: Editar (cada ancla aparece una sola vez; búscala tal cual)**

En `$S`, **agrega** el texto en cursiva justo después del ancla, en la misma línea (con un espacio delante):

1. Ancla (fila `EXECUTE vía PUBLIC`, hoy l.26): `(0003, 0012; verificado en \`proacl\`), así que no se tocan.` → agrega ` *(Superseded by 0019 (#48, PR #148): 0019 revoca el grant de \`authenticated\` sobre \`player_consent_granted\`; hoy solo los tres helpers de policies lo conservan.)*`
2. Ancla (fila "App autenticada", hoy l.156): `` `player_consent_granted` también tiene grant explícito. `` → agrega ` *(Superseded by 0019 (#48, PR #148): ese grant se revocó; solo la llaman funciones SECURITY DEFINER.)*`
3. Ancla (fila B3, hoy l.282): `(4 aserciones: los 3 helpers de policies + el de triggers con grant explícito) | \`true\`` → agrega, **antes** del ` |` final de la fila, ` *(Superseded by 0019 (#48, PR #148): \`player_consent_granted(uuid)\` ahora espera \`false\`; los otros tres siguen en \`true\`.)*`. La fila termina en `… siguen en \`true\`.)* |`.
4. Ancla (fila de riesgos, hoy l.390): `` `player_consent_granted` (triggers) también lo tiene. `` → agrega ` *(Superseded by 0019 (#48, PR #148): ya no lo tiene; B3 espera \`false\` para ese helper.)*`

(Las comillas invertidas escapadas `\`` de arriba son comillas invertidas normales en el archivo.)

En `$P`, reemplaza la oración completa (justo después de la nota `> **Obsolete since 0019 (lote A, …)**`, al inicio del párrafo):

```
The canonical files keep the `begin; plan; …; finish; rollback;` form and cannot be pasted as they are (0002 relies on a `tests` schema that does not exist on the remote and calls a nonexistent `reset()`; 0012 keeps its consent setup in comments).
```

por:

```
The canonical files keep the `begin; plan; …; finish; rollback;` form. At the time of this plan they could not be pasted as they were (0002 relied on a `tests` schema that does not exist on the remote and called a nonexistent `reset()`; 0012 kept its consent setup in comments); since lote A they can (see the note above).
```

El resto del párrafo (`Each R-call below is **one** \`execute_sql\` …`) no cambia.

- [ ] **Step 1.3: Verde y comprobaciones**

- `grep -c "Superseded by 0019 (#48, PR #148)" "$S"` → `4`; `grep -n "Superseded by 0019" "$S" | cut -d: -f1` → `26`, `156`, `282`, `390`.
- `git -C $WT diff --word-diff=porcelain -- docs/superpowers/specs/2026-10-16-pre-real-data-checklist-design.md | grep -c '^-[^-]'` → `0` (nada borrado en el spec).
- Las 4 filas siguen con el mismo número de `|`: `git -C $WT diff -- docs/superpowers/specs/2026-10-16-pre-real-data-checklist-design.md | grep '^[-+]|' | awk -F'|' '{print substr($0,1,1), NF}'` → cuatro pares `-`/`+` con el mismo número.
- `grep -c "cannot be pasted as they are" "$P"` → `0`; `grep -c "At the time of this plan they could not be pasted as they were" "$P"` → `1`.
- `git -C $WT diff --stat` → `2 files changed, 5 insertions(+), 5 deletions(-)` (planner: spec `8 ++++----`, plan `2 +-`).

- [ ] **Step 1.4: Commit**

`git -C $WT status -s` → solo los dos `.md` de 2026-10-16 y este plan.

```bash
git -C $WT add docs/superpowers/plans/2026-11-18-techdebt-v-checklist-spec-note.md docs/superpowers/specs/2026-10-16-pre-real-data-checklist-design.md docs/superpowers/plans/2026-10-16-pre-real-data-checklist.md
```

```bash
git -C $WT commit -m "docs: mark the 0019 grant change in the pre-real-data checklist spec and plan (#149)" -m "0019 revoked EXECUTE on player_consent_granted from authenticated, so the spec's explicit-grant claims and B3 = true are no longer current, and since lote A the canonical pgTAP files can be pasted as they are. Short notes mark both while the historical text stays." -m "Claude-Session: https://claude.ai/code/session_01XWBoZQLb3ti7U2LQcagZvd"
```

**Reporte al orquestador:** el SHA y las salidas de 1.1 y de todas las comprobaciones de 1.3.

---

## Orquestador (después de la revisión pre-PR y del merge)

- [ ] **O1. PR** a `develop` con `Closes #149`. El cuerpo menciona el añadido del párrafo del plan de 2026-10-16 (pedido por el orquestador, fuera del texto del issue).

---

## Discrepancias

- **Otras menciones de B3 en el plan de 2026-10-16 no se tocan (decisión del planner).** El plan aún dice `true` para B3 en l.34 (Review Focus), en el SQL de la llamada 2 (l.211) y en la línea de verificación del 2026-10-16 (l.1159). Son el registro de lo que se ejecutó entonces, y la nota `Obsolete since 0019` del PR #151 cubre la sección de regresión. El issue y el spec §2 solo piden el spec; el añadido del orquestador solo pide el párrafo de l.425. Si se quieren más notas, va en otro issue.
- **"does not exist on the remote" queda en presente.** El esquema `tests` sigue sin existir en el remoto; lo que cambió es que los archivos canónicos ya no dependen de él (lote A).
