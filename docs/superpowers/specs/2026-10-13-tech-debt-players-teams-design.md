# Deuda técnica de Jugadores y Equipos (#8–#11) — Diseño

**Fecha:** 2026-10-13
**Estado:** Revisado (revisión adversarial 1: 1 Blocker, 4 Major, 5 Minor — todos incorporados)
**Issues:** [#8](https://github.com/aiyangar/ligaspequenas/issues/8), [#9](https://github.com/aiyangar/ligaspequenas/issues/9), [#10](https://github.com/aiyangar/ligaspequenas/issues/10), [#11](https://github.com/aiyangar/ligaspequenas/issues/11)

## 1. Contexto y objetivo

Las revisiones de los slices de jugadores (`2026-07-02-players-registry`) y equipos (`2026-07-03-sidequest-a-teams-rosters`) dejaron cuatro hallazgos no bloqueantes. Se saldan **antes** de la fase de Documentos, para que esas pantallas sean confiables antes de añadirles una sección nueva.

Objetivo: el usuario nunca ve una pantalla vacía, un "Cargando…" eterno o un formulario en blanco editable que en realidad esconden un error de carga o un registro inexistente; los filtros no dependen de nombres; el selector de equipo explica por qué está deshabilitado.

Sin cambios de base de datos. Todo es frontend + tests.

## 2. Decisiones (validadas en brainstorm)

| Decisión | Elección |
|---|---|
| Propagación de errores de lectura | La capa de datos **lanza** (`throw`) cuando Supabase devuelve `error`. `null` / `[]` significan únicamente "no hay datos". Se descartaron: devolver `{ ok, data, error }` (cambia firma de 8 funciones y todos sus llamadores) y un hook genérico `useAsync` (abstracción nueva frente al patrón ya establecido). |
| UX de error de carga | `Alert` de error con botón **Reintentar** que vuelve a cargar sin recargar la página (conserva filtros). |
| UX de registro inexistente | En la misma página: aviso "Jugador no encontrado" / "Equipo no encontrado" + botón **Volver a Jugadores** / **Volver a Equipos**. Sin redirección. |
| Inexistente vs. denegado por RLS | Se muestran igual ("no encontrado"). Intencional: no se revela la existencia de registros de otro tenant. |
| Opciones de filtros | Siguen derivándose de los jugadores cargados (sin consultas nuevas); se deduplican por id. |
| Entrega | Una rama + un PR por issue, base `develop`. Orden en §8 (los cuatro comparten `PlayerFormPage` / `PlayersPage`, así que no todo es paralelizable). |

## 3. Rutas reales (referencia)

De `src/app/routes.tsx`: la lista de jugadores es la ruta **index `/`** (no existe `/jugadores`); el detalle es `/jugadores/:id`. Equipos: `/equipos`, `/equipos/:id`, `/equipos/:id/editar`.

## 4. #11 — Selector de equipo (`fix/team-selector-guard`)

En `src/players/PlayerFormPage.tsx`:

- `teamSelectDisabled` añade `!tenantId`.
- `helperText`, en este orden de prioridad (el primero que aplique):
  1. `!canEdit` → `"Solo lectura: solo un administrador puede cambiar el equipo."`
  2. `!tenantId` → `"No hay liga activa."`
  3. Las condiciones existentes, sin cambio (fuera de categoría, sin temporada activa, jugador de baja).
- `handleTeamChange` deja de usar `tenantId!`: `if (!row || !season || !tenantId) return`.

## 5. #10 — Filtros por id (`fix/filters-by-id`)

Contexto honesto: con el esquema actual los nombres duplicados son imposibles (`unique (tenant_id, name)` en `categories`, `0006:11`; `unique (tenant_id, season_id, name)` en `teams`, `0009:17`; la vista solo une la temporada activa). Este cambio es **robustez preventiva** (no depender de una invariante de BD lejana), no un bug visible hoy.

En `src/players/PlayersPage.tsx`:

- Estado de filtros `categoryId` / `teamId` (en vez de nombre).
- Opciones: pares `{ id, name }` derivados de los jugadores cargados, deduplicados por id, ordenados por nombre. `value` = id, etiqueta = `category_name` / `team_name` (sin año ni división, igual que hoy).
- Comparación: `p.category_id !== categoryId`, `p.team_id !== teamId`.
- Las etiquetas de los filtros no cambian ("Categoría", "Equipo", "Todas"/"Todos").

## 6. #9 — Errores al cargar (`fix/list-fetch-errors`)

### 6.1 Capa de datos

Las 8 funciones de lectura lanzan `new Error(error.message)` cuando la respuesta de Supabase trae `error`:

- `src/players/players.ts`: `fetchPlayers`, `fetchPlayer`.
- `src/teams/teams.ts`: `fetchActiveSeason`, `fetchCategories`, `fetchTeams`, `fetchTeam`, `fetchRoster`, `fetchEligiblePlayers`.

Firmas sin cambio. Las mutaciones (`MutationResult`) no se tocan. Son los únicos llamadores: `PlayersPage`, `TeamsPage`, `PlayerFormPage`, `TeamFormPage`, `TeamDetailPage`, `AddPlayerDialog`.

### 6.2 Componente `LoadError`

Nuevo `src/app/LoadError.tsx`, presentacional:

- Props: `onRetry: () => void`, `message?: string` (default `"No se pudo cargar la información."`).
- Renderiza un MUI `Alert severity="error"` (ya trae `role="alert"` por defecto) con el mensaje y un `Button` **Reintentar** que llama a `onRetry`.

### 6.3 Patrón de carga (todas las páginas)

Por cada efecto de carga, un par de estados: `loadError: boolean` y `reloadKey: number`.

- `reloadKey` va en las dependencias del **`useEffect`**, nunca en las de un `useCallback` (`exhaustive-deps` lo marca como innecesario ahí). En `PlayersPage`, `TeamsPage` y `TeamDetailPage`, el `load` memoizado no cambia; el efecto pasa a depender de `[load, reloadKey]`.
- Efecto: `.then((data) => { if (!active) return; setLoadError(false); …datos… }).catch(() => { if (active) setLoadError(true) })`, conservando la bandera `active`. El `setLoadError(false)` en el `then` es asíncrono, así que no viola `react-hooks/set-state-in-effect`, y limpia el error en cualquier recarga exitosa, no solo en la que dispara Reintentar (p. ej. al reabrir `AddPlayerDialog`).
- `handleRetry`: `setLoadError(false); setReloadKey((k) => k + 1)`. El reset va en el handler, nunca de forma síncrona dentro del efecto.
- Con `loadError`, la página muestra `<LoadError onRetry={handleRetry} />` en lugar de su contenido. En `AddPlayerDialog`, dentro del `DialogContent`.

### 6.4 `PlayerFormPage`: dos cargas independientes

- Jugador: `loadError` + `reloadKey`. Si falla, `LoadError` reemplaza la página.
- Equipos + temporada (solo en edición): `teamsLoadError` + `teamsReloadKey`, cada par en las dependencias de su propio efecto. Si falla, `<LoadError message="No se pudieron cargar los equipos." onRetry={…} />` va en lugar del selector de equipo y el resto del formulario sigue usable. Reintentar ahí **no** vuelve a pedir el jugador.

### 6.5 Recargas posteriores a una mutación

Las recargas tras una escritura exitosa se envuelven en `try/catch` (hoy un rechazo ahí queda sin manejar):

- `TeamDetailPage`: `await refresh()` dentro de `handleAssign`, `handleMove` y `handleRemove`. Si falla: `setError("No se pudo actualizar la vista. Recarga la página.")` (ese `Alert` siempre es `severity="error"`).
- `PlayerFormPage`: el `fetchPlayer` tras cambiar de equipo en `handleTeamChange`. Si falla: `setMessage("Error: no se pudo actualizar la vista. Recarga la página.")`. El prefijo `Error` es obligatorio: ese `Alert` elige `severity` por `message.startsWith('Error')`.

## 7. #8 — Pantalla de "no encontrado" (`fix/not-found-state`)

Nuevo `src/app/NotFoundState.tsx`, presentacional:

- Props: `title: string`, `backTo: string`, `backLabel: string`.
- Renderiza un `Alert severity="warning"` con `title` y un `Button component={RouterLink} to={backTo}` con texto `backLabel` (patrón ya usado en `PlayersPage`).

| Página | Condición | `title` | `backLabel` | `backTo` |
|---|---|---|---|---|
| `PlayerFormPage` (edición) | `fetchPlayer(id)` → `null` | Jugador no encontrado | Volver a Jugadores | `/` |
| `TeamFormPage` (edición) | `fetchTeam(id)` → `null` | Equipo no encontrado | Volver a Equipos | `/equipos` |
| `TeamDetailPage` | `fetchTeam(id)` → `null` | Equipo no encontrado | Volver a Equipos | `/equipos` |

Estado explícito en las tres: `loaded: boolean` (+ `notFound: boolean` o `row/team === null` tras `loaded`). Hoy `TeamDetailPage` usa `team === null` como "cargando" y `PlayerFormPage` arranca con `emptyPlayer()` e ignora el `null`.

**Orden de render, idéntico en las tres:** `loadError` → `!loaded` (texto `"Cargando…"`, como `TeamFormPage`/`TeamDetailPage` hoy) → `notFound` → contenido. En `PlayerFormPage` el gating aplica solo en edición (en creación no hay carga del jugador). En `TeamFormPage`, el chequeo existente `!editing && !season` va después de `notFound` (solo aplica en creación, así que no colisionan).

Caso inalcanzable, solo documentado: en `TeamDetailPage`, si faltara `id`, `load` devuelve `null`; las rutas siempre lo proveen.

## 8. Orden de entrega

Solapamientos (verificados en revisión): #9 y #11 reescriben el mismo bloque de `PlayerFormPage` (selector, `helperText`, `handleTeamChange`); #9 y #10 tocan `PlayersPage` (envoltura del contenido vs. filtros); #8 reescribe el gating de `PlayerFormPage`; todos tocan los mismos archivos de test.

1. **Ola 1, en paralelo:** #11 y #10, ambos desde `develop`. Archivos disjuntos (`PlayerFormPage*` vs. `PlayersPage*`).
2. **Ola 2:** #9, cortado de `develop` **después** de que #10 y #11 estén mergeados ahí.
3. **Ola 3:** #8, cortado de `develop` después de que #9 esté mergeado ahí.

Ciclo por rama: implementador → revisor previo al PR. Sin Blockers/Majors → PR a `develop` (Minors/Nits se registran como issues). Con Blockers/Majors → el orquestador planea los cambios y se reinicia el ciclo; máximo 3 ciclos, luego se escala al owner. El orquestador mergea a `develop`; `develop → main` solo con confirmación del owner. Antes de cualquier merge: rebase sobre `develop` actualizado + suite completa.

## 9. Pruebas (TDD, Vitest + Testing Library)

Mismo estilo de mocks del repo (`vi.hoisted` + `vi.mock` de `../lib/supabase` en la capa de datos; de los módulos de datos en las páginas). En páginas con varias alertas posibles, buscar por `getByRole('button', { name: 'Reintentar' })` o por texto, no por `getByRole('alert')` a secas.

- **#11:** readonly ve el texto de solo lectura y el selector deshabilitado; sin `tenantId`, selector deshabilitado con "No hay liga activa.".
- **#10:** con mocks, dos jugadores con equipos de **mismo nombre e ids distintos**: filtrar por uno no muestra al otro. Mismo caso para categoría.
- **#9 capa de datos:** por cada una de las 8 funciones, "lanza cuando Supabase devuelve error".
- **#9 `LoadError`:** renderiza mensaje y llama `onRetry` al pulsar Reintentar.
- **#9 páginas:** en cada uno de los 6 componentes, un fetch rechazado muestra Reintentar; pulsarlo vuelve a llamar al fetch y, si ahora resuelve, muestra los datos y desaparece el error. `AddPlayerDialog`: falla → cerrar → reabrir → la lista aparece sin error. `PlayerFormPage`: fallo solo de equipos deja el formulario visible y Reintentar no vuelve a pedir el jugador. `TeamDetailPage` y `PlayerFormPage`: fallo de la recarga post-mutación muestra el mensaje de §6.5 (en `PlayerFormPage`, con severidad error).
- **#8:** `NotFoundState` renderiza título y enlace (test con `MemoryRouter`); las 3 páginas muestran el estado y el botón tiene `href` `/` (jugador) o `/equipos` (equipo); `TeamDetailPage` ya no queda en "Cargando…".

Cierre de cada rama: `pnpm exec vitest run`, `pnpm exec tsc -b`, `pnpm lint` en verde.

## 10. Fuera de alcance

- Issues de auth (#12–#15) — otro lote.
- Opciones de filtros desde catálogos completos (`fetchCategories` / `fetchTeams`).
- Reintentos automáticos / backoff.
- Diferenciar "no existe" de "sin permiso".
