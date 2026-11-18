# Deuda técnica de seguridad y datos (#44, #46, #73) — Diseño

**Fecha:** 2026-11-17
**Estado:** Propuesto (decisiones del owner del 2026-11-17)
**Issues:** [#44](https://github.com/aiyangar/ligaspequenas/issues/44), [#46](https://github.com/aiyangar/ligaspequenas/issues/46), [#73](https://github.com/aiyangar/ligaspequenas/issues/73)

## 1. Contexto y objetivo

Tres huecos que salieron en revisiones anteriores y que conviene cerrar antes de cargar datos reales. Hoy la base tiene 1 jugador, 0 pagos y 1 archivo en `player-files` (verificado por MCP el 2026-11-17), así que ninguno ha causado daño.

- **#44:** la policy `players_delete` deja que un admin borre jugadores por la API. Las filas de `documents` se borran en cascada, pero los objetos de `player-files/{tenant}/{player}/` (foto y documentos de un menor) se quedan sin ninguna fila que apunte a ellos.
- **#46:** las policies de `storage.objects` validan el consentimiento con `private.player_file_path_allowed` (0012) sin tomar ningún candado. Una subida y una revocación de consentimiento concurrentes pueden dejar un archivo que no es de consentimiento para un jugador sin consentimiento.
- **#73:** `fetchPlayers`, `fetchPaymentStatuses` y `fetchOutstandingPayments` no paginan. Por encima del `max-rows` de PostgREST (1000 en Supabase) la respuesta se trunca sin error, y un deudor podría aparecer como "Al corriente".

## 2. Decisiones del owner (2026-11-17)

| Tema | Decisión |
|---|---|
| Borrado de jugadores | **No se borra.** La baja (`status = 'baja'`) es la única forma de sacar a un jugador. El borrado queda prohibido para `authenticated`; solo `service_role`/`postgres` (Dashboard) puede borrar. |
| #44 | **Enfoque A:** quitar la policy y el privilegio de borrar. |
| #46 | **Enfoque A:** candado `FOR SHARE` sobre el jugador dentro de `player_file_path_allowed`. |
| #73 | **Enfoque A:** helper que trae los datos por bloques con `.range()`. |

## 3. Enfoques considerados

**#44**
- **A (elegido):** `drop policy players_delete` + `revoke delete on public.players from authenticated`. Un `DELETE` por la API falla con `42501` en vez de borrar cero filas en silencio. Es la forma más simple de cumplir "no se borra".
- B: trigger que bloquea el borrado solo si el jugador tiene archivos. Más código y deja abierto un borrado que el owner no quiere.
- C: flujo de borrado que también limpie Storage. Descartado: el owner no quiere borrar jugadores.

**#46**
- **A (elegido):** el arreglo propuesto en el issue; ver §4.2.
- B: aceptar el riesgo y documentarlo. Gratis, pero deja el hueco.

**#73**
- **A (elegido):** paginar con `.range()` hasta recibir un bloque incompleto.
- B: detectar el límite (count/`Content-Range`) y mostrar error. Más simple, pero la app deja de funcionar justo cuando hay volumen.
- C: subir `max-rows` en el Dashboard. Solo aplaza el problema y no queda en el repo.

## 4. Diseño

Tres entregas independientes, cada una en su rama, que pueden ir en paralelo. Las dos migraciones toman números fijos para no chocar.

### 4.1 #44 — Migración `0017_forbid_player_delete.sql`

- `drop policy players_delete on public.players;`
- `revoke delete on public.players from authenticated;`
- No se toca `service_role` ni `postgres`.
- La app no tiene ningún `delete` sobre `players` (`src/players/players.ts`), así que no hay cambios de frontend.

**Choque conocido:** el test `supabase/tests/0016_revoke_anon_privileges.test.sql`, aserción **A2** ("authenticated keeps SELECT/INSERT/UPDATE/DELETE on every public table"), fallará. Hay que excluir `players` de A2 de forma explícita.

**Pruebas pgTAP (`supabase/tests/0017_forbid_player_delete.test.sql`):**
- No existe ninguna policy `DELETE` sobre `public.players` (`pg_policies`).
- `has_table_privilege('authenticated', 'public.players', 'DELETE')` es falso.
- `authenticated` conserva `SELECT/INSERT/UPDATE` sobre `players`.
- Un admin autenticado que intenta `DELETE` recibe `42501` y el jugador sigue existiendo.
- `service_role` conserva `DELETE`.

### 4.2 #46 — Migración `0018_lock_player_on_file_write.sql`

`create or replace function private.player_file_path_allowed(p_name text)` con el mismo cuerpo que en 0012, salvo:

- Pasa de `stable` a **`volatile`**. Así cada sentencia de la función toma un snapshot nuevo, y un `stable` no puede tomar candados de fila.
- El `select p.id into v_player ... where p.id::text = v_parts[2] and p.tenant_id = v_tenant` agrega **`for share`**. `FOR SHARE` choca con el `FOR NO KEY UPDATE` que toma `private.enforce_document_rules` (0013) al revocar el consentimiento, así que la subida y la revocación quedan en fila.
- El chequeo de consentimiento (`private.player_consent_granted`) va **después** del candado, en una sentencia aparte. En READ COMMITTED esa sentencia ve lo que la otra transacción ya confirmó.
- Se conservan `security definer`, `set search_path = ''` y el `grant execute` a `authenticated`. Las policies de 0012 no cambian.

Por qué resuelve los dos órdenes:
- **La subida llega primero:** la revocación espera el candado. Al seguir, su `exists (select 1 from storage.objects ...)` en 0013 corre como sentencia nueva, ve el objeto ya confirmado y lanza `consent_in_use`.
- **La revocación llega primero:** la subida espera el candado. Al seguir, su chequeo de consentimiento ve la revocación y la policy rechaza la subida.

Los candados se toman en transacciones distintas (la API de Storage y PostgREST no comparten transacción), así que no se crea un riesgo de deadlock nuevo.

**Pruebas pgTAP (`supabase/tests/0018_lock_player_on_file_write.test.sql`):**
- `provolatile = 'v'`, `prosecdef` verdadero y `proconfig` con `search_path=""` para la función.
- La definición (`pg_get_functiondef`) contiene `for share`.
- Regresión: los casos de 0012 de la función (ruta válida con y sin consentimiento, `image_consent`/`privacy_notice` sin consentimiento, otro tenant, jugador inexistente, ruta malformada) siguen dando el mismo resultado.

**No se prueba la concurrencia en pgTAP:** MCP corre una sola sesión y no hay `dblink`. La garantía de orden se documenta arriba y queda como riesgo aceptado del método de prueba, no del diseño.

### 4.3 #73 — Lecturas por bloques en el frontend

- Un helper genérico, por ejemplo `fetchAllRows` en `src/lib/` (nombre y ubicación a criterio del builder). Recibe una función que arma la consulta para un rango `(from, to)` y pide bloques de **1000** con `.range(from, to)`. Avanza `from` por el número de filas que **realmente** llegaron y se detiene solo cuando un bloque llega **vacío**. Si se cortara en "bloque incompleto" y alguien bajara `max-rows` por debajo de 1000, el primer bloque llegaría incompleto y la lista se truncaría en silencio, que es justo el bug de #73. El costo es una petición extra al final. Si un bloque falla, lanza el error igual que hoy (`throw new Error(error.message)`).
- Se aplica a las tres lecturas a nivel tenant:
  - `fetchPlayers` (`src/players/players.ts`): orden `full_name`, desempate `id`.
  - `fetchPaymentStatuses` (`src/payments/payments.ts`): orden `player_id` (es único por jugador).
  - `fetchOutstandingPayments` (`src/payments/payments.ts`): orden `payment_date`, desempate `id`.
- El desempate por una columna única es obligatorio: sin él, Postgres no garantiza un orden estable y una fila se puede saltar o repetir entre bloques.
- La firma y el tipo de retorno de las tres funciones no cambian. Quien las llama (listas, Quién debe, export a Excel) no se toca.
- Tests unitarios (Vitest, con el cliente de Supabase mockeado como en los tests existentes): tabla vacía (1 llamada); 3 filas + vacío (2 llamadas); 1000 + 1 + vacío (3 llamadas, 1001 filas en orden, rangos `0-999`, `1000-1999`, `1001-2000`); servidor que devuelve 500 por bloque (con `max-rows` más bajo) sigue hasta el vacío y avanza por 500; error en el segundo bloque (lanza).

## 5. Fuera de alcance

- `fetchRoster` y `fetchEligiblePlayers` (por equipo o por categoría, muy lejos de 1000) y `fetchPlayerPayments` (por jugador).
- La atomicidad entre las dos lecturas de Quién debe, que ya es un riesgo aceptado (comentario en `payments.ts`). Paginar no la empeora de forma relevante.
- Una UI para borrar jugadores o para limpiar Storage.
- Probar en vivo la carrera de #46 con dos sesiones.

## 6. Entrega

| Rama | Contenido | Cierra |
|---|---|---|
| `fix/forbid-player-delete` | 0017 + su test + ajuste de A2 en el test de 0016 | #44 |
| `fix/lock-player-file-write` | 0018 + su test | #46 |
| `fix/paginate-tenant-reads` | helper + 3 lecturas + tests | #73 |

- Las migraciones se aplican a la base remota por MCP (`apply_migration`) y sus tests se corren ahí, como en las migraciones anteriores. Después de cada DDL se corren los advisors de seguridad.
- El frontend se verifica con `vitest`, `tsc -b` y `pnpm lint`. No hay cambio visible, así que la prueba en navegador se limita a revisar que la lista de jugadores y Quién debe siguen cargando.

## 7. Decisiones del orquestador (revisables)

- Números de migración fijos (0017 para #44 y 0018 para #46) para que las dos ramas puedan avanzar en paralelo.
- Tamaño de bloque 1000, igual al `max-rows` por defecto, como constante única. Cortar en bloque vacío (no en bloque incompleto) hace que el helper siga siendo correcto aunque alguien cambie `max-rows` en el Dashboard.
- La prueba de concurrencia de #46 se queda fuera del método de prueba (ver §4.2).
