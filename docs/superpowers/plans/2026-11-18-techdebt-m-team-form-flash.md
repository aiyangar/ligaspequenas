# Lote M — El aviso de éxito de equipos se muestra una vez y no sobrevive a la recarga (#118) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Antes de despachar:** este plan y el spec `docs/superpowers/specs/2026-11-18-tech-debt-wave3-design.md` se mergean a `develop` en un PR de docs **antes** de despachar. El implementer los lee desde su propio worktree (cortado de `origin/develop`) y marca `- [x]` ahí, en su copia del plan, al terminar cada paso.

**Goal:** El mensaje de éxito que `TeamFormPage` manda al guardar (`Equipo creado` / `Cambios guardados`) se ve como toast en la página del equipo, se lee una sola vez y se borra del historial (`state: null`), así una recarga no lo repite (#118), con el mismo arreglo que #61 aplicó en `PlayerFormPage`.

**Architecture:** Hoy `TeamFormPage` navega a `/equipos/:id` con `state: { flash }`, pero **nadie lo lee**: `TeamDetailPage` no usa `useLocation` y no muestra ningún aviso, y el `state` se queda en la entrada del historial (sobrevive a recargas). El arreglo vive en el lado que recibe: `TeamDetailPage` copia el patrón de `PlayerFormPage` (`flashOf(location.state)` leído una vez en el inicializador de `useState`, un `useEffect` que hace `navigate(location.pathname, { replace: true, state: null })` cuando hay flash, y un `Snackbar` + `Alert` `success` `filled` abajo al centro con `autoHideDuration={4000}`). `TeamFormPage` no cambia: un test de contrato fija la clave `flash` y los textos que manda. La navegación de guardar no cambia (ver Discrepancias).

**Tech Stack:** React 19.2, MUI 9 (`Snackbar`, `Alert`), react-router-dom 7 (`createMemoryRouter`, `useLocation`), Vitest 4.1.9 + Testing Library + user-event 14, TypeScript 6 (`tsc -b`), ESLint 10, pnpm.

**Spec:** `docs/superpowers/specs/2026-11-18-tech-debt-wave3-design.md` (§1 lote M, §2 decisión #118, §3 verificación en navegador). Reglas heredadas: `docs/superpowers/specs/2026-11-18-tech-debt-sweep-design.md` §1 y §5. Referencia del arreglo: `src/players/PlayerFormPage.tsx` l.33–35 (`flashOf`), l.57–66 (lectura única y `replace`) y l.334–344 (`Snackbar`).

## Global Constraints

- Rama `fix/team-form-flash`, cortada de `origin/develop` (con este plan ya mergeado). Worktree: `/Users/arturoortiz/Proyectos/Personales/ligaspequenas-worktrees/team-form-flash` (lo crea el orquestador). En este plan `$WT` es esa ruta absoluta. Primera acción: `pnpm install --frozen-lockfile` dentro de `$WT`. Los tests no necesitan `.env`.
- Git: siempre `git -C $WT …`, **un comando git por llamada al shell**. Nunca `CLAUDE_GIT_OVERRIDE`. El implementer nunca hace push, PR ni merge; nunca usa el Supabase MCP ni toca la base. Nunca toques `/Users/arturoortiz/Proyectos/Personales/ligaspequenas` (checkout principal).
- **Nunca `git stash`**: el stash es compartido entre los worktrees que corren en paralelo y ya se pisaron trabajos así. Para descartar un cambio usa `git -C $WT checkout -- <archivo>`; para apartarlo, `git -C $WT diff -- <archivo> > "$(mktemp)"` (fuera del repo) y luego `git apply`.
- **Archivos permitidos** (solo estos): `src/teams/TeamDetailPage.tsx`, `src/teams/TeamDetailPage.test.tsx`, `src/teams/TeamFormPage.test.tsx` y este plan. `src/teams/TeamFormPage.tsx` **no** cambia (solo se usa en la mutación del Step 2.2, que se restaura). **No** extraigas `flashOf` a un módulo compartido: tocaría `PlayerFormPage.tsx`, que es del lote N. Antes de cada commit, `git -C $WT status -s` debe listar **solo** archivos de esta lista.
- **Paralelo:** L, M, N, O y P corren a la vez en worktrees distintos y no comparten archivos (verificado por el planner: L toca `supabase/functions/invite-user/*` y `src/users/*`; M `src/teams/*`; N `src/players/*` y `src/documents/documents.ts`; O `src/payments/*`; P `ops/backup/*`). Si necesitas un archivo fuera de tu lista, **detente** y avisa al orquestador.
- Código, identificadores y comentarios en inglés; sin comentarios salvo una línea corta con el *por qué*. Mensajes de commit en inglés, terminados en la línea `Claude-Session: https://claude.ai/code/session_01XWBoZQLb3ti7U2LQcagZvd`. `git add` incluye este plan para que las marcas `- [x]` queden en el commit.
- Conteos: delta sobre el baseline del Step 0 (`B_files`, `B_tests`). Referencia medida por el planner en `origin/develop` = `9669e97`: **48 archivos, 538 tests**. Este lote agrega **0 archivos y +6 tests** (Task 1: 4; Task 2: 2).
- **Verificación en navegador:** la hace el orquestador (sección final), no el implementer.

## Review Focus

- **El aviso se ve una vez:** al llegar con `state.flash` aparece el toast `success`; el `state` de la entrada queda en `null` y una "recarga" (nuevo router sobre la misma entrada) ya no lo muestra (Task 1).
- **Sin flash no hay toast:** abrir un equipo desde la lista o por URL no muestra ningún aviso (Task 1).
- **El contrato entre formulario y detalle** (`state: { flash: 'Equipo creado' | 'Cambios guardados' }`) queda fijado de los dos lados (Tasks 1 y 2, con mutación en 2.2).
- **El toast no tapa las acciones a 390 px** y desaparece solo a los 4 s (orquestador, en navegador).
- **Los errores de la página siguen en su `Alert` de error** (`role="alert"`, cerrable): el toast no reemplaza ni oculta `error` (el toast está fuera del flujo; ningún test existente cambia).

---

## Task 0: Preparar y medir el baseline

- [x] **Step 0.1:** `git -C $WT branch --show-current` → `fix/team-form-flash`.
- [x] **Step 0.2:** `git -C $WT log --oneline origin/develop..HEAD` → vacío.
- [x] **Step 0.3:** En `$WT`: `pnpm install --frozen-lockfile` y `pnpm exec vitest run`. Anota `B_files` y `B_tests` (esperado hoy: 48 y 538, todo verde).
- [x] **Step 0.4:** `grep -rn "flash\|useLocation" src/teams --include='*.tsx' | grep -v '\.test\.tsx'` → solo las dos líneas `navigate(…, { state: { flash: … } })` de `TeamFormPage.tsx` (l.88 y l.97) y el comentario `…never flashes…` de `AddPlayerDialog.tsx`. Confirma que hoy nadie lee el flash.

---

## Task 1: `TeamDetailPage` muestra el flash una vez y lo borra del historial

**Files:**
- Modify: `src/teams/TeamDetailPage.test.tsx` (import l.1; `renderPage` l.35–45; 4 tests nuevos al final)
- Modify: `src/teams/TeamDetailPage.tsx` (imports l.2 y l.10; `flashOf` nuevo; estado y efecto nuevos tras `loaded`; `Snackbar` al final del `return`)

- [x] **Step 1.1: Escribir los tests (rojo)**

En `src/teams/TeamDetailPage.test.tsx`:

1. Cambia `import { render, screen, waitFor } from '@testing-library/react'` por `import { cleanup, render, screen, waitFor } from '@testing-library/react'`.
2. Reemplaza `renderPage` completo por (ningún test existente usa su valor de retorno):

```tsx
function renderPage(entry: string | { pathname: string; state: unknown } = '/equipos/team9') {
  const router = createMemoryRouter(
    [
      { path: '/equipos/:id', element: <TeamDetailPage /> },
      { path: '/equipos', element: <div>lista</div> },
      { path: '/equipos/:id/editar', element: <div>editar</div> },
    ],
    { initialEntries: [entry] },
  )
  render(<RouterProvider router={router} />)
  return router
}
```

3. Al final del archivo:

```tsx
test.each(['Equipo creado', 'Cambios guardados'])('the %s flash from the team form shows as a toast', async (flash) => {
  renderPage({ pathname: '/equipos/team9', state: { flash } })
  expect(await screen.findByText(flash)).toBeInTheDocument()
  expect(screen.getByText(flash).closest('.MuiAlert-root')).toHaveClass('MuiAlert-colorSuccess')
})

test('the flash is dropped from history once shown, so a reload does not repeat it', async () => {
  const router = renderPage({ pathname: '/equipos/team9', state: { flash: 'Equipo creado' } })
  expect(await screen.findByText('Equipo creado')).toBeInTheDocument()
  await waitFor(() => expect(router.state.location.state).toBeNull())
  expect(router.state.location.pathname).toBe('/equipos/team9')
  expect(screen.getByText('Equipo creado')).toBeInTheDocument()
  cleanup()
  renderPage({ pathname: router.state.location.pathname, state: router.state.location.state })
  expect(await screen.findByText('Ana Roster')).toBeInTheDocument()
  expect(screen.queryByText('Equipo creado')).not.toBeInTheDocument()
})

test('without a flash no toast is shown', async () => {
  renderPage()
  await screen.findByText('Ana Roster')
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
})
```

(El segundo `renderPage` del test de recarga simula F5: un router nuevo sobre la entrada tal como quedó en el historial.)

Run: `pnpm exec vitest run src/teams/TeamDetailPage.test.tsx`
Expected: FAIL en 3 tests (verificado por el planner): `the Equipo creado flash…`, `the Cambios guardados flash…` y `the flash is dropped from history…`, los tres con `Unable to find an element with the text: <flash>`; los 13 restantes pasan (incluido `without a flash no toast is shown`, que es la guarda del caso sin flash).

- [x] **Step 1.2: Implementar**

En `src/teams/TeamDetailPage.tsx`:

1. Cambia `import { Link as RouterLink, useNavigate, useParams } from 'react-router-dom'` por `import { Link as RouterLink, useLocation, useNavigate, useParams } from 'react-router-dom'`, y debajo de `import Alert from '@mui/material/Alert'` agrega `import Snackbar from '@mui/material/Snackbar'`.
2. Justo antes de `export function TeamDetailPage() {` agrega:

```tsx
function flashOf(state: unknown): string | null {
  return (state as { flash?: string } | null)?.flash ?? null
}

```

3. Después de `  const navigate = useNavigate()` agrega `  const location = useLocation()`.
4. Después de `  const [loaded, setLoaded] = useState(false)` agrega (antes de `const load = useCallback`; los hooks van antes de los `return` tempranos):

```tsx
  // the team form hands over its success message in history state; it is read once here
  const [toast, setToast] = useState<string | null>(() => flashOf(location.state))
  const hasFlash = flashOf(location.state) !== null

  useEffect(() => {
    // history state survives a reload, so drop the flash once the toast holds it
    if (hasFlash) void navigate(location.pathname, { replace: true, state: null })
  }, [hasFlash, location.pathname, navigate])
```

5. En el `return` principal, después del segundo `</Dialog>` (el de "Eliminar equipo") y antes de `    </Box>`, agrega:

```tsx

      <Snackbar
        open={toast !== null}
        autoHideDuration={4000}
        onClose={() => setToast(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert onClose={() => setToast(null)} severity="success" variant="filled" sx={{ width: '100%' }}>
          {toast}
        </Alert>
      </Snackbar>
```

El toast se monta solo con la página cargada (no en "Cargando…", error ni no-encontrado); el estado `toast` se conserva mientras carga.

Run: `pnpm exec vitest run src/teams/TeamDetailPage.test.tsx`
Expected: 16 tests PASS.

Run: `pnpm exec tsc -b` → exit 0. `pnpm exec eslint src/teams` → exit 0.

- [x] **Step 1.3: Commit**

`git -C $WT status -s` → solo `TeamDetailPage.tsx`, `TeamDetailPage.test.tsx` y este plan.

```bash
git -C $WT add docs/superpowers/plans/2026-11-18-techdebt-m-team-form-flash.md src/teams/TeamDetailPage.tsx src/teams/TeamDetailPage.test.tsx
```

```bash
git -C $WT commit -m "fix: show the team form's success flash once and drop it from history (#118)" -m "TeamFormPage sent Equipo creado / Cambios guardados in router state, but the team page never read it and the state stayed on the history entry across reloads. The team page now reads it once into a toast and replaces the entry with state null, as PlayerFormPage does since #61." -m "Claude-Session: https://claude.ai/code/session_01XWBoZQLb3ti7U2LQcagZvd"
```

---

## Task 2: Test de contrato del lado del formulario

**Files:**
- Modify: `src/teams/TeamFormPage.test.tsx` (`renderAt` l.17–27; 2 tests nuevos al final)

Hoy ningún test cubre a dónde navega `TeamFormPage` al guardar ni qué `state` manda. Este test fija el contrato que Task 1 consume; pasa desde el inicio y el rojo se demuestra con mutación.

- [x] **Step 2.1: Escribir los tests**

En `src/teams/TeamFormPage.test.tsx`:

1. En `renderAt`, reemplaza `  return render(<RouterProvider router={router} />)` por:

```tsx
  render(<RouterProvider router={router} />)
  return router
```

(ningún test existente usa su valor de retorno).

2. Al final del archivo:

```tsx
test('saving hands the team page its success flash in history state', async () => {
  const user = userEvent.setup()
  const router = renderAt('/equipos/team9/editar')
  await screen.findByDisplayValue('MTY AC Rojo')
  await user.click(screen.getByRole('button', { name: 'Guardar' }))
  await waitFor(() => expect(router.state.location.pathname).toBe('/equipos/team9'))
  expect(router.state.location.state).toEqual({ flash: 'Cambios guardados' })
})

test('creating hands the new team page its success flash in history state', async () => {
  const user = userEvent.setup()
  const router = renderAt('/equipos/nuevo')
  await user.type(await screen.findByLabelText(/Nombre/), 'MTY AC Azul')
  await user.click(screen.getByRole('button', { name: 'Guardar' }))
  await waitFor(() => expect(router.state.location.pathname).toBe('/equipos/newteam'))
  expect(router.state.location.state).toEqual({ flash: 'Equipo creado' })
})
```

Run: `pnpm exec vitest run src/teams/TeamFormPage.test.tsx`
Expected: 7 tests PASS (verificado por el planner).

- [x] **Step 2.2: Mutación (rojo demostrado)**

En `src/teams/TeamFormPage.tsx` l.88, cambia temporalmente `{ state: { flash: 'Cambios guardados' } }` por `{ state: { message: 'Cambios guardados' } }`.

Run: `pnpm exec vitest run src/teams/TeamFormPage.test.tsx`
Expected: FAIL solo en `saving hands the team page its success flash in history state` (`toEqual`: `{ message: … }` vs `{ flash: … }`).

Restaura: `git -C $WT checkout -- src/teams/TeamFormPage.tsx`; `git -C $WT diff --stat -- src/teams/TeamFormPage.tsx` → vacío. Vuelve a correr → 7 PASS.

- [x] **Step 2.3: Suite completa, tipos y lint**

Run (en `$WT`): `pnpm exec vitest run` → `B_files` archivos, `B_tests + 6` tests, todo verde. `pnpm exec tsc -b` → exit 0. `pnpm lint` → exit 0.

- [x] **Step 2.4: Commit**

`git -C $WT status -s` → solo `TeamFormPage.test.tsx` y este plan.

```bash
git -C $WT add docs/superpowers/plans/2026-11-18-techdebt-m-team-form-flash.md src/teams/TeamFormPage.test.tsx
```

```bash
git -C $WT commit -m "test: pin the flash the team form hands to the team page (#118)" -m "Nothing covered where saving navigates or which state it sends, so renaming the flash key on either side would silently drop the toast again." -m "Claude-Session: https://claude.ai/code/session_01XWBoZQLb3ti7U2LQcagZvd"
```

**Reporte al orquestador:** los 2 SHAs, `B_files`/`B_tests` y conteos finales, la salida del Step 0.4, la del rojo 1.1, la de la mutación 2.2 y las tres salidas verdes del Step 2.3.

---

## Orquestador (después de la revisión pre-PR y del merge)

- [ ] **O1. PR** a `develop` con `Closes #118`. El cuerpo explica que el flash nunca se mostraba (nadie lo leía) y que el arreglo está en `TeamDetailPage`, no en `TeamFormPage` como sugería el spec §1; y que la navegación de guardar no cambió (ver Discrepancias).

- [ ] **O2. Navegador** (Playwright, sesión admin persistente, dev server en `http://localhost:5173`; desktop 1280×800 y móvil 390×844). Con un equipo de prueba creado para esto (spec §3), que se borra al final:
  1. **Crear:** Equipos → Nuevo equipo → nombre `Prueba M <fecha>`, categoría cualquiera → Guardar. Llega a `/equipos/<id>` con el toast verde `Equipo creado` abajo al centro; se va solo a los ~4 s.
  2. **Recargar** (`page.reload()`): sin toast. `await page.evaluate(() => history.state?.usr)` → `null` o `undefined`.
  3. **Editar:** Editar → cambia el coach → Guardar. Toast `Cambios guardados`. Recargar → sin toast.
  4. **Atrás** después de editar: anota a dónde lleva (hoy: al formulario de edición). Es el comportamiento previo; no es un fallo de este lote (ver Discrepancias), solo se reporta.
  5. **390 px:** el toast cabe en el ancho (sin scroll horizontal: `document.documentElement.scrollWidth <= 390`) y no tapa "Añadir jugador" de forma permanente (se cierra solo o con la ✕).
  6. Sin errores en la consola.
  7. **Limpieza:** Eliminar equipo → Eliminar. Comprueba que ya no aparece en Equipos.

---

## Discrepancias

- **Spec §1 nombra `src/teams/TeamFormPage*` y el issue dice "the flash reappears on page reload".** En `origin/develop` (`9669e97`) el flash nunca aparece: `TeamFormPage` lo manda, pero `TeamDetailPage` no lo lee (en `src/teams` solo las dos líneas que lo envían mencionan `flash`, y ningún archivo usa `useLocation`). Lo que sí sobrevive a la recarga es el `state` en el historial. El arreglo de #61 ("se lee una sola vez y se reemplaza el historial con `state: null`") vive del lado que lee, así que el lote toca `TeamDetailPage.tsx` y su test; `TeamFormPage.tsx` no cambia y solo gana un test de contrato. Nadie más en L–P toca `src/teams/*`.
- **"Guardar una edición no agrega una entrada duplicada al historial si hoy lo hace" (spec §2).** Hoy editar va `…, /equipos/:id, /equipos/:id/editar` → push `/equipos/:id`: no hay dos entradas iguales seguidas. Cambiarlo a `replace` sí dejaría dos `/equipos/:id` seguidas (Atrás no haría nada visible). Por eso la navegación no cambia; el orquestador solo observa Atrás (O2.4). Si el owner quiere que Atrás tras guardar salte el formulario, es un issue nuevo (p. ej. `navigate(-1)` cuando se llegó desde el detalle).
- **`flashOf` duplicado.** Queda una copia de 3 líneas en `TeamDetailPage` igual a la de `PlayerFormPage`. Extraerlo a un módulo compartido tocaría `PlayerFormPage.tsx` (lote N, en paralelo); se puede proponer como limpieza después de la ola.
