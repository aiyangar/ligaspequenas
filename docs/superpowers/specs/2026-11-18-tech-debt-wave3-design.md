# Barrido de deuda técnica, tercera ola — Diseño

**Fecha:** 2026-11-18
**Estado:** Aprobado por el owner (2026-11-18)
**Contexto:** continuación de `2026-11-18-tech-debt-sweep-design.md`. El owner pidió que no quede nada sin resolver; estos 8 issues salieron durante la planeación y las revisiones de las olas 1 y 2. Aplican las mismas reglas de ese spec (§1: ningún issue se cierra sin cambio verificado o evidencia; §5: restricciones).

## 1. Issues y lotes

| Lote | Rama | Issues | Archivos principales |
|---|---|---|---|
| L | `fix/users-invite-edge-cases` | #116 #117 | `supabase/functions/invite-user/{index,http}.ts` (+tests), `src/users/UsersPage*` |
| M | `fix/team-form-flash` | #118 | `src/teams/TeamFormPage*` |
| N | `fix/player-photo-zero-rows-and-refresh` | #119 #130 | `src/players/players.ts` (+test), `src/players/PlayerFormPage*` |
| O | `fix/payments-403-match` | #124 | `src/payments/payments.ts` (+test) |
| P | `fix/backups-node-code` | #121 | `ops/backup/lib/safe-error.ts` (+test) |
| J (ampliado) | `fix/form-test-timeouts` | #34 + **#120** | config de tests y tests lentos |

- L, M, N, O y P no comparten archivos y van en paralelo.
- **#120 se suma al lote J**: es el mismo problema de fondo (tests que fallan bajo carga) y los dos tocan la configuración de tiempos de Vitest/Testing Library. J sigue siendo el último lote del barrido y mide sobre el `develop` final, con todo lo demás mergeado.

## 2. Decisiones del orquestador (revisables)

- **#116:** un body JSON que no sea un objeto (`null`, número, string, arreglo) responde **400 `invalid_json`**, igual que un JSON mal formado. Después del merge el orquestador redespliega `invite-user` y prueba con curl que `null` da 400 con CORS. Como `null` deja de forzar el 500, la prueba en vivo del envoltorio de #42 ya no se puede repetir con curl; queda cubierta por sus tests unitarios.
- **#117:** `changeRole` usa `.select('id')`; cero filas se trata como error ("No tienes permiso para esta acción." o el texto equivalente que ya use la pantalla), con el mismo patrón de `payments.ts`/`documents.ts`.
- **#118:** mismo arreglo que #61 en `PlayerFormPage`: el flash se lee una sola vez y se reemplaza el historial con `state: null`; guardar una edición no agrega una entrada duplicada al historial si hoy lo hace.
- **#119:** `uploadPlayerPhoto`/`removePlayerPhoto` detectan cero filas (`.select('id')`); en la subida, cero filas borra el objeto recién subido (rollback), igual que `uploadDocument`.
- **#130:** después de guardar una edición, la ficha vuelve a leer la fila del jugador (`fetchPlayer`) para refrescar categoría, equipo disponible y selector de Equipo, **sin** pisar lo que el usuario está escribiendo si siguiera editando (mismo cuidado que el test de #57.3).
- **#124:** `\b403\b` en la traducción de errores de `payments.ts`, con test.
- **#121:** los códigos `ERR_*` se aceptan solo si coinciden con la forma de los códigos de Node (`^ERR_[A-Z0-9_]+$`) **y** existen en la lista de códigos de error conocidos que el plan defina con evidencia (por ejemplo, los `code` de errores reales de `node:` que usa `ops/backup`); cualquier otro sale `unknown`.
- **#120:** se decide con evidencia de una corrida con carga (lo mide J): `configure({ asyncUtilTimeout })` global en `src/test-setup.ts` si hace falta, o esperas puntuales; nunca a ciegas.

## 3. Verificación

- Cada lote: TDD (rojo real, verde), `pnpm exec vitest run`, `pnpm exec tsc -b`, `pnpm lint`; revisión de código pre-PR; PR con `Closes #N`.
- L: redespliegue de `invite-user` y curl (null → 400 con CORS; OPTIONS permitido 200; origen ajeno 403; Basic 401).
- M y N: verificación en navegador junto con la sesión de pruebas de la ola 1 (jugador de prueba creado y borrado por el orquestador; un equipo de prueba si M lo necesita, borrado al final).
- P: `vitest run ops/backup` y el respaldo nocturno sigue en verde.

## 4. Fuera de alcance

- #7 (SMTP, pendiente del dominio).
