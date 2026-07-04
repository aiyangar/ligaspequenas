# Equipos y rosters por temporada — Diseño

**Fecha:** 2026-07-03
**Estado:** Borrador para revisión

## 1. Contexto y objetivo

La liga (tenant, ej. MTY AC) puede tener **uno o varios equipos por categoría**. Un jugador pertenece a **un solo equipo a la vez**. Este slice añade el modelo de equipos, la asignación jugador↔equipo y su UI. Es un slice independiente que se ejecuta **antes** de la fase de documentos (Fase 4); documentos no depende de nada de aquí.

## 2. Decisiones de diseño (validadas en brainstorm)

| Decisión | Elección |
|---|---|
| Ámbito del equipo | Por **temporada** (`season_id`): cada temporada se crean equipos y rosters de cero. Las temporadas pasadas quedan como historial de solo lectura. |
| Relación equipo↔categoría | Cada equipo pertenece a **una categoría**. La asignación valida que la categoría derivada del jugador coincida con la del equipo (reforzado en servidor). |
| Un jugador, un equipo | `unique (player_id, season_id)` en la tabla de roster. Mover de equipo (mismo criterio de categoría) = actualizar esa fila; lo decide el coach/admin. |
| Elegibilidad | Solo jugadores con estatus `activo` son asignables/movibles. Regla única para ambas vías de asignación, reforzada en el trigger (§4). |
| Datos del equipo | `name`, `category_id`, `coach` (texto libre, nullable), `color` (texto libre, nullable). Sin cupo máximo en v1. |
| Gestión | Solo sobre la **temporada activa**. No hay UI para gestionar rosters de temporadas no activas. |
| Asignación bidireccional | Desde el detalle del jugador (selector de equipo) y desde el detalle del equipo (diálogo "añadir jugador"). |

## 3. Modelo de datos

Dos tablas nuevas más ajustes de integridad, siguiendo los patrones existentes (RLS por tenant de `0002`/`0003`, FKs compuestas de `0006`, triggers `updated_at` de `0001`).

### 3.1 Integridad de tenant previa (patrón 0006)

Para que las FKs compuestas de abajo sean posibles:

```sql
alter table seasons add constraint seasons_id_tenant_uk unique (id, tenant_id);
alter table categories add constraint categories_id_tenant_uk unique (id, tenant_id);
```

(`players` ya tiene `players_id_tenant_uk` desde `0006`.)

### 3.2 `teams`

| Columna | Tipo | Nota |
|---|---|---|
| `id` | uuid PK default `gen_random_uuid()` | |
| `tenant_id` | uuid not null | |
| `season_id` | uuid not null | El equipo vive en una temporada. |
| `category_id` | uuid not null | El equipo pertenece a una categoría. |
| `name` | text not null | Ej. "MTY AC Rojo". |
| `coach` | text | Nombre del responsable, texto libre. |
| `color` | text | Identidad visual, texto libre. |
| `created_at` / `updated_at` | timestamptz | Trigger `set_updated_at` como el resto. |

Constraints:

- `foreign key (season_id, tenant_id) references seasons (id, tenant_id)` — la temporada es del mismo tenant.
- `foreign key (category_id, tenant_id) references categories (id, tenant_id)` — la categoría es del mismo tenant.
- `unique (tenant_id, season_id, name)` — sin nombres duplicados dentro de la temporada.
- `unique (id, tenant_id, season_id)` — soporte para la FK compuesta del roster.
- Índice en `tenant_id` (patrón de las demás tablas).

### 3.3 `team_players` (roster)

| Columna | Tipo | Nota |
|---|---|---|
| `id` | uuid PK default `gen_random_uuid()` | |
| `tenant_id` | uuid not null | |
| `season_id` | uuid not null | Denormalizada del equipo; habilita la unicidad clave. |
| `team_id` | uuid not null | |
| `player_id` | uuid not null | |
| `created_at` / `updated_at` | timestamptz | |

Constraints:

- `foreign key (team_id, tenant_id, season_id) references teams (id, tenant_id, season_id) on delete cascade` — el roster apunta a un equipo de esa misma temporada y tenant; borrar el equipo vacía su roster.
- `foreign key (player_id, tenant_id) references players (id, tenant_id) on delete cascade` — borrar al jugador lo saca de todo roster (mismo patrón que `documents`/`payments`).
- **`unique (player_id, season_id)`** — regla de negocio central: un jugador está en **como máximo un equipo por temporada**. Mover de equipo = `update` de `team_id` en esta fila; quitar del roster = `delete`.
- Índices en `tenant_id`, `team_id`, `player_id`.

## 4. Validación de categoría (candado en servidor)

La UI solo ofrece asignaciones válidas, pero la regla se refuerza en Postgres (mismo criterio que el candado de consentimiento de la spec original: cliente valida, servidor garantiza).

Trigger `BEFORE INSERT OR UPDATE` sobre `team_players`, función `private.enforce_team_category()` (con el hardening de `search_path` del idioma `private.*`):

1. Lee la `category_id` y `season_id` del equipo destino (`new.team_id`) con **`select … for update`** sobre la fila de `teams`. El lock cierra la carrera TOCTOU con el trigger de `teams` de abajo: una asignación concurrente con un cambio de categoría del equipo se serializa — quien llegue segundo ve el estado ya commiteado y valida (o es rechazado) contra él.
2. Verifica que el jugador tenga estatus `activo`; si está `baja` → `raise exception` (regla de elegibilidad del §2, aplica a asignar y a mover).
3. Calcula la categoría derivada del jugador **contra el `cutoff_date` de esa temporada** (misma fórmula que la vista: `extract(year from age(cutoff_date, birth_date))` entre `min_edad_liga` y `max_edad_liga`). Se parametriza por la temporada del equipo — no por "la activa" — para que el trigger sea correcto por sí mismo.
4. Si el jugador no cae en ninguna categoría ("fuera de categoría") o su categoría no es la del equipo → `raise exception` con mensaje claro.

Notas:

- El trigger también protege el caso `UPDATE` (mover de equipo).
- **Cambio de categoría de un equipo con roster:** un `UPDATE` de `teams.category_id` invalidaría a sus miembros silenciosamente. Se añade un trigger `BEFORE UPDATE` sobre `teams` que rechaza cambiar `category_id` (o `season_id`) si el equipo tiene filas en `team_players`. La UI deshabilita el campo categoría cuando el roster no está vacío. (El lock del punto 1 garantiza que este guard y el trigger de asignación no se crucen bajo `READ COMMITTED`.)
- **Cambio de temporada:** no hay estado que reparar. Los rosters de la temporada anterior quedan como historial; la nueva temporada arranca sin equipos ni rosters.
- **Cambio de `birth_date` de un jugador ya asignado:** fuera del alcance del candado en v1 (caso raro, corrección de captura). Se documenta como limitación conocida; el admin debe reasignar a mano si aplica.

## 5. Cambios a la vista `players_with_category`

`create or replace view` añadiendo columnas **al final** (requisito de `or replace`):

- `c.id as category_id` — la UI lo necesita para filtrar equipos por la categoría del jugador.
- `t.id as team_id`, `t.name as team_name` — vía `left join team_players tp on tp.player_id = p.id and tp.season_id = s.id` + `left join teams t on t.id = tp.team_id`. Como la vista ya cuelga de la temporada activa (`s.is_active`), el equipo mostrado es el de la temporada activa; jugadores sin equipo → `null`.

Esto mantiene la convención existente: la lista de jugadores lee una sola vista (`security_invoker`, RLS aplica).

## 6. RLS

Idéntica al resto de tablas de liga (macro de `0002` con helpers `private.*` de `0003`), aplicada a `teams` y `team_players`:

- `SELECT`: `tenant_id = private.current_tenant_id()`.
- `INSERT` / `UPDATE` / `DELETE`: además `private.is_admin()`.

Los usuarios `readonly` ven equipos y rosters; solo los admin los modifican.

## 7. UI

Módulo nuevo `src/teams/` siguiendo las convenciones de `src/players/` (MUI, named exports, returning-fetch, tests junto al código).

### 7.1 Rutas (en `src/app/routes.tsx`)

| Ruta | Página | Acceso |
|---|---|---|
| `equipos` | `TeamsPage` — lista de equipos de la temporada activa | Autenticado |
| `equipos/:id` | `TeamDetailPage` — datos del equipo + roster | Autenticado (acciones solo admin) |
| `equipos/nuevo` | `TeamFormPage` (alta) | Admin (`RequireAdmin`) |
| `equipos/:id/editar` | `TeamFormPage` (edición) | Admin (`RequireAdmin`) |

Entrada "Equipos" en la navegación del `AppLayout`, junto a Jugadores.

### 7.2 `TeamsPage`

Equipos de la temporada activa, agrupados por categoría (orden `categories.sort_order`). Cada tarjeta/fila: nombre, color, coach, nº de jugadores. Sin temporada activa → estado vacío explicándolo. Botón "Nuevo equipo" (admin).

### 7.3 `TeamFormPage`

Crear/editar: nombre, categoría (select de `categories` del tenant), coach, color. Al editar un equipo con roster no vacío, el select de categoría se deshabilita con hint ("vacía el roster para cambiar la categoría" — el trigger del §4 lo refuerza).

### 7.4 `TeamDetailPage` — roster y "Añadir jugador"

Cabecera con los datos del equipo y, para admin, acciones **"Editar"** (link a `equipos/:id/editar`) y **"Eliminar equipo"** (confirmación que avisa que el roster se vaciará — cascade del §3.3).

Roster: lista de jugadores del equipo (nombre, edad_liga), con acción "quitar del equipo" (admin, con confirmación).

Botón **"Añadir jugador"** (admin) abre un diálogo con los jugadores **elegibles**: categoría derivada == categoría del equipo, estatus `activo`, y que **no están ya en este equipo**. Agrupados en este orden:

1. **"Sin equipo"** — asignación directa con un clic.
2. **"En otro equipo"** — cuando hay más de un equipo en la categoría, agrupados por su equipo actual (encabezado por equipo, ej. "En MTY AC Azul"), visualmente diferenciados. Seleccionar uno pide **confirmación explícita**: "Se moverá de [equipo actual] a [este equipo]". Confirmar = `update` de su fila de roster.

El diálogo incluye búsqueda por nombre (misma UX de filtro que la lista de jugadores).

### 7.5 Detalle del jugador (`PlayerFormPage`)

Sección/selector **"Equipo"**: lista los equipos de la categoría derivada del jugador en la temporada activa, más la opción "Sin equipo". **Solo en modo edición** (`jugadores/:id`): en el alta (`jugadores/nuevo`) el selector no aparece — el jugador aún no existe; se asigna después desde su edición o desde el equipo. Así se evita un insert en dos pasos con fallo parcial.

- Asignar (de vacío a equipo) = `insert` en `team_players`.
- Cambiar = `update` de la fila.
- "Sin equipo" = `delete` de la fila.
- Jugador "fuera de categoría", con estatus `baja`, o sin temporada activa → selector deshabilitado con hint (misma regla de elegibilidad que §7.4, reforzada por el trigger).
- Visible solo lectura para usuarios `readonly`.

### 7.6 Lista de jugadores (`PlayersPage`)

- Columna nueva **"Equipo"** (`team_name` de la vista; vacío si no tiene).
- Filtro por equipo, sumándose a los filtros existentes (búsqueda, categoría, etc.).
- El export a Excel (cuando exista) incluirá la columna equipo — no es parte de este slice.

## 8. Casos borde

| Caso | Comportamiento |
|---|---|
| Jugador fuera de categoría (edad_liga fuera de todo rango) | No asignable a ningún equipo. UI lo deshabilita; trigger lo rechaza. |
| Jugador con estatus `baja` | No asignable ni movible (UI + trigger). Si ya estaba en un roster y pasa a `baja`, **permanece** hasta que un admin lo quite (el `delete` no pasa por el candado). |
| Sin temporada activa | No se pueden crear equipos ni asignar. Estados vacíos con explicación. |
| Borrar equipo | Cascade vacía su roster. Confirmación en UI avisándolo. |
| Borrar jugador | Cascade lo saca del roster. |
| Cambiar categoría de equipo con roster | Rechazado (trigger + UI deshabilitada). |
| Dos admins asignan al mismo jugador a la vez | `unique (player_id, season_id)` lo hace determinista: el segundo `insert` falla; la UI muestra el error y refresca. |
| Cambio de temporada activa | Rosters anteriores quedan como historial; la nueva temporada arranca de cero. |

## 9. Testing

- **DB (vía MCP, convención pgTAP two-statement del repo):** trigger acepta asignación con categoría correcta; rechaza mismatch, fuera-de-categoría y jugador `baja`; `unique (player_id, season_id)` impide segundo equipo; mover de equipo vía `update` pasa el trigger; cascades (equipo→roster, jugador→roster); rechazo de cambio de `category_id` con roster no vacío. Limpieza de fixtures al final; `get_advisors` tras el DDL.
- **Unit (Vitest, junto al código):** `teams.ts` (fetch/agrupación por categoría, elegibles con agrupación sin-equipo/por-equipo-actual, create/update/move/remove); componentes (`TeamsPage`, `TeamFormPage`, `TeamDetailPage`, diálogo de añadir, selector en `PlayerForm`) con providers mockeados, siguiendo los tests existentes de `src/players/`.
- **Manual (browser):** flujo completo — crear equipo, asignar desde jugador, asignar/mover desde equipo con confirmación, filtro por equipo en la lista.

## 10. Fuera de alcance

- Cupo máximo por equipo.
- Coach como usuario de la app (queda texto libre).
- Gestión de rosters de temporadas no activas; UI de gestión de temporadas.
- Vista imprimible del roster.
- Revalidación automática si cambia `birth_date` de un jugador asignado (§4, limitación conocida).
- Documentos, pagos, export a Excel (fases posteriores).
