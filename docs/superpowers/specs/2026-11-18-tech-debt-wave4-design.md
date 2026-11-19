# Barrido de deuda técnica, cuarta ola — Diseño

**Fecha:** 2026-11-18
**Estado:** Decisiones del orquestador (el owner pidió "avanza todo lo que puedas"); revisables por el owner antes de promover a `main`.
**Contexto:** continuación de `2026-11-18-tech-debt-sweep-design.md` y `2026-11-18-tech-debt-wave3-design.md`. Son los seguimientos que dejaron las revisiones de la ola 3 y del lote A. Aplican las mismas reglas (ningún issue se cierra sin cambio verificado o evidencia; restricciones del spec de la ola 1 §5). #7 (SMTP) sigue fuera.

## 1. Issues y lotes

| Lote | Rama | Issues | Archivos principales | Orden |
|---|---|---|---|---|
| Q | `fix/player-save-zero-rows-and-stale-refresh` | #134 #145 | `src/players/players.ts` (+test), `src/players/PlayerFormPage*` | paralelo |
| R | `update/shared-flash-helper` | #135 #146 | `src/lib/flash.ts` (nuevo, +test), `src/teams/TeamDetailPage.tsx`, `src/players/PlayerFormPage.tsx` | **después de Q** (comparte `PlayerFormPage.tsx`) |
| S | `fix/backup-timeout-code` | #136 #141 | `ops/backup/lib/safe-error.ts`, `ops/backup/safe-error.test.ts` | paralelo |
| T | `fix/permission-denied-message` | #139 | `src/payments/payments.ts` (+test), `src/documents/documents.ts` (+test) | paralelo |
| U | `fix/invite-user-no-detail` | #147 | `supabase/functions/invite-user/index.ts` (+ `http.ts`/tests si aplica) | paralelo |
| V | `update/checklist-spec-0019-note` | #149 | `docs/superpowers/specs/2026-10-16-pre-real-data-checklist-design.md` | paralelo |

- Q, S, T, U y V no comparten archivos. R va después de Q. El lote J (#34, #120) sigue siendo el último del barrido y mide sobre el `develop` con esta ola mergeada.

## 2. Decisiones del orquestador

- **#134:** `updatePlayer` usa `.select('id')`; cero filas devuelve `NO_PERMISSION_MESSAGE` (de `documents.ts`), igual que `setPhotoPath`/`updateDocument`. En la ficha, un guardado con cero filas muestra el error, **no** muestra "Cambios guardados" y **no** refresca la fila.
- **#145:** `refreshRow` descarta respuestas viejas con un contador de solicitudes (solo aplica la respuesta de la última solicitud). Aplica a los tres refrescos (guardar, foto, equipo). No se vuelve a bloquear Guardar durante el refresco.
- **#135 + #146:** `flashOf` se extrae a `src/lib/flash.ts` con su test; `PlayerFormPage` y `TeamDetailPage` lo importan. El comentario de `TeamDetailPage` se reescribe al *por qué* (la página siempre se monta desde el formulario, así que basta leerlo al montar) o se elimina. Sin cambio de comportamiento.
- **#136:** un aborto por `AbortSignal.timeout` (`name === 'TimeoutError'`, en el error o en `cause`) imprime el código interno fijo `timeout`. Nunca se imprime texto del error. Se agrega a `INTERNAL_CODES` (o equivalente) con test.
- **#141:** test que fija el respaldo a `cause.code` cuando el código de arriba tiene forma de Node pero no está en la lista (`{ code: 'ERR_FAKE', cause: { code: 'UND_ERR_SOCKET' } }` → `error: UND_ERR_SOCKET`).
- **#139:** `permission denied` se suma a la regex de traducción en `payments.ts` y en `documents.ts` (misma expresión en los dos), con un test en cada uno.
- **#147:** `invite_failed` y `profile_insert_failed` dejan de devolver `detail`; el detalle se registra del lado del servidor con `console.error` (logs de la función, solo visibles en el dashboard). El plan debe verificar que la UI de Usuarios no lee `detail` (hoy `src/users` no lo usa). Después del merge el orquestador redespliega y prueba con curl los casos de la ola 3 (null → 400 con CORS, OPTIONS 200/403, Basic 401); los casos `invite_failed`/`profile_insert_failed` quedan cubiertos por tests, porque provocarlos en vivo crearía o fallaría invitaciones reales.
- **#149:** nota corta "superseded by 0019 (#48, PR #148)" junto a cada mención del grant explícito de `player_consent_granted` y de B3 = `true`; el texto histórico se conserva.

## 3. Verificación

- Cada lote: TDD (rojo real, verde), `pnpm exec vitest run`, `pnpm exec tsc -b`, `pnpm lint`; revisión de código pre-PR; PR con `Closes #N`.
- Q y R: verificación en navegador por el orquestador con un jugador de prueba creado y borrado por él (guardar normal sigue mostrando "Cambios guardados" y refresca; dos guardados seguidos con la lectura demorada dejan la fila del último; los avisos de creación siguen apareciendo una vez en jugadores y equipos).
- S: `vitest run ops/backup` y una corrida manual del respaldo en `develop` en verde.
- U: redeploy + curl.
- Sin cambios de base de datos en esta ola.

## 4. Fuera de alcance

- #7 (SMTP, pendiente del dominio).
