# Deuda técnica de Jugadores y Equipos (#8–#11) — Diseño

**Fecha:** 2026-10-13
**Estado:** Borrador para revisión
**Issues:** [#8](https://github.com/aiyangar/ligaspequenas/issues/8), [#9](https://github.com/aiyangar/ligaspequenas/issues/9), [#10](https://github.com/aiyangar/ligaspequenas/issues/10), [#11](https://github.com/aiyangar/ligaspequenas/issues/11)

## 1. Contexto y objetivo

Las revisiones de los slices de jugadores (`2026-07-02-players-registry`) y equipos (`2026-07-03-sidequest-a-teams-rosters`) dejaron cuatro hallazgos no bloqueantes. Se saldan **antes** de la fase de Documentos, para que esas pantallas sean confiables antes de añadirles una sección nueva.

Objetivo: el usuario nunca ve una pantalla vacía, un "Cargando…" eterno o un formulario en blanco editable que en realidad esconden un error de carga o un registro inexistente; los filtros no se confunden con nombres repetidos; el selector de equipo explica por qué está deshabilitado.

Sin cambios de base de datos. Todo es frontend + tests.

## 2. Decisiones (validadas en brainstorm)

| Decisión | Elección |
|---|---|
| Propagación de errores de lectura | La capa de datos **lanza** (`throw`) cuando Supabase devuelve `error`. `null` / `[]` significan únicamente "no hay datos". Se descartaron: devolver `{ ok, data, error }` (cambia firma de 8 funciones y todos sus llamadores) y un hook genérico `useAsync` (abstracción nueva frente al patrón ya establecido). |
| UX de error de carga | `Alert` de error con botón **Reintentar** que vuelve a cargar sin recargar la página (conserva filtros). |
| UX de registro inexistente | En la misma página: aviso "Jugador no encontrado" / "Equipo no encontrado" + botón **Volver a Jugadores** / **Volver a Equipos**. Sin redirección. |
| Inexistente vs. denegado por RLS | Se muestran igual ("no encontrado"). Intencional: no se revela la existencia de registros de otro tenant. |
| Opciones de filtros | Siguen derivándose de los jugadores cargados (sin consultas nuevas); se deduplican por id. |
| Entrega | Una rama + un PR por issue. #9, #10, #11 en paralelo; #8 se corta desde la rama de #9 (depende de que los errores ya no se confundan con `null`). |

## 3. #9 — Errores al cargar (`fix/list-fetch-errors`)

### 3.1 Capa de datos

Las 8 funciones de lectura lanzan `new Error(error.message)` cuando la respuesta de Supabase trae `error`:

- `src/players/players.ts`: `fetchPlayers`, `fetchPlayer`.
- `src/teams/teams.ts`: `fetchActiveSeason`, `fetchCategories`, `fetchTeams`, `fetchTeam`, `fetchRoster`, `fetchEligiblePlayers`.

Firmas sin cambio (`Promise<T[]>` / `Promise<T | null>`). Las mutaciones (`MutationResult`) no se tocan.

### 3.2 Componente `LoadError`

Nuevo `src/app/LoadError.tsx`, presentacional:

- Props: `onRetry: () => void`, `message?: string` (default `"No se pudo cargar la información."`).
- Renderiza un `Alert severity="error"` (con `role="alert"`) con el mensaje y un `Button` **Reintentar** que llama a `onRetry`.

### 3.3 Patrón en los componentes que cargan

En `PlayersPage`, `TeamsPage`, `PlayerFormPage`, `TeamFormPage`, `TeamDetailPage` y `AddPlayerDialog`:

- Estado `loadError: boolean` y contador `reloadKey: number` incluido en las dependencias del efecto de carga.
- El efecto pasa de `.then(...)` a `.then(...).catch(() => { if (active) setLoadError(true) })`, conservando la bandera `active` existente.
- `handleRetry` hace `setLoadError(false)` y `setReloadKey((k) => k + 1)`. El reset se hace en el handler, **no** de forma síncrona dentro del efecto (la regla `react-hooks/set-state-in-effect` del repo lo prohíbe).
- Con `loadError`, la página muestra `<LoadError onRetry={handleRetry} />` en lugar de su contenido (o de "Cargando…"). En `AddPlayerDialog` el `LoadError` va dentro del `DialogContent`.
- `PlayerFormPage` tiene dos cargas (jugador; equipos + temporada). Si falla la del jugador, se reemplaza la página. Si falla solo la de equipos/temporada, se muestra `LoadError` en lugar del selector de equipo y el resto del formulario sigue usable.

### 3.4 Recargas posteriores a una mutación

Las recargas tras una escritura exitosa (`refresh()` en `TeamDetailPage`, `fetchPlayer` tras cambiar equipo en `PlayerFormPage`) atrapan el error y lo muestran en el `Alert` de mensajes que la página ya tiene ("No se pudo actualizar la vista. Recarga la página."), sin reemplazar la pantalla.

## 4. #8 — Pantalla de "no encontrado" (`fix/not-found-state`, desde `fix/list-fetch-errors`)

Nuevo `src/app/NotFoundState.tsx`, presentacional:

- Props: `title: string`, `backTo: string`, `backLabel: string`.
- Renderiza un `Alert severity="warning"` con `title` y un `Button` (`component={RouterLink}`) a `backTo` con texto `backLabel`.

Uso, cuando la lectura del registro termina con `null` (no con error):

| Página | Condición | Título | Botón |
|---|---|---|---|
| `PlayerFormPage` (edición) | `fetchPlayer(id)` → `null` | Jugador no encontrado | Volver a Jugadores → `/jugadores` |
| `TeamFormPage` (edición) | `fetchTeam(id)` → `null` | Equipo no encontrado | Volver a Equipos → `/equipos` |
| `TeamDetailPage` | `fetchTeam(id)` → `null` | Equipo no encontrado | Volver a Equipos → `/equipos` |

Hoy `TeamDetailPage` usa `team === null` para "cargando"; se separan los estados con un `loaded` explícito, para distinguir "cargando" de "no existe". `PlayerFormPage` no renderiza el formulario hasta resolver la carga en modo edición (evita el destello de formulario vacío).

## 5. #10 — Filtros por id (`fix/filters-by-id`)

En `PlayersPage`:

- Estado de filtros `categoryId` / `teamId` (en vez de nombre).
- Opciones: pares `{ id, name }` derivados de los jugadores cargados, deduplicados por id, ordenados por nombre. `value` = id, etiqueta = nombre.
- Comparación: `p.category_id !== categoryId`, `p.team_id !== teamId`.
- Las etiquetas visibles de los filtros no cambian ("Categoría", "Equipo", "Todas"/"Todos").

## 6. #11 — Selector de equipo (`fix/team-selector-guard`)

En `PlayerFormPage`:

- `teamSelectDisabled` añade `!tenantId`.
- `helperText`, en este orden de prioridad (el primero que aplique):
  1. `!canEdit` → "Solo lectura: solo un administrador puede cambiar el equipo."
  2. `!tenantId` → "No hay liga activa."
  3. Las condiciones existentes, sin cambio (fuera de categoría, sin temporada activa, jugador de baja).
- `handleTeamChange` deja de usar `tenantId!`: retorna temprano si falta `tenantId`.

## 7. Pruebas (TDD, Vitest + Testing Library)

Mismo estilo de mocks del repo (`vi.hoisted` + `vi.mock` de `../lib/supabase` en la capa de datos, de los módulos de datos en las páginas).

- **#9 capa de datos:** por cada una de las 8 funciones, "lanza cuando Supabase devuelve error".
- **#9 `LoadError`:** renderiza mensaje y llama `onRetry` al pulsar Reintentar.
- **#9 páginas:** en cada uno de los 6 componentes, un fetch rechazado muestra el `Alert` con Reintentar; pulsar Reintentar vuelve a llamar al fetch y, si ahora resuelve, muestra los datos. `PlayerFormPage`: fallo solo de equipos/temporada deja el formulario visible.
- **#8:** `NotFoundState` renderiza título y enlace; las 3 páginas muestran el estado y el botón enlaza a la lista; `TeamDetailPage` ya no queda en "Cargando…".
- **#10:** dos jugadores en equipos distintos con **el mismo nombre de equipo** (ids distintos): filtrar por uno no muestra al otro. Mismo caso para categoría.
- **#11:** readonly ve el texto de solo lectura y el selector deshabilitado; sin `tenantId` el selector está deshabilitado con "No hay liga activa.".

Cierre de cada rama: `pnpm exec vitest run`, `pnpm exec tsc -b`, `pnpm lint` en verde.

## 8. Fuera de alcance

- Issues de auth (#12–#15) — otro lote.
- Opciones de filtros desde catálogos completos (`fetchCategories` / `fetchTeams`) en lugar de jugadores cargados.
- Reintentos automáticos / backoff.
- Diferenciar "no existe" de "sin permiso".
