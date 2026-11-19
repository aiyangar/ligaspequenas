# Lote L — `invite-user` con body no-objeto y cambio de rol filtrado por RLS (#116, #117) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Antes de despachar:** este plan y el spec `docs/superpowers/specs/2026-11-18-tech-debt-wave3-design.md` se mergean a `develop` en un PR de docs **antes** de despachar. El implementer los lee desde su propio worktree (cortado de `origin/develop`) y marca `- [x]` ahí, en su copia del plan, al terminar cada paso.

**Goal:** Dos casos borde de Usuarios: `invite-user` responde `400 invalid_json` (con CORS) cuando el body JSON no es un objeto, en vez de caer en el 500 genérico (#116); y un cambio de rol que RLS filtra (cero filas, sin error de PostgREST) deja de verse como éxito y muestra "No tienes permiso para esta acción." (#117).

**Architecture:**
- **#116:** `http.ts` gana `parseInviteBody(raw: unknown): InviteBody | null`, puro y probado con Vitest como el resto del módulo: `null` para cualquier JSON que no sea un objeto (`null`, número, string, booleano, arreglo); para un objeto, devuelve solo sus campos `string` (`email`, `fullName`, `role`, `redirectTo`) y deja `undefined` los que no lo son. `index.ts` lo usa justo después de `req.json()`: `null` → `400 invalid_json`, igual que un JSON mal formado. Un campo no-string cae en las validaciones que ya existen (`email_required`, `full_name_required`, `invalid_role`) en vez de lanzar `TypeError` en `.trim()`.
- **#117:** `changeRole` en `UsersPage` encadena `.select('id')` (mismo patrón que `updatePayment`/`deletePayment` en `payments.ts` y `updateDocument` en `documents.ts`); con cero filas muestra `No tienes permiso para esta acción.` como alerta y no recarga. El error de PostgREST sigue mostrando `No se pudo cambiar el rol.`.
- Después del merge, el orquestador redespliega `invite-user` y prueba con curl.

**Tech Stack:** React 19.2, MUI 9, Vitest 4.1.9 + Testing Library + user-event 14, TypeScript 6 (`tsc -b`, incluye `tsconfig.functions.json`), ESLint 10, pnpm; Supabase Edge Functions (Deno) desplegadas con el CLI del repo (`--use-api`).

**Spec:** `docs/superpowers/specs/2026-11-18-tech-debt-wave3-design.md` (§1 lote L, §2 decisiones #116 y #117, §3 verificación). Reglas heredadas: `docs/superpowers/specs/2026-11-18-tech-debt-sweep-design.md` §1 y §5.

## Global Constraints

- Rama `fix/users-invite-edge-cases`, cortada de `origin/develop` (con este plan ya mergeado). Worktree: `/Users/arturoortiz/Proyectos/Personales/ligaspequenas-worktrees/users-invite-edge-cases` (lo crea el orquestador). En este plan `$WT` es esa ruta absoluta. Primera acción: `pnpm install --frozen-lockfile` dentro de `$WT`. Los tests no necesitan `.env`.
- Git: siempre `git -C $WT …`, **un comando git por llamada al shell**. Nunca `CLAUDE_GIT_OVERRIDE`. El implementer nunca hace push, PR, merge, deploy de funciones, `supabase secrets` ni ningún comando remoto de `supabase`; nunca usa el Supabase MCP. Nunca toques `/Users/arturoortiz/Proyectos/Personales/ligaspequenas` (checkout principal).
- **Nunca `git stash`**: el stash es compartido entre los worktrees que corren en paralelo y ya se pisaron trabajos así. Para descartar un cambio de un archivo usa `git -C $WT checkout -- <archivo>`; para apartarlo, `git -C $WT diff -- <archivo> > "$(mktemp)"` (fuera del repo) y luego `git apply` de ese archivo.
- **Archivos permitidos** (solo estos): `supabase/functions/invite-user/http.ts`, `supabase/functions/invite-user/http.test.ts`, `supabase/functions/invite-user/index.ts`, `src/users/UsersPage.tsx`, `src/users/UsersPage.test.tsx` y este plan. Antes de cada commit, `git -C $WT status -s` debe listar **solo** archivos de esta lista.
- **Paralelo:** L, M, N, O y P corren a la vez en worktrees distintos y no comparten archivos (verificado por el planner: L toca `supabase/functions/invite-user/*` y `src/users/*`; M `src/teams/*`; N `src/players/*` y `src/documents/documents.ts`; O `src/payments/*`; P `ops/backup/*`). Si necesitas un archivo fuera de tu lista, **detente** y avisa al orquestador.
- **Runner de la Edge Function:** el repo no usa `deno test`. `http.ts` se prueba con Vitest (lo recoge `pnpm exec vitest run`) y se typechequea con `tsconfig.functions.json` (en `tsc -b`). `index.ts` está excluido a propósito (importa `jsr:`/`npm:` y usa `Deno`): lo validan ESLint, el typecheck fuera del repo del Step 1.5 y las pruebas en vivo del orquestador.
- Código, identificadores y comentarios en inglés; sin comentarios salvo una línea corta con el *por qué*. Mensajes de commit en inglés, terminados en la línea `Claude-Session: https://claude.ai/code/session_01XWBoZQLb3ti7U2LQcagZvd`. `git add` incluye este plan para que las marcas `- [x]` queden en el commit.
- Conteos: delta sobre el baseline del Step 0 (`B_files`, `B_tests`). Referencia medida por el planner en `origin/develop` = `9669e97`: **48 archivos, 538 tests**. Este lote agrega **0 archivos y +9 tests** (Task 1: 8; Task 2: 1).

## Review Focus

- **Ningún body JSON válido tumba la función:** `null`, `42`, `"text"`, `true`, `[]` y `[{…}]` → `400 invalid_json` con CORS (Task 1, y en vivo por el orquestador para `null`, `[]` y `42`). Un JSON mal formado sigue en `400 invalid_json` (sin cambio).
- **Campos con tipo equivocado** (`{"email": 5}`, `{"role": ["admin"]}`) ya no lanzan `TypeError` en `.trim()` (500): caen en `email_required`/`full_name_required`/`invalid_role` (Task 1, `parseInviteBody drops fields that are not strings`). Es una decisión del planner (ver Discrepancias).
- **El orden de los chequeos de `index.ts` no cambia** (OPTIONS → método → origen → cliente → `Authorization` → bearer → `getUser` → perfil → body): el body se sigue leyendo solo después de autenticar al admin. El diff de `index.ts` solo toca el import y el bloque del body (Step 1.4).
- **Cero filas en el cambio de rol** → alerta de permiso, el select sigue en el rol anterior y no hay recarga (Task 2). El caso con error de PostgREST conserva su texto.
- **Un cambio de rol exitoso** sigue sin alerta y recarga la lista (test existente ampliado en Task 2).

---

## Task 0: Preparar y medir el baseline

- [x] **Step 0.1:** `git -C $WT branch --show-current` → `fix/users-invite-edge-cases`.
- [x] **Step 0.2:** `git -C $WT log --oneline origin/develop..HEAD` → vacío.
- [x] **Step 0.3:** En `$WT`: `pnpm install --frozen-lockfile` y `pnpm exec vitest run`. Anota `B_files` y `B_tests` (esperado hoy: 48 y 538, todo verde).

---

## Task 1: `invite-user` responde 400 a un body JSON que no es objeto (#116)

**Files:**
- Modify: `supabase/functions/invite-user/http.test.ts` (import l.2–9; 3 tests nuevos al final)
- Modify: `supabase/functions/invite-user/http.ts` (interfaz y función nuevas al final)
- Modify: `supabase/functions/invite-user/index.ts` (import l.4–11; bloque del body l.50–55)

**Interfaces:**
- Produces: `export interface InviteBody { email?: string; fullName?: string; role?: string; redirectTo?: string }` y `export function parseInviteBody(raw: unknown): InviteBody | null` en `http.ts`.

- [x] **Step 1.1: Escribir los tests (rojo)**

En `supabase/functions/invite-user/http.test.ts`, agrega `parseInviteBody,` al import de `./http.ts` (entre `parseBearerToken,` y `withInternalErrorResponse,`) y al final del archivo:

```ts
// each case is wrapped: test.each spreads a bare array into arguments
test.each([[null], [42], ['text'], [true], [[]], [[{ email: 'a@b.com' }]]])('parseInviteBody rejects the non-object JSON body %j', (raw) => {
  expect(parseInviteBody(raw)).toBeNull()
})

test('parseInviteBody keeps the string fields of an object body', () => {
  expect(
    parseInviteBody({ email: 'a@b.com', fullName: 'Ana', role: 'admin', redirectTo: 'https://app.example.com/auth/callback', extra: 1 }),
  ).toStrictEqual({ email: 'a@b.com', fullName: 'Ana', role: 'admin', redirectTo: 'https://app.example.com/auth/callback' })
})

test('parseInviteBody drops fields that are not strings', () => {
  const empty = { email: undefined, fullName: undefined, role: undefined, redirectTo: undefined }
  expect(parseInviteBody({ email: 5, fullName: null, role: ['admin'], redirectTo: {} })).toStrictEqual(empty)
  expect(parseInviteBody({})).toStrictEqual(empty)
})
```

Run: `pnpm exec vitest run supabase/functions/invite-user`
Expected: FAIL en los 8 tests nuevos con `TypeError: parseInviteBody is not a function` (los 6 casos aparecen como `… body null`, `42`, `"text"`, `true`, `[]`, `[{"email":"a@b.com"}]`); los 14 existentes pasan. Verificado por el planner.

- [x] **Step 1.2: Implementar `parseInviteBody`**

Al final de `supabase/functions/invite-user/http.ts`:

```ts
export interface InviteBody {
  email?: string
  fullName?: string
  role?: string
  redirectTo?: string
}

// req.json() accepts any JSON value; only an object is an invitation, and only its string fields count
export function parseInviteBody(raw: unknown): InviteBody | null {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return null
  const record = raw as Record<string, unknown>
  const text = (key: keyof InviteBody) => (typeof record[key] === 'string' ? record[key] : undefined)
  return { email: text('email'), fullName: text('fullName'), role: text('role'), redirectTo: text('redirectTo') }
}
```

Run: `pnpm exec vitest run supabase/functions/invite-user`
Expected: 3 archivos, 22 tests PASS.

- [x] **Step 1.3: Usarlo en `index.ts`**

1. En el import de `./http.ts`, después de `  parseBearerToken,` agrega:

```ts
  parseInviteBody,
  type InviteBody,
```

(mismo estilo que `import { checkAdmin, type CallerProfile } from './authorize.ts'`).

2. Reemplaza:

```ts
    let body: { email?: string; fullName?: string; role?: string; redirectTo?: string }
    try {
      body = await req.json()
    } catch {
      return json({ error: 'invalid_json' }, 400)
    }
```

por:

```ts
    let body: InviteBody | null
    try {
      body = parseInviteBody(await req.json())
    } catch {
      return json({ error: 'invalid_json' }, 400)
    }
    if (!body) return json({ error: 'invalid_json' }, 400)
```

Nada más de `index.ts` cambia.

- [x] **Step 1.4: Comprobar el diff de `index.ts`**

Run: `git -C $WT diff --stat -- supabase/functions/invite-user/index.ts`
Expected: `1 file changed, 5 insertions(+), 2 deletions(-)`.

Run: `git -C $WT diff -- supabase/functions/invite-user/index.ts` → solo el import y el bloque del body; ningún chequeo previo se movió.

- [x] **Step 1.5: Typecheck de `index.ts` fuera del repo**

`tsc -b` excluye `index.ts`. Compílalo una vez contra los tipos reales de `@supabase/supabase-js` con `Deno` simulado, en un directorio temporal **fuera** del repo (no se commitea nada):

```bash
TC=$(mktemp -d)
```

```bash
cat > "$TC/stubs.d.ts" <<'EOF'
declare module 'jsr:@supabase/functions-js/edge-runtime.d.ts' {}
declare module 'npm:@supabase/supabase-js@2' {
  export * from '@supabase/supabase-js'
}
declare const Deno: {
  serve(handler: (req: Request) => Response | Promise<Response>): void
  env: { get(name: string): string | undefined }
}
EOF
```

```bash
cat > "$TC/tsconfig.json" <<EOF
{
  "compilerOptions": {
    "target": "ES2022", "lib": ["ES2022", "DOM"], "module": "ESNext", "moduleResolution": "bundler",
    "allowImportingTsExtensions": true, "noEmit": true, "strict": true, "skipLibCheck": true,
    "noUnusedLocals": true, "noUnusedParameters": true, "types": [], "ignoreDeprecations": "6.0",
    "baseUrl": "$WT", "paths": { "@supabase/supabase-js": ["node_modules/@supabase/supabase-js"] }
  },
  "files": ["stubs.d.ts", "$WT/supabase/functions/invite-user/index.ts"]
}
EOF
```

Run (en `$WT`): `pnpm exec tsc -p "$TC/tsconfig.json"`
Expected: exit 0 sin salida (el planner corrió exactamente esto con este cambio). Después: `rm -rf "$TC"`.

Run: `pnpm exec tsc -b` → exit 0. `pnpm exec eslint supabase/functions/invite-user` → exit 0.

- [x] **Step 1.6: Commit**

`git -C $WT status -s` → solo `http.ts`, `http.test.ts`, `index.ts` y este plan.

```bash
git -C $WT add docs/superpowers/plans/2026-11-18-techdebt-l-users-invite.md supabase/functions/invite-user/http.ts supabase/functions/invite-user/http.test.ts supabase/functions/invite-user/index.ts
```

```bash
git -C $WT commit -m "fix: answer a non-object invite-user JSON body with 400 invalid_json (#116)" -m "req.json() accepts null, numbers, strings and arrays, and reading body.email on them threw into the generic 500. parseInviteBody only takes an object and only its string fields, so the body is either an invitation or invalid_json, and a wrongly typed field falls into the existing required/role checks." -m "Claude-Session: https://claude.ai/code/session_01XWBoZQLb3ti7U2LQcagZvd"
```

---

## Task 2: Un cambio de rol que RLS filtra muestra un error (#117)

**Files:**
- Modify: `src/users/UsersPage.test.tsx` (mocks l.6–26; tests `changes a user role through the MUI select` y `a failed role change shows an alert and keeps the previous role`; 1 test nuevo antes de `a failed list load shows LoadError and Reintentar reloads`)
- Modify: `src/users/UsersPage.tsx` (`changeRole`, l.104–112)

- [ ] **Step 2.1: Ajustar los mocks y escribir el test (rojo)**

En `src/users/UsersPage.test.tsx`:

1. En `vi.hoisted`, agrega `updateSelect: vi.fn(),` después de `eq: vi.fn(),`.
2. En `beforeEach`, reemplaza `  mocks.eq.mockResolvedValue({ data: null, error: null })` por:

```ts
  mocks.updateSelect.mockResolvedValue({ data: [{ id: 'u1' }], error: null })
  mocks.eq.mockReturnValue({ select: mocks.updateSelect })
```

3. En `changes a user role through the MUI select`, después de `expect(mocks.eq).toHaveBeenCalledWith('id', 'u1')` agrega:

```ts
  expect(mocks.updateSelect).toHaveBeenCalledWith('id')
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
```

4. En `a failed role change shows an alert and keeps the previous role`, reemplaza `  mocks.eq.mockResolvedValue({ data: null, error: { message: 'RLS denied' } })` por `  mocks.updateSelect.mockResolvedValue({ data: null, error: { message: 'RLS denied' } })`.
5. Justo antes de `test('a failed list load shows LoadError and Reintentar reloads'`, agrega:

```tsx
test('a role change that RLS filters out (zero rows) shows a permission alert and keeps the previous role', async () => {
  mocks.updateSelect.mockResolvedValue({ data: [], error: null })
  const user = userEvent.setup()
  render(<UsersPage />)
  await user.click(await screen.findByRole('combobox', { name: 'Rol de Ana' }))
  await user.click(await screen.findByRole('option', { name: 'Solo lectura' }))
  expect(await screen.findByRole('alert')).toHaveTextContent(/^No tienes permiso para esta acción\.$/)
  expect(screen.getByRole('combobox', { name: 'Rol de Ana' })).toHaveTextContent('Administrador')
  expect(mocks.select).toHaveBeenCalledTimes(1)
})
```

Run: `pnpm exec vitest run src/users/UsersPage.test.tsx`
Expected: FAIL en 3 tests (verificado por el planner): `changes a user role through the MUI select` (`expected "vi.fn()" to be called with arguments: [ 'id' ]`), `a failed role change shows an alert…` y `a role change that RLS filters out…` (ambos `Unable to find role="alert"`: hoy `changeRole` no encadena `.select`); 9 pasan.

- [ ] **Step 2.2: Implementar**

En `src/users/UsersPage.tsx`, dentro de `changeRole`, reemplaza:

```tsx
    const { error } = await supabase.from('profiles').update({ role: newRole }).eq('id', id)
    if (error) {
      setNotice({ severity: 'error', text: 'No se pudo cambiar el rol.' })
      return
    }
```

por:

```tsx
    const { data, error } = await supabase.from('profiles').update({ role: newRole }).eq('id', id).select('id')
    if (error) {
      setNotice({ severity: 'error', text: 'No se pudo cambiar el rol.' })
      return
    }
    // RLS filters the row instead of raising, so a forbidden change looks like a success on zero rows
    if (!data || data.length === 0) {
      setNotice({ severity: 'error', text: 'No tienes permiso para esta acción.' })
      return
    }
```

`reload()` sigue después, solo en el camino exitoso.

Run: `pnpm exec vitest run src/users/UsersPage.test.tsx`
Expected: 12 tests PASS.

- [ ] **Step 2.3: Suite completa, tipos y lint**

Run (en `$WT`): `pnpm exec vitest run` → `B_files` archivos, `B_tests + 9` tests, todo verde. `pnpm exec tsc -b` → exit 0. `pnpm lint` → exit 0 (ESLint sí lintea `index.ts`).

- [ ] **Step 2.4: Commit**

`git -C $WT status -s` → solo `UsersPage.tsx`, `UsersPage.test.tsx` y este plan.

```bash
git -C $WT add docs/superpowers/plans/2026-11-18-techdebt-l-users-invite.md src/users/UsersPage.tsx src/users/UsersPage.test.tsx
```

```bash
git -C $WT commit -m "fix: report a role change that RLS filters out instead of showing success (#117)" -m "PostgREST answers an update whose row RLS hides with no error and no rows, so the screen reloaded as if the role had changed. The update now selects the id back and treats zero rows as a permission error, like payments and documents." -m "Claude-Session: https://claude.ai/code/session_01XWBoZQLb3ti7U2LQcagZvd"
```

**Reporte al orquestador:** los 2 SHAs, `B_files`/`B_tests` y conteos finales, las salidas de los rojos (1.1, 2.1), la salida de `git diff --stat` del Step 1.4, el resultado del Step 1.5 y las tres salidas verdes del Step 2.3. El PR debe decir que `index.ts` solo se valida con el typecheck fuera del repo y en vivo, y que el orquestador anexará los curl después del redeploy.

---

## Orquestador (después de la revisión pre-PR y del merge)

Desde el checkout principal `/Users/arturoortiz/Proyectos/Personales/ligaspequenas`, con `develop` actualizado. Variable:

```bash
FN=https://eksbaugyypadtanyjcje.supabase.co/functions/v1/invite-user
```

- [ ] **O1. PR** a `develop` con `Closes #116` y `Closes #117`; merge tras revisión limpia. El cuerpo declara la decisión del planner: un campo no-string ahora responde con el código de validación del campo (400) en vez del 500.

- [ ] **O2. Token de admin sin exponerlo** (lo usa O4.c). Igual que en el lote I (O1.b): desde la sesión persistente de Playwright con sesión admin en `http://localhost:5173`, el propio script escribe `Authorization: Bearer <token>` a un archivo privado `HDR` dentro del scratchpad del orquestador (modo `0600`), sin imprimir ni devolver el token:

```js
const token = await page.evaluate(() => JSON.parse(localStorage.getItem('sb-eksbaugyypadtanyjcje-auth-token')).access_token)
require('fs').writeFileSync(process.env.HDR, `Authorization: Bearer ${token}\n`, { mode: 0o600 })
```

curl lo lee con `-H @"$HDR"`. Nunca hagas `cat`/`echo` del archivo ni pegues el token en el PR, en issues o en el chat. Al terminar O4: `rm -f "$HDR"`.

- [ ] **O3. Deploy desde `develop` actualizado:**

```bash
git -C /Users/arturoortiz/Proyectos/Personales/ligaspequenas pull --ff-only
```

```bash
pnpm exec supabase functions deploy invite-user --project-ref eksbaugyypadtanyjcje --use-api
```

Antes y después: `pnpm exec supabase functions list --project-ref eksbaugyypadtanyjcje` → `invite-user` `ACTIVE`, `VERSION` uno más que antes, `UPDATED_AT` = ahora. `ALLOWED_ORIGINS` no cambia.

- [ ] **O4. Pruebas con curl** (registrar status y headers CORS tal cual en el PR):

a. Preflight del origen permitido:

```bash
curl -s -o /dev/null -D - -X OPTIONS "$FN" -H "Origin: http://localhost:5173" -H "Access-Control-Request-Method: POST" -H "Access-Control-Request-Headers: authorization, content-type"
```

Esperado: `HTTP/2 200`, `access-control-allow-origin: http://localhost:5173`, `vary: Origin`.

b. Origen ajeno: mismo comando con `-H "Origin: https://evil.example"` → `HTTP/2 403` y **sin** `access-control-allow-origin`.

c. **Body no-objeto (#116).** Con el header de O2, tres llamadas (pasan origen, bearer, `getUser` y perfil admin, y se rechazan antes de invitar a nadie: no crean usuarios ni perfiles):

```bash
curl -s -i -X POST "$FN" -H "Origin: http://localhost:5173" -H @"$HDR" -H "Content-Type: application/json" -d 'null'
```

Repite con `-d '[]'` y con `-d '42'`. Esperado en las tres: `HTTP/2 400`, `access-control-allow-origin: http://localhost:5173`, `content-type: application/json`, cuerpo `{"error":"invalid_json"}`. Después, la query de línea base de profiles/users (spec de la ola 1, §5) no cambia.

d. Bearer malformado:

```bash
curl -s -i -X POST "$FN" -H "Origin: http://localhost:5173" -H "Authorization: Basic not-a-token" -H "Content-Type: application/json" -d '{}'
```

Esperado: `401` con `{"error":"invalid_authorization"}` y `access-control-allow-origin: http://localhost:5173` (handler) **o** un 401 del gateway (`verify_jwt`); ambos válidos.

Nota (spec §2): con `null` ya no hay forma de forzar el 500 `internal_error` de #42 desde fuera; el envoltorio sigue cubierto por sus tests unitarios en `http.test.ts`.

- [ ] **O5. #117 en vivo:** no se prueba en navegador. Para provocar cero filas habría que cambiar el rol de un usuario de otra liga o quitarse permisos: una escritura sobre usuarios reales. Lo cubren los tests de Task 2. Sin cambios visibles en Usuarios para el camino feliz.

- [ ] **O6. Rollback operativo si O4 falla:** en una rama `fix/*` nueva, `git revert -m 1 <sha del merge commit del PR>` → PR → merge → redeploy con el comando de O3. Luego reintentar en otra rama; nunca parchar hacia adelante.

---

## Discrepancias

- **Campos no-string (decisión del planner).** #116 y el spec §2 hablan de bodies que no son objeto. Un objeto con `email: 5` también lanzaba (`.trim` de un número) y caía en el 500. `parseInviteBody` resuelve los dos con la misma función: el body no-objeto da `invalid_json` (lo que pide el spec) y el campo no-string se trata como ausente, así responde `email_required`/`full_name_required`/`invalid_role` (400) con los códigos que ya existen. `redirectTo` no-string se ignora (antes se pasaba tal cual a GoTrue). Si la revisión lo considera fuera de alcance, se separa en un issue.
- **Texto de cero filas (#117).** El spec §2 da "No tienes permiso para esta acción." o el equivalente de la pantalla. La pantalla solo tenía `No se pudo cambiar el rol.` para el error de PostgREST, que no dice por qué. Se usa el texto de permiso, el mismo de `documents.ts` y de `paymentErrorMessage`; el error de PostgREST conserva el suyo.
- **Cero filas sin recarga.** `changeRole` no recarga en el caso de cero filas: el select es controlado por `u.role`, que no cambió, así que la fila ya muestra el rol anterior (el test lo fija con `select` llamado una sola vez).
