# Lote X — Nota "superseded by 0019" junto al SQL de B3 del plan pre-datos-reales (#153) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Antes de despachar:** este plan y el spec `docs/superpowers/specs/2026-11-19-tech-debt-wave5-design.md` se mergean a `develop` en un PR de docs **antes** de despachar. El implementer los lee desde su propio worktree (cortado de `origin/develop`) y marca `- [x]` ahí, en su copia del plan, al terminar cada paso.

**Goal:** Quien copie la llamada 2 del test 0016 desde el plan del 2026-10-16 ve, junto al SQL, que desde 0019 (#48, PR #148) la aserción B3 de `player_consent_granted` espera `false` y que el archivo vigente es `supabase/tests/0016_revoke_anon_privileges.test.sql` (#153). El SQL histórico no cambia.

**Architecture:** Solo docs. En `docs/superpowers/plans/2026-10-16-pre-real-data-checklist.md` (en inglés), una nota en blockquote de una línea **insertada** justo después del bloque ```sql que contiene la llamada 2 (Task 2, Step 1 de ese plan; la valla de cierre es hoy la l.245), separada por líneas en blanco. Ninguna línea existente se borra ni se edita. RED/GREEN con `grep`.

**Tech Stack:** Markdown; `grep`, `git diff`.

**Spec:** `docs/superpowers/specs/2026-11-19-tech-debt-wave5-design.md` (§1 lote X, §2 decisión #153, §3 verificación). Contexto: `supabase/migrations/0019_harden_player_file_helpers.sql` (`revoke execute on function private.player_consent_granted(uuid) from authenticated;`) y `supabase/tests/0016_revoke_anon_privileges.test.sql` l.72 (B3 de `player_consent_granted` = `false`).

## Global Constraints

- Rama `update/b3-sql-0019-note`, cortada de `origin/develop` (con este plan ya mergeado). Worktree: `/Users/arturoortiz/Proyectos/Personales/ligaspequenas-worktrees/b3-sql-0019-note` (lo crea el orquestador). En este plan `$WT` es esa ruta absoluta. No hace falta `pnpm install`.
- Git: siempre `git -C $WT …` (un hook bloquea `cd … && git …`), **un comando git por llamada al shell**. Nunca `CLAUDE_GIT_OVERRIDE`. El implementer nunca hace push, PR ni merge. Nunca toques `/Users/arturoortiz/Proyectos/Personales/ligaspequenas` (checkout principal).
- **Nunca `git stash`**: el stash es compartido entre los worktrees que corren en paralelo y ya se pisaron trabajos así. Para descartar un cambio usa `git -C $WT checkout -- <archivo>`; para apartarlo, `git -C $WT diff -- <archivo> > "$(mktemp)"` (fuera del repo) y luego `git -C $WT apply <ese archivo>`.
- **Archivos permitidos** (solo estos): `docs/superpowers/plans/2026-10-16-pre-real-data-checklist.md` y este plan. Antes del commit, `git -C $WT status -s` debe listar **solo** esos.
- **Paralelo:** W y X corren a la vez y no comparten archivos (verificado por el planner: W `src/players/players{,.test}.ts` y `src/documents/documents.ts`; X solo el `.md` de arriba). Si necesitas un archivo fuera de tu lista, **detente** y avisa al orquestador.
- La nota va en inglés (el plan de 2026-10-16 está en inglés). Mensaje de commit en inglés, terminado en la línea `Claude-Session: https://claude.ai/code/session_01XWBoZQLb3ti7U2LQcagZvd`. `git add` incluye este plan.
- Sin cambios de código: la suite no se mueve (referencia del planner en `origin/develop` = `b722017`: 49 archivos, 584 tests); no hace falta correrla.

## Review Focus

- **El SQL histórico no se toca:** el diff no tiene ninguna línea borrada; las l.209-212 (las cuatro B3, con `true`) siguen idénticas (Step 1.3).
- **La nota queda fuera del bloque de código:** va después de la valla de cierre, así que copiar "call 2" entre los marcadores `-- MCP call …` no la arrastra; el número de vallas ```` ``` ```` del archivo no cambia (Step 1.3).
- **La nota dice lo que hizo 0019** y nada más: solo `player_consent_granted(uuid)` pasa a `false`; los otros tres B3 siguen en `true` (coincide con 0019 y con el test 0016 l.70-73).
- **Una sola nota:** `grep -c` de la frase del archivo vigente = 1.
- **La nota `Obsolete since 0019` (l.423, sección de regresión) no cambia**: cubre otra parte del plan.

---

## Task 0: Preparar

- [x] **Step 0.1:** `git -C $WT branch --show-current` → `update/b3-sql-0019-note`.
- [x] **Step 0.2:** `git -C $WT log --oneline origin/develop..HEAD` → vacío.

---

## Task 1: Nota junto al SQL de la llamada 2 (#153)

**Files:**
- Modify: `docs/superpowers/plans/2026-10-16-pre-real-data-checklist.md` (2 líneas insertadas después de la l.245)

En este Task, `$P` = `$WT/docs/superpowers/plans/2026-10-16-pre-real-data-checklist.md`.

- [x] **Step 1.1: Rojo**

Run: `grep -c "Superseded by 0019" "$P"` → `0`.
Run: `grep -c '^```' "$P"` → `76`.
Run: `sed -n 243,247p "$P"` → `select * from extensions.finish();`, `rollback;`, ```` ``` ````, línea vacía, `- [ ] **Step 2: Write the migration**`.
(Verificado por el planner.) Si la l.245 no es la valla de cierre, ubícala por contenido: es la ```` ``` ```` que sigue a `rollback;` después de `-- MCP call 2 ends here`.

- [x] **Step 1.2: Insertar la nota**

Después de la valla de cierre (l.245) y antes de la línea vacía que precede a `- [ ] **Step 2: Write the migration**`, inserta una línea vacía y esta línea, tal cual:

```
> **Superseded by 0019 (#48, PR #148):** the B3 assertion on `private.player_consent_granted(uuid)` in call 2 above now expects `false`, because 0019 revoked EXECUTE from `authenticated`; the current file is `supabase/tests/0016_revoke_anon_privileges.test.sql`.
```

Resultado: l.245 ```` ``` ````, l.246 vacía, l.247 la nota, l.248 vacía, l.249 `- [ ] **Step 2: Write the migration**`.

- [x] **Step 1.3: Verde y comprobaciones**

- `grep -c "Superseded by 0019" "$P"` → `1`; `grep -n 'the current file is `supabase/tests/0016_revoke_anon_privileges.test.sql`' "$P" | cut -d: -f1` → `247`.
- `grep -c '^```' "$P"` → `76` (la nota no abre ni cierra un bloque).
- `git -C $WT diff -- docs/superpowers/plans/2026-10-16-pre-real-data-checklist.md | grep -c '^-[^-]'` → `0` (nada borrado).
- `sed -n 209,212p "$P" | grep -c "), true, 'B3 "` → `4` (el SQL histórico intacto).
- `git -C $WT diff --stat` → `1 file changed, 2 insertions(+)`.

- [x] **Step 1.4: Commit**

`git -C $WT status -s` → solo el `.md` de 2026-10-16 y este plan.

```bash
git -C $WT add docs/superpowers/plans/2026-11-19-techdebt-x-b3-sql-note.md docs/superpowers/plans/2026-10-16-pre-real-data-checklist.md
```

```bash
git -C $WT commit -m "docs: note that the 2026-10-16 plan's B3 SQL changed with 0019 (#153)" -m "The call 2 SQL in the pre-real-data plan still expects authenticated to execute player_consent_granted, which 0019 revoked. A one-line note after the block points to the current 0016 test file while the historical SQL stays as it was." -m "Claude-Session: https://claude.ai/code/session_01XWBoZQLb3ti7U2LQcagZvd"
```

**Reporte al orquestador:** el SHA y las salidas de 1.1 y de todas las comprobaciones de 1.3.

---

## Orquestador (después de la revisión pre-PR y del merge)

- [ ] **O1. PR** a `develop` con `Closes #153`.

---

## Discrepancias

- **La nota va después del bloque, no dentro (decisión del planner).** El spec pide "junto al SQL" sin cambiar el SQL histórico. Un comentario SQL dentro del bloque cambiaría el texto que se copia entre los marcadores `-- MCP call 2 …`; un blockquote justo después de la valla queda pegado al SQL, se ve al copiarlo y no lo altera.
- **Otras menciones de B3 = `true` en el plan no se tocan.** l.34 (Review Focus), l.345 (los cuatro B3 `ok` en O2) y l.1159 (verificación del 2026-10-16) son registro de lo que se ejecutó entonces, como ya decidió el lote V (#149). El issue solo pide la nota junto al SQL de la llamada 2.
