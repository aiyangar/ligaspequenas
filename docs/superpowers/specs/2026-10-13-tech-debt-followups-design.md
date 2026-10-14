# Seguimientos de deuda técnica de Jugadores y Equipos (#17, #18, #21, #22, #25) — Diseño

**Fecha:** 2026-10-13
**Estado:** Revisado (revisión adversarial 1: 0 Blocker, 2 Major, 3 Minor, 3 Nit — todos incorporados)
**Issues:** [#25](https://github.com/aiyangar/ligaspequenas/issues/25), [#17](https://github.com/aiyangar/ligaspequenas/issues/17), [#18](https://github.com/aiyangar/ligaspequenas/issues/18), [#21](https://github.com/aiyangar/ligaspequenas/issues/21), [#22](https://github.com/aiyangar/ligaspequenas/issues/22)

## 1. Contexto y objetivo

Las revisiones previas al PR del lote anterior (`2026-10-13-tech-debt-players-teams-design.md`, issues #8–#11) dejaron cinco hallazgos Minor/Nit registrados como issues. Se saldan antes de la fase de Documentos, igual que el lote anterior.

Objetivo: una página de jugador nunca muestra los datos de otro jugador bajo su URL; un error real de una mutación nunca queda tapado por el error de la recarga posterior; un diálogo reabierto nunca muestra el error de la apertura anterior; y los tests de filtros de `PlayersPage` usan fixtures coherentes con datos reales y cubren el regreso a "Todas"/"Todos".

Sin cambios de base de datos. Todo es frontend + tests. Cada afirmación de las issues se verificó contra el código de `develop` (`c2652e8`); las cinco siguen vigentes.

## 2. Decisiones

| Decisión | Elección |
|---|---|
| #25 — reset por id en `PlayerFormPage` | **Remontar por `id`**: `PlayerFormPage` pasa a ser un envoltorio que renderiza el contenido con `key={id ?? 'new'}`. Descartados: (a) `setRow(r)` siempre + `setValues` condicional — no resuelve el destello de A mientras carga B (`loaded` sigue `true`) ni el resto del estado (`message`, `teams`, `season`, `dismissedFlashKey`); (b) reset síncrono en el efecto al cambiar `id` — prohibido por §6.3 del lote anterior (`react-hooks/set-state-in-effect`); (c) "ajustar estado durante el render" con `prevId` — más código, y no protege contra un `handleTeamChange` de A que resuelve después de navegar a B. |
| #21 — error de mutación vs. error de recarga | **Mutación fallida → mostrar su error y recargar en silencio (best-effort)**, en `handleAssign`, `handleMove` y `handleRemove`: `setError(<error de la mutación>)`, cerrar, y `try { await refresh() } catch {}` — si la recarga falla, se conserva el error real y no se muestra el de recarga. Descartados: (a) `safeRefresh` que no sobrescriba un `error` existente (`setError((prev) => prev ?? …)`) — un error anterior no descartado taparía el aviso de una recarga fallida tras una mutación **exitosa**; (b) no recargar tras el fallo — deja la vista desfasada cuando el fallo se debe a un cambio concurrente (decisión del orquestador tras la revisión adversarial). |
| #22 — error obsoleto al reabrir `AddPlayerDialog` | **Resetear en el callback de fin de transición de salida del `Dialog` (`slotProps.transition.onExited`) + estado "Cargando…"** mientras la carga está en vuelo. No en `handleClose`: resetear ahí produce un destello durante el fade de salida (~195 ms) y no cubre los cierres que inicia el padre tras asignar/mover. Solo limpiar `loadError` (sugerencia 1 de la issue) cambiaría el destello del error por "No hay jugadores elegibles." (la lista nunca se cargó), igual de engañoso; por eso se combina con la sugerencia 2. |
| #17 + #18 | Solo tests, sin código de producción. Una rama. |
| Entrega | Una rama + un PR por ítem (#17+#18 juntos), base `develop`. Los cuatro son paralelizables (§8). |

## 3. #25 — `PlayerFormPage` al cambiar de id (`fix/player-page-id-change`)

### 3.1 Contexto verificado

En `src/players/PlayerFormPage.tsx`, el efecto de carga (líneas 46–64) hace `setLoaded(true)` y luego `if (!r) return`, sin tocar `row` ni `values`. `loaded`, `row`, `values`, `message`, `teams`, `season` y `dismissedFlashKey` viven en la misma instancia mientras React Router la reutilice.

React Router reutiliza la instancia cuando la URL cambia dentro de la **misma** ruta (`jugadores/:id` → `jugadores/:id`). En la app real, `jugadores/nuevo` cuelga de `RequireAdmin` (`src/app/routes.tsx:32`) y `jugadores/:id` no (`:25`), así que nuevo ↔ detalle ya remonta; el caso afectado es detalle A → detalle B. Hoy no hay enlaces de jugador a jugador en la app, así que solo se alcanza con atrás/adelante del navegador o tecleando la URL, como dice la issue.

Consecuencias confirmadas:

- B no existe / denegado por RLS → `row` sigue siendo A, la rama `editing && !row` (línea 167) nunca se activa: A se muestra bajo la URL de B indefinidamente. Peor: con `role === 'admin'`, **Guardar** llama `updatePlayer(id /* B */, values /* de A */)`.
- B existe → `loaded` ya es `true`, así que se ve A (no "Cargando…") hasta que llega B.
- Riesgo adicional no listado en la issue: un `handleTeamChange` de A en vuelo termina con `setRow(refreshed /* A */)` después de navegar a B.

### 3.2 Comportamiento exacto

- `export function PlayerFormPage()` queda como envoltorio: lee `id` con `useParams()` y devuelve `<PlayerFormContent key={id ?? 'new'} id={id} />`. Exportación y rutas sin cambio (`routes.tsx` y los tests siguen importando `PlayerFormPage`).
- `PlayerFormContent` (no exportado) es el cuerpo actual, recibiendo `id: string | undefined` por props en lugar de llamar `useParams()`. Ningún otro cambio de lógica: el `if (!r) return` puede quedarse, porque cada id arranca con `row === null` y `loaded === false`.
- Resultado al ir de A a B en la misma instancia de ruta: la instancia de A se desmonta (los `setState` de sus promesas en vuelo quedan inertes por las banderas `active` y porque los `setState` de un componente desmontado no hacen nada); B muestra "Cargando…" → B o "Jugador no encontrado".
- Las promesas de A sí pueden tener efectos fuera de su estado: un `handleSubmit` de A en vuelo todavía puede ejecutar `navigate('/jugadores/A', …)` al resolver (el `navigate` de React Router 7 no se desactiva al desmontar). Es comportamiento previo, no una regresión; fuera de alcance.
- Guardar en edición navega a la **misma** id (`/jugadores/${id}` con `flash`): misma `key`, sin remontaje, sin recarga — igual que hoy. El toast sigue funcionando porque `flash` se deriva de `location.state`.
- Al remontar, `dismissedFlashKey` vuelve a `null`: si se regresa (atrás/adelante) a una entrada de historial que lleva `flash`, el toast se muestra otra vez. Es lo mismo que pasa hoy al reentrar a esa entrada desde otra ruta; se acepta.
- Crear navega de `nuevo` a `/jugadores/<newid>`: la `key` cambia (`'new'` → id), remonta, el toast "Jugador creado" se sigue viendo (derivado de `location.state`).
- Coste aceptado: al cambiar de id también se vuelven a pedir equipos y temporada (`fetchTeams` + `fetchActiveSeason`).

### 3.3 Tests (`src/players/PlayerFormPage.test.tsx`)

Los tests nuevos crean su propio `createMemoryRouter` (mismas rutas que `renderAt`) para poder llamar `await act(() => router.navigate('/jugadores/p2'))`.

1. **B inexistente:** `fetchPlayer` → p1 para `'p1'`, `null` para `'p2'` (`mockImplementation` por id). Render en `/jugadores/p1`, esperar "Ana Ruiz"; navegar a `/jugadores/p2` → aparece "Jugador no encontrado" y `queryByDisplayValue('Ana Ruiz')` es `null`.
2. **B existe, carga lenta:** `fetchPlayer('p2')` devuelve una promesa diferida. Tras navegar: se ve "Cargando…" y no "Ana Ruiz"; al resolver con un jugador "Beto Gómez", se ve su nombre.
3. Los tests existentes de crear/editar con toast ("Jugador creado", "Cambios guardados") siguen en verde sin cambios.

## 4. #17 + #18 — Tests de filtros de `PlayersPage` (`update/players-page-filter-tests`)

### 4.1 Contexto verificado

`src/players/PlayersPage.test.tsx`: `player()` usa `category_id: 'cat1'` por defecto (línea 23) y el `beforeEach` (línea 44) crea a Beto con `category_name: null` sin sobrescribir `category_id`. La vista `players_with_category` devuelve id y nombre juntos o ambos `null`, así que la fixture es imposible en datos reales. Con el filtro por id (`PlayersPage.tsx:73`), Beto pasaría un filtro `cat1`.

No hay ningún test que vuelva a "Todas"/"Todos" (valor `''`). El código ya es correcto: `''` es falsy y salta el predicado (`PlayersPage.tsx:73-75`).

### 4.2 Cambios (solo en el archivo de test)

1. **#17 (primer commit):** en el `beforeEach`, Beto añade `category_id: null`. Ningún test existente cambia de resultado (las opciones de categoría ya descartan pares con nombre `null`).
2. **#18 (segundo commit)**, con los datos del `beforeEach` (Ana: `cat1`, `team9`, activo; Beto: sin categoría, sin equipo, baja). Se **extienden** los tests existentes en lugar de duplicarlos (decisión del orquestador):
   - **Estatus:** el test existente "status filter narrows to activos" (`PlayersPage.test.tsx:64`) añade al final: elegir "Todos" en el select "Estatus" → Ana y Beto visibles.
   - **Equipo:** el test existente "team filter narrows to a single team" (`PlayersPage.test.tsx:80`) añade al final: elegir "Todos" en el select "Equipo" → ambos visibles.
   - **Categoría:** test **nuevo** — el único test de categoría existente ("category filter distinguishes categories that share a name") usa su propia fixture de dos categorías homónimas y no prueba el regreso con los datos del `beforeEach`. Elegir `cat1` → Beto desaparece; elegir "Todas" → Ana y Beto visibles.

Selección por etiqueta de la opción (`user.selectOptions(screen.getByLabelText('Equipo'), 'Todos')`), siempre acotada al `select` por su label, porque "Todos" existe en dos selects.

El test de categoría depende de #17: sin `category_id: null`, Beto no desaparece con `cat1` y el primer `expect` falla. Por eso van en la misma rama y en ese orden.

### 4.3 TDD

Son tests de caracterización: pasan a la primera porque el código ya es correcto. Para demostrar que no son vacíos, el implementador aplica localmente (sin commitear) una mutación que **solo rompe el regreso a `''`** y deja intacto el filtrado, y comprueba que cada paso de reset falla contra ella:

- Equipo: `onChange={(e) => e.target.value && setTeamId(e.target.value)}` (`PlayersPage.tsx:144`).
- Categoría: `onChange={(e) => e.target.value && setCategoryId(e.target.value)}` (`:117`).
- Estatus: `onChange={(e) => e.target.value && setStatus(e.target.value as PlayerStatus)}` (`:132`).

Con la mutación, elegir un valor sigue filtrando (la primera mitad del test pasa) pero "Todos"/"Todas" se ignora y Beto sigue oculto (falla el reset). No sirve quitar la guarda `teamId &&` del predicado: vacía la lista desde el inicio y el test falla antes de llegar al reset, sin probar nada sobre él. El implementador reporta las tres fallas.

## 5. #21 — `TeamDetailPage`: la recarga fallida tapa el error de la mutación (`fix/team-detail-error-overwrite`)

### 5.1 Contexto verificado

`src/teams/TeamDetailPage.tsx:106-127`: los tres handlers hacen `if (!res.ok) setError(...)` y siguen con `await safeRefresh()`; el `catch` de `safeRefresh` (línea 102) llama `setError('No se pudo actualizar la vista. Recarga la página.')` y sobrescribe la causa real. `handleDelete` (línea 129) ya hace `return` tras su error.

Cada mutación (`assignPlayer`, `movePlayer`, `removeFromRoster` en `src/teams/teams.ts:174-209`) es una sola sentencia PostgREST (insert / update / delete), así que un fallo nunca deja la escritura a medias. Un `update`/`delete` filtrado por RLS no es un error: afecta 0 filas y devuelve `ok: true`. Los errores reales son de constraint o de permisos de insert — por ejemplo, una violación de unicidad porque otro admin asignó al jugador mientras tanto. En ese caso la vista local está desfasada y recargar sí aporta.

### 5.2 Comportamiento exacto

En `handleAssign`, `handleMove` y `handleRemove`, si `!res.ok`:

1. `setError(res.error ?? <mensaje actual>)` (mensajes sin cambio: "No se pudo asignar", "No se pudo mover", "No se pudo quitar").
2. Cerrar lo que el handler ya cerraba: `setAddOpen(false)` (assign/move) o `setRemoving(null)` (remove).
3. Recarga silenciosa best-effort: `try { await refresh() } catch {}` — **no** `safeRefresh()`. Si la recarga tiene éxito, la vista se actualiza y el error de la mutación sigue visible; si falla, se ignora y el error de la mutación sigue visible (no aparece "No se pudo actualizar la vista…").
4. `return`.

Si `res.ok`: cerrar y `await safeRefresh()`, igual que hoy. `safeRefresh` no cambia.

Justificación: el error de la mutación es la causa que el usuario necesita ver, así que nada lo sobrescribe; pero un fallo por concurrencia (§5.1) implica que la vista está desfasada, así que se intenta refrescarla sin competir por el mensaje. El `catch {}` vacío necesita un comentario de una línea con el porqué (p. ej. `// Keep the mutation error; the refresh is best-effort.`).

### 5.3 Tests (`src/teams/TeamDetailPage.test.tsx`)

Reglas para estos tests:

- **Nada de mocks `*Once` que el código corregido no vaya a consumir.** `vi.clearAllMocks()` (vitest 4: `mockClear`) no vacía la cola de `*Once`; un `mockRejectedValueOnce` sobrante se filtra al siguiente test. Para hacer fallar la recarga se usa `mockRejectedValue` persistente, puesto **después** de la carga inicial; el `mockResolvedValue` del `beforeEach` lo sobrescribe en el siguiente test.
- **"El diálogo se cerró"** = `await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())` (como `TeamDetailPage.test.tsx:109`).
- Los conteos de `fetchRoster` se afirman **después** de que aparece el texto del error (`await screen.findByText(...)`), no antes.

Tests:

1. **Quitar, doble fallo (escenario de la issue):** tras la carga inicial, `removeFromRoster` → `{ ok: false, error: 'RLS denied' }` y `fetchRoster.mockRejectedValue(new Error('boom'))`. Quitar → confirmar. Se ve "RLS denied"; no se ve "No se pudo actualizar la vista. Recarga la página."; `fetchRoster` se llamó dos veces (carga inicial + recarga intentada); el diálogo se cerró.
2. **Quitar, fallo + recarga exitosa:** tras la carga inicial (Ana Roster), `removeFromRoster` → `{ ok: false, error: 'duplicate key' }` y `fetchRoster.mockResolvedValue([p({ id: 'p2', full_name: 'Beto Roster' })])` (simula un cambio concurrente). Quitar → confirmar. Se ve "duplicate key"; aparece "Beto Roster" y desaparece "Ana Roster"; no se ve "No se pudo actualizar la vista…"; el diálogo se cerró.
3. **Asignar, fallo:** `fetchEligiblePlayers` → un agente libre; `assignPlayer` → `{ ok: false, error: 'RLS denied' }`. "Añadir jugador" → clic en el jugador. Se ve "RLS denied", el diálogo se cerró y `fetchRoster` se llamó dos veces (carga inicial + recarga).
4. El test existente "a failed refresh after a mutation shows an error without losing the page" (mutación **exitosa** + recarga fallida) sigue en verde sin cambios (su `mockRejectedValueOnce` sí se consume).

`handleMove` comparte la forma exacta de `handleAssign`; no se exige test propio (pasa por el diálogo de confirmación de movimiento, sin valor adicional).

## 6. #22 — `AddPlayerDialog`: error obsoleto al reabrir (`fix/add-player-dialog-stale-error`)

### 6.1 Contexto verificado

`src/teams/AddPlayerDialog.tsx:40-57`: `loadError` solo se limpia en el `.then` de éxito (por diseño, §6.3 del lote anterior prohíbe el reset síncrono en el cuerpo del efecto). Al reabrir tras un fallo, el `LoadError` se ve hasta que resuelve la nueva carga. Además `players` sigue en `[]` (nunca se cargó), así que limpiar solo `loadError` haría aparecer "No hay jugadores elegibles." durante ese intervalo.

El diálogo es controlado: el padre (`TeamDetailPage`) maneja `open`. Se cierra por sus propios caminos (botón **Cerrar**, `Dialog onClose` por Escape / clic en el fondo) o porque el padre pone `open={false}` tras asignar/mover (`TeamDetailPage.tsx:110,117`). En este último caso `loading` quedaría en `false` y al reabrir se vería brevemente la lista anterior.

MUI 9.1.2 ya no tiene la prop `TransitionProps` en `Dialog`; las props de la transición (por defecto `Fade`) van en `slotProps.transition`. El `Modal` encadena el `onExited` del hijo con su propio `handleExited` (`createChainedFunction` en `useModal`), así que pasar `onExited` no rompe el desmontaje. La salida dura `leavingScreen` = 195 ms.

### 6.2 Comportamiento exacto

- Nuevo estado `loading: boolean`, inicial `true`.
- Efecto de carga: en el `.then`, además de lo actual, `setLoading(false)`; en el `.catch`, `setLoading(false)` y `setLoadError(true)`. Ambos asíncronos (permitidos por §6.3). Se conserva la bandera `active`.
- `handleExited()`: `setLoadError(false); setLoading(true); setSearch(''); setPending(null)`. Se pasa como `slotProps={{ transition: { onExited: handleExited } }}` en el `Dialog` exterior. Corre cuando termina el fade de salida, sea cual sea el camino de cierre (Cerrar, Escape/fondo, o cierre del padre tras asignar/mover), así que no hay destello durante el fade y al reabrir siempre arranca en "Cargando…". Es un callback, no el cuerpo de un efecto, así que §6.3 del lote anterior se cumple.
- `Dialog onClose` y el botón **Cerrar** siguen llamando `onClose` directo (sin `handleClose`). El diálogo anidado "Mover jugador" no cambia.
- `handleRetry()`: `setLoadError(false); setLoading(true); setReloadKey((k) => k + 1)`.
- Orden de render dentro del `DialogContent`: `loadError` → `<LoadError />`; `loading` → `<Typography>Cargando…</Typography>` (mismo texto que las páginas); si no, buscador + lista como hoy.

Caso límite aceptado: si el diálogo se reabre **durante** el fade de salida, la transición de salida se cancela, `onExited` no corre y se conserva el estado anterior (error o lista) hasta que resuelve la nueva carga. Requiere reabrir en menos de ~195 ms; se acepta.

### 6.3 Tests (`src/teams/AddPlayerDialog.test.tsx`)

Tras cada `rerender` con `open={false}`, el test **espera a que el diálogo salga del DOM** (`await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())`) antes de reabrir; si no, la reapertura cancela el fade y `onExited` no corre (caso límite de §6.2).

1. **Reabrir tras fallo, cerrando con Cerrar:** primera carga rechazada → se ve Reintentar; clic en **Cerrar** → `onClose` llamado una vez; `rerender` con `open={false}`, esperar salida del DOM, y reabrir con `fetchEligiblePlayers` devolviendo una promesa diferida → no hay botón Reintentar y se ve "Cargando…"; al resolver, aparece "Free Agent".
2. **Reabrir tras un cierre del padre con lista cargada:** primera carga → "Free Agent"; `rerender` con `open={false}` (sin pasar por Cerrar), esperar salida del DOM, reabrir con una promesa diferida → se ve "Cargando…" y no "Free Agent"; al resolver con otro jugador, aparece ese jugador.
3. **Carga inicial:** antes de que resuelva la primera carga se ve "Cargando…" y no "No hay jugadores elegibles.".
4. Los tests existentes siguen en verde: "a failed load offers Reintentar inside the dialog" y "reopening after a failed load shows the list without a stale error" (este último reabre en el mismo tick, cae en el caso límite y sigue siendo válido porque al final la lista aparece).

## 7. Restricciones comunes

- §6.3 del lote anterior sigue vigente: ningún `setState` síncrono en el cuerpo de un efecto; los resets van en handlers o en callbacks asíncronos. #25 lo cumple remontando; #22 resetea en `handleExited` (callback de transición) y `handleRetry`.
- Mismo estilo de mocks (`vi.hoisted` + `vi.mock` de los módulos de datos). En páginas con varias alertas, buscar por texto o por botón, no por `getByRole('alert')` a secas.
- Sin comentarios en el código salvo un "por qué" de una línea donde haga falta (p. ej. el `key` de #25).

## 8. Entrega

Archivos por rama (verificados como disjuntos):

| Rama | Issue(s) | Archivos |
|---|---|---|
| `fix/player-page-id-change` | #25 | `src/players/PlayerFormPage.tsx`, `src/players/PlayerFormPage.test.tsx` |
| `update/players-page-filter-tests` | #17, #18 | `src/players/PlayersPage.test.tsx` |
| `fix/team-detail-error-overwrite` | #21 | `src/teams/TeamDetailPage.tsx`, `src/teams/TeamDetailPage.test.tsx` |
| `fix/add-player-dialog-stale-error` | #22 | `src/teams/AddPlayerDialog.tsx`, `src/teams/AddPlayerDialog.test.tsx` |

- **Los cuatro en paralelo, todos desde `develop`.** No comparten archivos.
- Único acoplamiento de comportamiento: `TeamDetailPage` renderiza `AddPlayerDialog`, y el test 3 de #21 abre el diálogo. Tras #22 el diálogo muestra "Cargando…" antes de la lista; el test usa `findByText`, así que pasa con o sin #22. Igualmente, el segundo de los dos en mergearse hace rebase sobre `develop` y corre la suite completa.
- Un PR por rama, base `develop`, cuerpo con `Closes #N` (la rama de #17+#18 lleva `Closes #17` y `Closes #18`).
- Ciclo por rama: implementador → revisor previo al PR. Sin Blockers/Majors → PR (Minors/Nits como issues). Con Blockers/Majors → el orquestador planea los cambios y se reinicia el ciclo; máximo 3 ciclos, luego se escala al owner. El orquestador mergea a `develop`; `develop → main` solo con confirmación del owner.
- Cierre de cada rama: `pnpm exec vitest run`, `pnpm exec tsc -b`, `pnpm lint` en verde.

## 9. Preguntas abiertas / supuestos

- **#21:** tras una mutación fallida se recarga en silencio; si esa recarga también falla, el usuario solo ve el error de la mutación y la vista puede quedar desfasada sin aviso. Se acepta: el error real es lo prioritario y "Recarga la página" sigue disponible.
- **#21:** una mutación exitosa no limpia un `error` anterior que el usuario no descartó (comportamiento actual, sin cambio). Fuera de alcance; si molesta, issue aparte.
- **#22:** reabrir durante el fade de salida (< ~195 ms) conserva el estado anterior hasta que resuelve la carga (§6.2). Se acepta.
- **#25:** se acepta volver a pedir equipos y temporada en cada cambio de id (mismo coste que entrar a la página).

## 10. Fuera de alcance

- Enlaces de jugador a jugador dentro de la app.
- Reintentos automáticos / backoff.
- Cualquier cambio a `safeRefresh` o a la recarga post-mutación de `PlayerFormPage`.
