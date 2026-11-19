# Barrido de toda la deuda técnica abierta — Diseño

**Fecha:** 2026-11-18
**Estado:** Propuesto (decisiones del owner del 2026-11-18)
**Alcance:** los 39 issues abiertos de deuda técnica, review-followup y bugs al 2026-11-18. Queda fuera solo **#7** (SMTP propio), que el owner resolverá cuando compre el dominio.

## 1. Objetivo

El owner pidió "que no quede nada sin resolver". Cada issue se cierra con un cambio verificado, no con un "won't fix". Si un plan descubre que un issue ya no aplica, debe demostrarlo con evidencia (test o lectura de código citada) y el issue se cierra con esa evidencia en el PR. No se puede cerrar por opinión.

Cada issue es la fuente de verdad de su detalle (`gh issue view <n>`). Este spec fija la agrupación, las decisiones y las restricciones; los planes bajan cada issue a pasos.

## 2. Decisiones del owner (2026-11-18)

| Tema | Decisión |
|---|---|
| #54.1 Documentos en la ficha | La sección de Documentos sale del `<form>` y va **debajo de Guardar**. El formulario y su Guardar van primero; Foto, Documentos y Pagos se muestran después como secciones aparte que guardan solas. El plan fija el orden exacto según el layout actual. |
| #72 Quién debe | El link del deudor se anuncia con el **nombre del jugador** (`aria-label`) y el desglose va en `aria-describedby`. Visualmente no cambia nada. |
| #15 Usuarios y navegación | **Ajuste con el tema actual (Dracula MUI), sin rediseño.** El `<select>` nativo del rol pasa a `Select` de MUI, y la navegación usa los mismos componentes y estilos del resto de la app. |
| #7 | Fuera de alcance (viernes, con dominio). |

## 3. Decisiones del orquestador (revisables)

- **#35 y #36** (los issues decían "solo si hace falta"): se implementan. #35 agrega el test; #36 aplica el `key` sugerido (o el "Cargando…" al re-ejecutar el efecto) más su test.
- **#62:** se aplica la hipótesis del issue: limpiar la URL firmada en cuanto el borrado de la foto tiene éxito, antes de esperar el refetch del padre. Se agrega un test, y el orquestador verifica en el navegador que no aparece el 400.
- **#34:** se sube el timeout **solo** donde hace falta, en los tests de formularios que escriben con `userEvent`. Se puede usar `{ timeout }` por test o `describe`, o `vi.setConfig` en esos archivos. No se sube el timeout global.
- **#48.2:** optimizar `p.id::text = v_parts[2]` con un regex de uuid más `= v_parts[2]::uuid` reescribe `private.player_file_path_allowed`, la misma función de 0018. Va en su **propia migración** con el ciclo completo del lote anterior: rojo, revisión, apply, verde, R-0012, R-0013, el test de 0018 y la E2E de Storage. Debe conservar `volatile`, el `for share` y todo lo demás de 0018, y el test de 0018 (aserción 4, regex anclado) se ajusta en el mismo cambio.
- **#48.1:** `revoke execute on function private.player_consent_granted(uuid) from authenticated`. Antes de quitarlo, el plan verifica que ninguna policy ni función invocadora de `authenticated` lo llame sin `security definer`. Se actualiza el spec de documentos.
- **#48.3, #69 y #91:** los tests SQL canónicos quedan autocontenidos: fixtures en línea, sin `reset()` inexistente y sin depender de un schema `tests` que no existe (o creándolo y borrándolo dentro del archivo).
- **#42:** el handler de `invite-user` atrapa las excepciones inesperadas y responde un 500 JSON **con** headers CORS. Después del merge el orquestador redespliega la función (`pnpm exec supabase functions deploy invite-user --project-ref eksbaugyypadtanyjcje --use-api`) y prueba con curl.
- **#97:** se aplican los 4 Minors tal como los describe el issue. El 4 (regex de errno) se ajusta a la lista de errno de Node.

## 4. Lotes

Cada lote es **una rama** (`fix/*` o `update/*`) con un solo implementer, su revisión pre-PR y su PR. Se agrupan para que dos lotes de la misma ola no editen los mismos archivos.

| Lote | Rama | Issues | Archivos principales | Ola |
|---|---|---|---|---|
| A | `fix/db-tests-selfcontained` | #47 #48 #69 #91 #111 | `supabase/migrations/0019_*`, `supabase/tests/*`, spec de documentos | 1 |
| B | `update/ops-docs-nits` | #90 #93 | `docs/superpowers/plans/2026-10-16-*`, `docs/security/pre-real-data-checklist.md` | 1 |
| C | `fix/documents-section-hardening` | #50 #51 #52 #53 #54.3 | `src/documents/*` | 1 |
| D | `fix/player-page-polish` | #54.1 #54.2 #57 #58 #61 #62 #35 | `src/players/PlayerFormPage*`, `src/players/PlayerPhoto*`, `src/players/players.test.ts` | 1 |
| E | `fix/players-list-export-polish` | #76 #79 #83 #84 #85 #110 | `src/players/PlayersPage*`, `src/players/playersSheet*`, `src/lib/fetchAllRows*` | 1 |
| F | `fix/payments-a11y-tests` | #66 #67 #68 #72 #74 | `src/payments/*` | 1 |
| G | `fix/teams-tests-dialog` | #31 #36 | `src/teams/TeamDetailPage*`, `src/teams/AddPlayerDialog*` | 1 |
| I | `fix/users-auth-polish` | #13 #15 #39 #41 #42 | `src/users/*`, `src/app/AppLayout*`, `src/auth/*` (tests), `supabase/functions/invite-user/*` | 1 |
| K | `fix/backups-review-minors` | #97 | `ops/backup/*`, `docs/ops/backups.md` | 1 |
| H | `fix/lists-a11y-loading` | #71 #23 | `src/players/PlayersPage*`, `src/teams/TeamsPage*`, `src/payments/DebtorsPage*` | 2 (después de E, F y G) |
| J | `fix/form-test-timeouts` | #34 | tests de formularios con `userEvent` (`PlayerFormPage`, `TeamDetailPage`, `AddPlayerDialog`, etc.) | 2 (después de D, G e I) |

Reglas:
- **#54** se reparte entre lotes: los nits 1 y 2 (`PlayerFormPage`) van en D y el nit 3 (`documents.ts`) va en C. El issue se cierra con el PR que entre último, y el primero usa `Refs #54`.
- Si un issue de la ola 1 necesita tocar un archivo de otro lote de la misma ola, el plan lo mueve al lote dueño de ese archivo o a la ola 2. Nunca se editan en paralelo.
- **#39** (helper `deferred` compartido) toca solo tests de `src/auth/*` y crea un helper de test compartido. Los tests de players y teams que tengan su propio `deferred` **no** se migran en este barrido, para no chocar con D, E y G.

## 5. Restricciones

- Reglas del repo: identificadores en inglés; sin comentarios salvo una línea corta con el porqué; commits en inglés terminados en la línea `Claude-Session`.
- **Base de datos (lote A):** solo el orquestador corre pasos MCP, en serie, con el owner presente para confirmar las escrituras. El orden es rojo sin aplicar → revisión limpia → apply → advisors → verde → regresiones → E2E. Nada se aplica antes de una revisión limpia. Los fixtures usan prefijos propios y nunca tocan al jugador real ni a su objeto. Línea base al 2026-11-18: 1 tenant, 3 profiles, 3 users, 1 jugador, 6 documentos, 0 pagos, 1 objeto.
- **UI:** cada lote de UI cierra con `pnpm exec vitest run`, `pnpm exec tsc -b` y `pnpm lint` en verde. El orquestador hace después una verificación en navegador (Playwright, sesión admin persistente) de lo visible: layout de la ficha (D), foto y 400 (D/#62), foco al exportar (E/#85), mensaje de filtros vacíos (E/#76), Quién debe (F), Usuarios y nav (I), listas (H).
- **Edge Function (lote I):** sus tests con `deno test` (o el runner que use el repo; el plan lo verifica) en verde y redespliegue por el orquestador tras el merge.
- **Backups (lote K):** los tests de `ops/backup` en verde; el workflow nocturno debe seguir pasando después del merge.
- Cada PR lleva `Closes #N` por issue cerrado y los Minors/Nits nuevos de su revisión se registran como issues.

## 6. Fuera de alcance

- #7 (SMTP).
- Migrar los `deferred` de players y teams al helper compartido (ver §4, #39).
- Cualquier cambio de producto que no esté en un issue.
