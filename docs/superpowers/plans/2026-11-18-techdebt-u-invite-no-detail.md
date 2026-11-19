# Lote U — `invite-user` deja de devolver `detail` (#147) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Antes de despachar:** este plan y el spec `docs/superpowers/specs/2026-11-18-tech-debt-wave4-design.md` se mergean a `develop` en un PR de docs **antes** de despachar. El implementer los lee desde su propio worktree (cortado de `origin/develop`) y marca `- [x]` ahí, en su copia del plan, al terminar cada paso.

**Goal:** Las respuestas `invite_failed` (400) y `profile_insert_failed` (500) de `invite-user` dejan de llevar el texto de GoTrue/PostgREST en `detail`; ese texto se registra del lado del servidor con `console.error` (logs de la función, solo en el dashboard) y el cliente recibe solo el código estable (#147).

**Architecture:** `http.ts` gana `failureBody(error, message, extra?)`, puro salvo por el `console.error`, probado con Vitest como `withInternalErrorResponse` y `rollbackInvitedUser`: registra ``console.error(`invite-user ${error}`, { message })`` y devuelve `{ error, ...extra }`. `index.ts` lo usa en los tres `return` que hoy arman `detail` (`invite_failed`; `profile_insert_failed` con y sin `rollback: 'failed'`). El orden de los chequeos de `index.ts` no cambia. La UI de Usuarios solo lee `error` (verificado: `grep -rn "detail\|rollback" src/users` → sin salida).

**Tech Stack:** Vitest 4.1.9, TypeScript 6 (`tsc -b`, incluye `tsconfig.functions.json`), ESLint 10, pnpm; Supabase Edge Functions (Deno) desplegadas con el CLI del repo (`--use-api`).

**Spec:** `docs/superpowers/specs/2026-11-18-tech-debt-wave4-design.md` (§1 lote U, §2 decisión #147, §3 verificación). Reglas heredadas: `docs/superpowers/specs/2026-11-18-tech-debt-sweep-design.md` §1 y §5. Antecedente: `docs/superpowers/plans/2026-11-18-techdebt-l-users-invite.md` (typecheck fuera del repo y curl).

## Global Constraints

- Rama `fix/invite-user-no-detail`, cortada de `origin/develop` (con este plan ya mergeado). Worktree: `/Users/arturoortiz/Proyectos/Personales/ligaspequenas-worktrees/invite-user-no-detail` (lo crea el orquestador). En este plan `$WT` es esa ruta absoluta. Primera acción: `pnpm install --frozen-lockfile` dentro de `$WT`. Los tests no necesitan `.env`.
- Git: siempre `git -C $WT …` (un hook bloquea `cd … && git …`), **un comando git por llamada al shell**. Nunca `CLAUDE_GIT_OVERRIDE`. El implementer nunca hace push, PR, merge, deploy de funciones, `supabase secrets` ni ningún comando remoto de `supabase`; nunca usa el Supabase MCP. Nunca toques `/Users/arturoortiz/Proyectos/Personales/ligaspequenas` (checkout principal).
- **Nunca `git stash`**: el stash es compartido entre los worktrees que corren en paralelo y ya se pisaron trabajos así. Para descartar un cambio usa `git -C $WT checkout -- <archivo>`; para apartarlo, `git -C $WT diff -- <archivo> > "$(mktemp)"` (fuera del repo) y luego `git -C $WT apply <ese archivo>`.
- **Archivos permitidos** (solo estos): `supabase/functions/invite-user/http.ts`, `supabase/functions/invite-user/http.test.ts`, `supabase/functions/invite-user/index.ts` y este plan. `src/users/*` **no** se toca (solo se lee para la comprobación). Antes del commit, `git -C $WT status -s` debe listar **solo** archivos de esta lista.
- **Paralelo:** Q, S, T, U y V corren a la vez y no comparten archivos (verificado por el planner: Q `src/players/*`; S `ops/backup/*`; T `src/payments/*` y `src/documents/*`; U los 3 de arriba; V dos `.md` de 2026-10-16). R va después de Q y no toca estos archivos. Si necesitas un archivo fuera de tu lista, **detente** y avisa al orquestador.
- **Runner de la Edge Function:** `http.ts` se prueba con Vitest y se typechequea con `tsconfig.functions.json` (en `tsc -b`). `index.ts` está excluido (importa `jsr:`/`npm:` y usa `Deno`): lo validan ESLint, el typecheck fuera del repo del Step 1.4 y las pruebas en vivo del orquestador.
- Código, identificadores y comentarios en inglés; sin comentarios salvo una línea corta con el *por qué*. Mensajes de commit en inglés, terminados en la línea `Claude-Session: https://claude.ai/code/session_01XWBoZQLb3ti7U2LQcagZvd`. `git add` incluye este plan para que las marcas `- [x]` queden en el commit.
- Conteos: delta sobre el baseline del Step 0. Referencia medida por el planner en `origin/develop` = `5effa8f`: **48 archivos, 566 tests**; `supabase/functions`: 3 archivos, 22 tests. Este lote agrega **0 archivos y +3 tests**.

## Review Focus

- **Ningún texto de GoTrue/PostgREST sale en el cuerpo** de `invite_failed` ni de `profile_insert_failed`: `toStrictEqual` sobre el cuerpo exacto, y `JSON.stringify` sin el mensaje (Task 1).
- **El texto sigue disponible para diagnosticar:** `console.error('invite-user <code>', { message })` en los dos casos (Task 1). `rollbackInvitedUser` sigue registrando su propio fallo (sin cambio).
- **`rollback: 'failed'` se conserva** en `profile_insert_failed` cuando el rollback falla (Task 1).
- **`inviteError` nulo con `invited.user` ausente** (`message` `undefined`) no rompe: cuerpo `{ error: 'invite_failed' }` (Task 1).
- **Nada más de `index.ts` cambia:** status (400/500/409), `email_exists`, orden de chequeos y CORS iguales; diff de 4 inserciones y 3 borrados (Step 1.3). La UI de Usuarios no lee `detail` (Step 1.3).

---

## Task 0: Preparar y medir el baseline

- [x] **Step 0.1:** `git -C $WT branch --show-current` → `fix/invite-user-no-detail`.
- [x] **Step 0.2:** `git -C $WT log --oneline origin/develop..HEAD` → vacío.
- [x] **Step 0.3:** En `$WT`: `pnpm install --frozen-lockfile`, `pnpm exec vitest run` (anota `B_files`, `B_tests`; esperado 48 y 566) y `pnpm exec vitest run supabase/functions` (3 archivos, 22 tests).

---

## Task 1: `failureBody` y respuestas sin `detail` (#147)

**Files:**
- Modify: `supabase/functions/invite-user/http.test.ts` (import; 3 tests nuevos al final)
- Modify: `supabase/functions/invite-user/http.ts` (tipo y función nuevos al final)
- Modify: `supabase/functions/invite-user/index.ts` (import de `./http.ts`; los 3 `return` con `detail`)

**Interfaces:**
- Produces: en `http.ts`, `export type UpstreamFailure = 'invite_failed' | 'profile_insert_failed'` y `export function failureBody(error: UpstreamFailure, message: string | undefined, extra: { rollback?: 'failed' } = {}): { error: UpstreamFailure; rollback?: 'failed' }`.

- [x] **Step 1.1: Escribir los tests (rojo)**

En `supabase/functions/invite-user/http.test.ts`, agrega `failureBody,` al import de `./http.ts` justo después de `corsHeaders,`, y al final del archivo (el `afterEach` existente ya hace `vi.restoreAllMocks()`):

```ts
test('failureBody answers invite_failed with the code only and logs the upstream message', () => {
  const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
  const body = failureBody('invite_failed', 'Database error saving new user')
  expect(body).toStrictEqual({ error: 'invite_failed' })
  expect(JSON.stringify(body)).not.toContain('Database error')
  expect(errorSpy).toHaveBeenCalledWith('invite-user invite_failed', { message: 'Database error saving new user' })
})

test('failureBody answers profile_insert_failed with the code and the rollback flag only', () => {
  const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
  const message = 'duplicate key value violates unique constraint "profiles_pkey"'
  expect(failureBody('profile_insert_failed', message)).toStrictEqual({ error: 'profile_insert_failed' })
  expect(failureBody('profile_insert_failed', message, { rollback: 'failed' })).toStrictEqual({
    error: 'profile_insert_failed',
    rollback: 'failed',
  })
  expect(errorSpy).toHaveBeenCalledTimes(2)
  expect(errorSpy).toHaveBeenCalledWith('invite-user profile_insert_failed', { message })
})

test('failureBody logs a missing upstream message as undefined', () => {
  const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
  expect(failureBody('invite_failed', undefined)).toStrictEqual({ error: 'invite_failed' })
  expect(errorSpy).toHaveBeenCalledWith('invite-user invite_failed', { message: undefined })
})
```

Run: `pnpm exec vitest run supabase/functions/invite-user`
Expected (verificado por el planner): FAIL en los 3 tests nuevos con `TypeError: failureBody is not a function`; 22 pasan.

- [x] **Step 1.2: Implementar `failureBody`**

Al final de `supabase/functions/invite-user/http.ts` agrega el tipo `UpstreamFailure` y la función `failureBody` con las firmas del bloque Interfaces. Cuerpo: ``console.error(`invite-user ${error}`, { message })`` y `return { error, ...extra }`. Un comentario de una línea encima de la función: `// GoTrue and PostgREST text stays in the function logs; the client only needs the stable code`.

Run: `pnpm exec vitest run supabase/functions/invite-user` → 3 archivos, 25 tests PASS.

- [x] **Step 1.3: Usarlo en `index.ts` y comprobar**

1. En el import de `./http.ts`, agrega `  failureBody,` justo después de `  corsHeaders,`.
2. Reemplaza los tres `return`:
   - `return json({ error: 'invite_failed', detail: inviteError?.message }, 400)` → `return json(failureBody('invite_failed', inviteError?.message), 400)`
   - `return json({ error: 'profile_insert_failed', detail: insertError.message, rollback: 'failed' }, 500)` → `return json(failureBody('profile_insert_failed', insertError.message, { rollback: 'failed' }), 500)`
   - `return json({ error: 'profile_insert_failed', detail: insertError.message }, 500)` → `return json(failureBody('profile_insert_failed', insertError.message), 500)`

Nada más de `index.ts` cambia.

Comprobaciones:
- `grep -n "detail" $WT/supabase/functions/invite-user/index.ts` → sin salida.
- `git -C $WT diff --stat -- supabase/functions/invite-user/index.ts` → `1 file changed, 4 insertions(+), 3 deletions(-)`.
- `grep -rn "detail\|rollback" $WT/src/users` → sin salida (la UI solo lee `error`: `src/users/inviteUser.ts` toma `body.error` y `UsersPage.tsx` lo pasa a `inviteErrorText`).

- [x] **Step 1.4: Typecheck de `index.ts` fuera del repo**

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

- [x] **Step 1.5: Suite completa, tipos y lint**

Run (en `$WT`): `pnpm exec vitest run` → `B_files` archivos, `B_tests + 3` tests, todo verde (planner: 48 y 569). `pnpm exec tsc -b` → exit 0. `pnpm lint` → exit 0 (ESLint sí lintea `index.ts`).

- [x] **Step 1.6: Commit**

`git -C $WT status -s` → solo `http.ts`, `http.test.ts`, `index.ts` y este plan.

```bash
git -C $WT add docs/superpowers/plans/2026-11-18-techdebt-u-invite-no-detail.md supabase/functions/invite-user/http.ts supabase/functions/invite-user/http.test.ts supabase/functions/invite-user/index.ts
```

```bash
git -C $WT commit -m "fix: stop returning upstream detail text from invite-user failures (#147)" -m "invite_failed and profile_insert_failed forwarded GoTrue and PostgREST messages to the caller. The client only reads the error code, so the message now goes to the function logs and the response keeps the code and the rollback flag." -m "Claude-Session: https://claude.ai/code/session_01XWBoZQLb3ti7U2LQcagZvd"
```

**Reporte al orquestador:** el SHA, `B_files`/`B_tests` y conteos finales, la salida del rojo 1.1, las tres comprobaciones del Step 1.3, el resultado del Step 1.4 y las salidas verdes de 1.5. El PR debe decir que `index.ts` solo se valida con el typecheck fuera del repo y en vivo.

---

## Orquestador (después de la revisión pre-PR y del merge)

Desde el checkout principal `/Users/arturoortiz/Proyectos/Personales/ligaspequenas`, con `develop` actualizado. Variable:

```bash
FN=https://eksbaugyypadtanyjcje.supabase.co/functions/v1/invite-user
```

- [ ] **O1. PR** a `develop` con `Closes #147`; merge tras revisión limpia.

- [ ] **O2. Token de admin sin exponerlo** (lo usa O4.c). Como en el lote L (O2): desde la sesión persistente de Playwright con sesión admin en `http://localhost:5173`, el propio script escribe `Authorization: Bearer <token>` a un archivo privado `HDR` dentro del scratchpad del orquestador (modo `0600`), sin imprimir ni devolver el token:

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

Además, comprueba que el código desplegado es el nuevo: con el Supabase MCP, `get_edge_function` de `invite-user` → los archivos contienen `failureBody` y ninguno contiene `detail:`. (Alternativa sin MCP: `pnpm exec supabase functions download invite-user --project-ref eksbaugyypadtanyjcje --use-api` en un directorio temporal fuera del repo, `grep -rn "failureBody"` → con salida, `grep -rn "detail:"` → sin salida; borra el directorio después.)

- [ ] **O4. Pruebas con curl** (registrar status y headers CORS tal cual en el PR):

a. Preflight del origen permitido:

```bash
curl -s -o /dev/null -D - -X OPTIONS "$FN" -H "Origin: http://localhost:5173" -H "Access-Control-Request-Method: POST" -H "Access-Control-Request-Headers: authorization, content-type"
```

Esperado: `HTTP/2 200`, `access-control-allow-origin: http://localhost:5173`, `vary: Origin`.

b. Origen ajeno: mismo comando con `-H "Origin: https://evil.example"` → `HTTP/2 403` y **sin** `access-control-allow-origin`.

c. Body `null` con el header de O2 (pasa origen, bearer, `getUser` y perfil admin, y se rechaza antes de invitar a nadie):

```bash
curl -s -i -X POST "$FN" -H "Origin: http://localhost:5173" -H @"$HDR" -H "Content-Type: application/json" -d 'null'
```

Esperado: `HTTP/2 400`, `access-control-allow-origin: http://localhost:5173`, `content-type: application/json`, cuerpo `{"error":"invalid_json"}`. Después, la query de línea base de profiles/users (spec de la ola 1, §5) no cambia.

d. Bearer malformado:

```bash
curl -s -i -X POST "$FN" -H "Origin: http://localhost:5173" -H "Authorization: Basic not-a-token" -H "Content-Type: application/json" -d '{}'
```

Esperado: `401` con `{"error":"invalid_authorization"}` y `access-control-allow-origin: http://localhost:5173` (handler) **o** un 401 del gateway (`verify_jwt`); ambos válidos.

Nota (spec §2): `invite_failed` y `profile_insert_failed` **no** se provocan en vivo (crearían o fallarían invitaciones reales); los cubren los tests de Task 1.

- [ ] **O5. Rollback operativo si O4 falla:** en una rama `fix/*` nueva, `git revert -m 1 <sha del merge commit del PR>` → PR → merge → redeploy con el comando de O3. Luego reintentar en otra rama; nunca parchar hacia adelante.

---

## Discrepancias

- **Helper en `http.ts` en vez de inline (decisión del planner).** El spec dice que los casos `invite_failed`/`profile_insert_failed` "quedan cubiertos por tests", pero `index.ts` no tiene runner de tests. Extraer `failureBody` a `http.ts` (permitido por el spec §1: "+ `http.ts`/tests si aplica") deja el cuerpo exacto y el log bajo Vitest; `index.ts` solo cambia tres `return` y un import.
- **Formato del log.** Se sigue el de `withInternalErrorResponse` y `rollbackInvitedUser` (`'invite-user <evento>'`, `{ message }`), sin el `userId` ni el correo: el correo es dato personal y no hace falta para diagnosticar un fallo de GoTrue/PostgREST.
- **`rollback: 'failed'` se queda.** No es texto de terceros sino una bandera fija nuestra, y el issue solo habla de `detail`.
