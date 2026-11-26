# Correos de Auth por Resend y dominio `littlebase.club` (#7) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Antes de despachar:** este plan y el spec `docs/superpowers/specs/2026-11-25-custom-smtp-littlebase-design.md` se mergean a `develop` en un PR de docs (rama `update/smtp-littlebase-spec`) **antes** de despachar al implementer. El implementer los lee desde su propio worktree (cortado de `origin/develop`) y marca `- [x]` ahí, en su copia del plan, al terminar cada paso. Las tareas del orquestador y del owner (Tasks 3 a 9) las marca el orquestador en una copia de `develop` actualizada, en una rama `update/smtp-littlebase-progress` que se mergea al final.

**Goal:** Los correos de Auth (invitación, magic link y, por defensa, confirmación) salen en español por Resend desde `Little Baseball Club <no-reply@littlebase.club>`, y la app pasa a `https://littlebase.club` sin que el login deje de funcionar en ningún momento.

**Architecture:** El repo solo aporta la fuente de verdad: tres plantillas HTML en `supabase/templates/`, sus asuntos y `otp_expiry` en `supabase/config.toml` (registro canónico, **nunca** se hace `config push`), una suite de Vitest que las fija, un runbook `docs/ops/auth-email.md` y tres docs actualizados. Todo lo demás es configuración remota: el owner en los Dashboards de Resend, Vercel y Supabase, y el orquestador con `dig`, `curl`, `supabase secrets set`, el redeploy de `invite-user` y la E2E con Playwright, en el orden aditivo del spec §8.

**Tech Stack:** Vitest 4 (entorno `node` en el archivo de prueba), TypeScript 6 (`tsc -b`, proyecto `tsconfig.ops.json`), ESLint 10, pnpm, Supabase CLI 2.107 (`pnpm exec supabase`), Resend SMTP, Vercel DNS/Domains, Playwright.

**Spec:** `docs/superpowers/specs/2026-11-25-custom-smtp-littlebase-design.md` (§5 plantillas, §8 secuencia de corte, §9 cambios en el repo, §10 verificación, §11 seguimientos, §12 rollback, §13 restricciones).

## Global Constraints

- **Rama del repo:** `update/custom-smtp-templates` (nombre fijado por el spec §9 y §13), cortada de `origin/develop` con este plan ya mergeado. Worktree: `/Users/arturoortiz/Proyectos/Personales/ligaspequenas-worktrees/custom-smtp-templates` (lo crea el orquestador). En este plan `$WT` es esa ruta absoluta. Primera acción: `pnpm install --frozen-lockfile` en `$WT`. Las pruebas no necesitan `.env`.
- **Git:** siempre `git -C $WT …`, **un comando git por llamada al shell**. Nunca `CLAUDE_GIT_OVERRIDE`, `--no-verify`, `--amend`, push, PR ni merge (eso es del orquestador). El implementer nunca usa el Supabase MCP, la CLI de Supabase contra el proyecto remoto, ni toca Dashboards. Nunca toques `/Users/arturoortiz/Proyectos/Personales/ligaspequenas` (checkout principal).
- **Nunca `git stash`**: el stash es compartido entre worktrees. Para descartar: `git -C $WT checkout -- <archivo>`; para apartar: `git -C $WT diff -- <archivo> > "$(mktemp)"` y luego `git -C $WT apply <ese archivo>`.
- **Archivos permitidos al implementer** (solo estos): `supabase/templates/invite.html`, `supabase/templates/magic_link.html`, `supabase/templates/confirmation.html`, `supabase/templates/templates.test.ts`, `supabase/config.toml`, `tsconfig.ops.json`, `docs/ops/auth-email.md`, `docs/security/pre-real-data-checklist.md`, `docs/plan2-bootstrap-admin.md`, `.env.example` y este plan. Antes de cada commit, `git -C $WT status -s` lista **solo** archivos de esta lista. Si hace falta otro, **detente** y avisa al orquestador.
- **No se tocan:** `src/`, `supabase/functions/`, `vercel.json`, `index.html`, `site_url`/`additional_redirect_urls`/`[auth.email.smtp]` de `config.toml`, specs y planes antiguos (spec §9).
- **Secretos (spec §13):** la API key de Resend solo existe en Resend y en el campo SMTP password de Supabase. Nunca en el repo, el chat, la shell del orquestador, `.env` ni `VITE_*`. No se crea ningún PAT. Nada de `supabase config push` ni `supabase link`. `ALLOWED_ORIGINS` se cambia con `secrets set` y no se commitea. En los docs no aparece ningún valor secreto ni un prefijo de ejemplo de key (`re_…`).
- **Copy exacto (spec §5.3):** remitente `Little Baseball Club <no-reply@littlebase.club>`; marca "Little Baseball Club"; tono de "tú"; vencimiento "1 hora". Las únicas variables de plantilla son `{{ .ConfirmationURL }}` y `{{ .Email }}`, escritas exactamente así (un espacio a cada lado). Acentos y `ñ` como caracteres UTF-8 literales, **nunca** como entidades HTML (`&oacute;`), porque la suite busca el texto literal.
- **Pie (spec §5.3):** un único `<p>` de pie con dos líneas separadas por `<br>`: `Si no esperabas este correo, puedes ignorarlo.` y `Este buzón no recibe respuestas.` Sin línea de contacto.
- Código, identificadores y comentarios en inglés; sin comentarios nuevos en código. Docs en español, como el resto de `docs/`. Mensajes de commit en inglés, enfocados en el porqué, con `Refs #7`; si el brief del orquestador da una línea `Claude-Session:`, va al final. `git add` incluye este plan para que las marcas `- [x]` queden en el commit.
- **Conteos:** delta sobre el baseline del Step 0.3. Este cambio agrega **1 archivo de prueba y 25 tests**.
- **Cierre de #7:** cuando la E2E de §10.2 queda completa y aprobada por el owner, no con el merge (spec §13). El PR usa `Refs #7`, no `Closes`.

## Review Focus

- **Bloque comentado que "pasa":** el `config.toml` ya trae `# [auth.email.template.invite]` comentado; el parser de la suite ignora las líneas que empiezan con `#`, así que un bloque sin descomentar no satisface la prueba (Task 1, `config.toml declares the %s template…`; en rojo debe fallar con el archivo tal como está hoy).
- **Entidades HTML en lugar de acentos:** `invitaci&oacute;n` rompería las búsquedas de copy y se vería distinto según el cliente; la suite exige el texto literal (Task 1, `%s.html contains its required copy`).
- **Enlace solo como botón:** un cliente que bloquea estilos o botones deja al usuario sin enlace; la suite exige `{{ .ConfirmationURL }}` también fuera de un atributo `href` (Task 1, `%s.html links {{ .ConfirmationURL }} as a button and as plain text`).
- **Agregar un contacto al pie más tarde no debe romper nada:** la suite solo pide que las dos líneas vivan en el mismo `<p>`, nunca compara el pie completo (Task 1, `%s.html keeps both footer lines in one paragraph`).
- **El check de secretos del checklist sigue verde:** la línea nueva de `.env.example` no contiene `sb_secret_`, `service_role` ni `SERVICE_ROLE` (check (3) de `pre-real-data-checklist.md`); se corre ese grep en Task 2.

---

## Task 0 [repo / implementer]: Preparar y medir el baseline

- [x] **Step 0.1:** `git -C $WT branch --show-current` → `update/custom-smtp-templates`.
- [x] **Step 0.2:** `git -C $WT log --oneline origin/develop..HEAD` → vacío. `ls $WT/docs/superpowers/plans/2026-11-25-custom-smtp-littlebase.md` existe (el plan ya está en `develop`).
- [x] **Step 0.3:** En `$WT`: `pnpm install --frozen-lockfile` y `pnpm exec vitest run`. Anota `B_files` y `B_tests` (todo verde).

---

## Task 1 [repo / implementer]: Plantillas en español, asuntos en `config.toml` y su suite

**Files:**
- Create: `supabase/templates/templates.test.ts`
- Create: `supabase/templates/invite.html`, `supabase/templates/magic_link.html`, `supabase/templates/confirmation.html`
- Modify: `supabase/config.toml` (bloque comentado `# Uncomment to customize email template` en l.246-249; `otp_expiry` en l.234 se queda en `3600`)
- Modify: `tsconfig.ops.json` (`include`)

**Interfaces:**
- Consumes: nada.
- Produces: los tres archivos HTML y los tres bloques `[auth.email.template.<name>]` que el owner copia al Dashboard en Task 6; la Task 2 (runbook) los cita por ruta.

- [x] **Step 1.1: Incluir la suite en `tsc -b`**

En `tsconfig.ops.json`, `include` pasa de `["ops/backup/**/*.ts"]` a `["ops/backup/**/*.ts", "supabase/templates/**/*.ts"]`. Es el único proyecto de `tsc -b` con tipos `node` y `vitest/globals`, que es lo que la suite usa (spec §5.4: "dentro de un tsconfig que ya cubra `tsc -b`").

- [x] **Step 1.2: Escribir la suite (rojo)**

`supabase/templates/templates.test.ts`, primera línea `// @vitest-environment node` (igual que `ops/backup/*.test.ts`). Lee con `readFileSync(new URL('./<name>.html', import.meta.url), 'utf8')` y `readFileSync(new URL('../config.toml', import.meta.url), 'utf8')`; nada de `process.cwd()`. Cada HTML se lee **dentro** de su test, no al cargar el módulo: si no, un `ENOENT` tumba el archivo entero y el rojo no muestra los 25 tests.

Helpers privados del archivo:
- `tomlTable(toml: string, header: string): Record<string, string>` — descarta las líneas cuyo primer carácter no blanco es `#`, busca la línea exacta `[<header>]` y junta los pares `key = value` (quitando comillas dobles del valor) hasta la siguiente línea que empieza con `[`. Si no hay header, devuelve `{}`.
- `flat(html: string): string` — `html.replace(/\s+/g, ' ')`, para que los saltos de línea del HTML no rompan las búsquedas.

Datos (copy exacto del spec §5.3):

```ts
const TEMPLATES = {
  invite: {
    subject: 'Te invitaron a Little Baseball Club',
    title: 'Te dieron acceso a Little Baseball Club',
    body: 'Un administrador te invitó a la app de Little Baseball Club con el correo {{ .Email }}. Para entrar, abre este enlace:',
    button: 'Aceptar invitación',
    note: 'El enlace es válido por 1 hora y solo se puede usar una vez. Después, para entrar, pide un enlace nuevo en la pantalla de inicio de sesión.',
  },
  magic_link: {
    subject: 'Tu enlace para entrar a Little Baseball Club',
    title: 'Tu enlace de acceso',
    body: 'Pediste entrar a Little Baseball Club con {{ .Email }}.',
    button: 'Entrar',
    note: 'El enlace es válido por 1 hora y solo se puede usar una vez. Si ya no sirve, pide otro desde la pantalla de inicio de sesión.',
  },
  confirmation: {
    subject: 'Confirma tu correo en Little Baseball Club',
    title: 'Confirma tu correo',
    body: 'Para activar tu acceso a Little Baseball Club con {{ .Email }}, abre este enlace:',
    button: 'Confirmar y entrar',
    note: 'El enlace es válido por 1 hora y solo se puede usar una vez.',
  },
} as const
const NAMES = Object.keys(TEMPLATES) as (keyof typeof TEMPLATES)[]
```

Pruebas (todas `test.each(NAMES)` salvo la de `otp_expiry`):

| Nombre | Aserciones |
|---|---|
| `config.toml declares the %s template with a branded subject` | `tomlTable(toml, 'auth.email.template.' + name)`: `subject` === `TEMPLATES[name].subject` y contiene `Little Baseball Club`; `content_path` === `./supabase/templates/${name}.html`; `existsSync(new URL('../../' + content_path.slice(2), import.meta.url))` es `true`. |
| `config.toml keeps otp_expiry at 3600` | `tomlTable(toml, 'auth.email').otp_expiry` === `'3600'`. |
| `%s.html is a Spanish full HTML document` | `/^<!doctype html>/i` al inicio (tras `trimStart()`), contiene `<html lang="es">` y `<meta charset="utf-8">` (regex sin distinguir mayúsculas). |
| `%s.html links {{ .ConfirmationURL }} as a button and as plain text` | regex `<a\b[^>]*href="\{\{ \.ConfirmationURL \}\}"[^>]*>\s*<button>\s*</a>` (con el `button` del template escapado) hace match en `flat(html)`; y `html.replace(/href="\{\{ \.ConfirmationURL \}\}"/g, '')` todavía contiene `{{ .ConfirmationURL }}`. |
| `%s.html uses only allowed template variables` | cada match de `/\{\{\s*([\s\S]*?)\s*\}\}/g` tiene grupo 1 en `['.ConfirmationURL', '.Email']`; y hay al menos un match. |
| `%s.html has no scripts, remote images, external stylesheets or http:// links` | no hace match ninguno de `/<script/i`, `/<img\b[^>]*\bsrc=["']?(https?:)?\/\//i`, `/<link\b[^>]*stylesheet/i`, `/http:\/\//i`. |
| `%s.html contains its required copy` | `flat(html)` contiene `title`, `body` y `note` del template, `Little Baseball Club` y `1 hora`. |
| `%s.html keeps both footer lines in one paragraph` | `flat(html)` hace match de `/<p\b[^>]*>(?:(?!<\/p>).)*Si no esperabas este correo, puedes ignorarlo\.(?:(?!<\/p>).)*Este buzón no recibe respuestas\.(?:(?!<\/p>).)*<\/p>/`. Nada más sobre el pie. |
| `%s.html does not mention Liga MTY AC` | no contiene `Liga MTY AC`. |

Total: 8 × 3 + 1 = **25 tests**.

Run: `pnpm exec vitest run supabase/templates`
Expected: `Tests  24 failed | 1 passed (25)`. Las 21 de HTML fallan con `ENOENT`, las 3 de `config.toml declares…` con un `AssertionError` (`expected undefined to be …`), y pasa solo `config.toml keeps otp_expiry at 3600` (es un pin del valor que ya existe). Si alguna otra pasa, el parser no está ignorando el bloque comentado: corrígelo antes de seguir.

- [x] **Step 1.3: Asuntos en `config.toml`**

Reemplaza las cuatro líneas que empiezan en `# Uncomment to customize email template` (l.246-249) por los tres bloques del spec §5.2, sin comentarios, en este orden: `invite`, `magic_link`, `confirmation`, cada uno con `subject` y `content_path` exactamente como en el spec. Deja intactos `otp_expiry = 3600`, el bloque comentado `[auth.email.smtp]` y el de `[auth.email.notification.password_changed]`.

Comprobación: `git -C $WT diff -- supabase/config.toml` muestra solo ese bloque (4 líneas fuera, 11 dentro incluidas 2 líneas en blanco entre bloques).

- [x] **Step 1.4: Las tres plantillas**

Mismo esqueleto para las tres; solo cambian `title`, `body`, `button` y `note` de la tabla de datos del Step 1.2:

- `<!doctype html>`, `<html lang="es">`, `<head>` con `<meta charset="utf-8">`, `<meta name="viewport" content="width=device-width, initial-scale=1">` y `<title>` = el `title` del template.
- `<body style="margin:0;padding:0;background:#f4f4f5;">` con una `<table role="presentation" width="100%">` exterior y una interior centrada de `max-width:480px`, fondo `#ffffff`, `padding:32px 24px`, `border-radius:8px`. Fuente en cada bloque de texto: `font-family:Arial,Helvetica,sans-serif;color:#1f2937;`.
- En orden: `<h1>` con el `title` (`font-size:22px`); `<p>` con el `body`; el botón `<a href="{{ .ConfirmationURL }}" style="display:inline-block;background:#6d28d9;color:#ffffff;text-decoration:none;font-weight:bold;padding:12px 24px;border-radius:6px;">` con el `button` como único texto; `<p>` pequeño (`font-size:13px;color:#4b5563`) con `Si el botón no funciona, copia y pega este enlace en tu navegador:`; `<p style="font-size:13px;word-break:break-all;">{{ .ConfirmationURL }}</p>` (texto plano, sin `<a>`); `<p>` con el `note`; `<hr>` (`border:none;border-top:1px solid #e5e7eb`); y el `<p>` de pie (`font-size:12px;color:#6b7280`) con las dos líneas de Global Constraints separadas por `<br>`.
- Cada oración del copy va completa dentro de un mismo elemento, sin etiquetas en medio (nada de `<strong>{{ .Email }}</strong>`), para que la búsqueda literal funcione.
- Sin `<style>` en `<head>`, sin imágenes, sin `<script>`, sin enlaces externos.

- [x] **Step 1.5: Verde**

Run: `pnpm exec vitest run supabase/templates` → `Tests  25 passed (25)`.

- [x] **Step 1.6: Suite completa, tipos y lint**

Run (en `$WT`): `pnpm exec vitest run` → `B_files + 1` archivos, `B_tests + 25` tests, todo verde. `pnpm exec tsc -b` → exit 0. `pnpm lint` → exit 0.

- [x] **Step 1.7: Commit**

`git -C $WT status -s` → solo los 6 archivos de esta task y este plan.

```bash
git -C $WT add docs/superpowers/plans/2026-11-25-custom-smtp-littlebase.md supabase/templates/templates.test.ts supabase/templates/invite.html supabase/templates/magic_link.html supabase/templates/confirmation.html supabase/config.toml tsconfig.ops.json
```

```bash
git -C $WT commit -m "feat: version Spanish auth email templates in the repo (Refs #7)" -m "Invite, magic link and confirmation emails were Supabase's English defaults and lived only in the Dashboard. The templates and their subjects now live in the repo as the source the owner pastes into the Dashboard, and a suite pins the required copy, the allowed variables and the plain-text fallback link so a careless edit cannot ship a broken login email."
```

---

## Task 2 [repo / implementer]: Runbook `docs/ops/auth-email.md` y docs al dominio nuevo

**Files:**
- Create: `docs/ops/auth-email.md`
- Modify: `docs/security/pre-real-data-checklist.md:86`
- Modify: `docs/plan2-bootstrap-admin.md` (paso 1 y sección "Configuración operativa requerida")
- Modify: `.env.example` (lista de secretos, l.7-16)

**Interfaces:**
- Consumes: rutas y asuntos de Task 1.
- Produces: el runbook que el owner y el orquestador siguen en Tasks 3 a 9.

- [ ] **Step 2.1: Runbook**

`docs/ops/auth-email.md`, mismo estilo que `docs/ops/backups.md` (título `# Correos de Auth por Resend (#7) — Runbook`, primera línea con enlaces al spec y a este plan). Secciones, en este orden:

1. **Configuración vigente:** remitente `Little Baseball Club <no-reply@littlebase.club>`; host `smtp.resend.com`, puerto `465`, usuario `resend`; minimum interval 60 s; `rate_limit_email_sent` = 30/hora; "Email OTP Expiration" = 3600 s; Site URL `https://littlebase.club`; Redirect URLs; tracking de Resend apagado; DNS de Resend (los 4 registros del spec §2). Dónde vive cada secreto: API key de Resend (nombre `supabase-auth-smtp`, permiso Sending access, restringida al dominio) solo en Resend y en el campo SMTP password de Supabase; `ALLOWED_ORIGINS` solo como secreto de la Edge Function. **Ningún valor secreto.**
2. **Plantillas:** cuáles están en el repo y por qué (tabla corta del spec §5.1); cómo re-aplicarlas: por cada una, copiar el `subject` de `supabase/config.toml` y el HTML completo del archivo en `develop` al Dashboard (Authentication → Emails → Templates). Nunca `supabase config push` (subiría `site_url = 127.0.0.1`).
3. **Agregar una línea de contacto al pie:** insertar `<br>` + la línea dentro del `<p>` de pie de las tres plantillas, correr la suite y volver a pegar en el Dashboard.
4. **Secuencia de corte:** la tabla del spec §8 (pasos 0 a 11) como procedimiento, con su comprobación.
5. **Verificación:** el script de curl del spec §10.1 y la lista E2E de §10.2.
6. **Rollback:** R1 a R5 y vencimiento, del spec §12.
7. **Operación:** el disparador del plan de Resend (uso diario cerca de 100 correos; vigilar el dashboard de Resend); **no usar "Send password recovery"** del Dashboard (la app es passwordless y la plantilla `recovery` no está traducida); un invitado que nunca abrió su invitación y no recibe enlace al pedirlo desde `/login` se resuelve con una re-invitación desde Usuarios (`inviteUserByEmail` sobre un usuario sin confirmar reenvía la invitación); para el primer admin, "Send invitation" del Dashboard.

Comprobación: `grep -nE 're_[A-Za-z0-9]|sb_secret_|service_role|eyJ' $WT/docs/ops/auth-email.md` → vacío.

- [ ] **Step 2.2: Docs al dominio nuevo**

1. `docs/security/pre-real-data-checklist.md` l.86: `base=https://ligaspequenas.vercel.app` → `base=https://littlebase.club`.
2. `docs/plan2-bootstrap-admin.md`: en el paso 1, "Captura email + contraseña (o usa "Send invitation")" pasa a "Usa **Send invitation** (manda la invitación en español; la app no usa contraseñas)". En "Redirect allowlist", la lista queda `http://localhost:5173/auth/callback` y `https://littlebase.club/auth/callback`. El bullet **Email** pasa a: "SMTP propio por Resend; ver `docs/ops/auth-email.md`."
3. `.env.example`: debajo del bullet de `invite-user` agrega `# - API key de Resend (SMTP de los correos de Auth): solo en Supabase → Authentication → Emails → SMTP Settings. Nunca en .env ni en VITE_*. Ver docs/ops/auth-email.md.` Sin variable nueva.

Comprobación:
- `grep -rn 'vercel.app' $WT/docs/security/pre-real-data-checklist.md $WT/docs/plan2-bootstrap-admin.md $WT/.env.example $WT/docs/ops/auth-email.md` → solo menciones de la ventana de transición en el runbook (pasos 5, 6, 7, 11 y R2/R5), ninguna en los otros tres archivos.
- `grep -nE 'sb_secret_|service_role|SERVICE_ROLE' $WT/.env.example` → vacío (check (3) del checklist sigue verde).

- [ ] **Step 2.3: Suite, tipos y lint**

Run: `pnpm exec vitest run` → mismos conteos que en 1.6, todo verde. `pnpm exec tsc -b` → exit 0. `pnpm lint` → exit 0.

- [ ] **Step 2.4: Commit**

`git -C $WT status -s` → solo los 4 archivos de esta task y este plan.

```bash
git -C $WT add docs/superpowers/plans/2026-11-25-custom-smtp-littlebase.md docs/ops/auth-email.md docs/security/pre-real-data-checklist.md docs/plan2-bootstrap-admin.md .env.example
```

```bash
git -C $WT commit -m "docs: runbook for Resend auth email and the littlebase.club origin (Refs #7)" -m "The SMTP and Auth settings live only in Dashboards, so the runbook records the current values, where each secret lives, the cutover order, verification and rollback. The bootstrap and security docs now point at the new production origin and the custom SMTP instead of the built-in mailer."
```

**Reporte del implementer al orquestador:** los 2 SHAs, `B_files`/`B_tests` y conteos finales, la salida del rojo 1.2, las salidas verdes de 1.6 y 2.3, y las comprobaciones `grep` de 2.1 y 2.2.

---

## Task 3 [orchestrator]: Revisión, PR y gates previos (spec §8 pasos 0 y 1)

- [ ] **Step 3.1:** Revisión pre-PR del branch `update/custom-smtp-templates` (ciclo implementer → reviewer, máximo 3 vueltas). Abrir los tres HTML en Playwright (`file://`) y tomar captura de cada uno para la revisión visual.
- [ ] **Step 3.2 (paso 0):** PR a `develop` con `Refs #7`; CI verde; merge. Comprobación: `git -C <checkout> log origin/develop -1` contiene el merge y `pnpm exec vitest run supabase/templates` en `develop` → 25 passed.
- [ ] **Step 3.3 (paso 1):** DNS de Resend:

```bash
dig +short TXT resend._domainkey.littlebase.club
dig +short MX send.littlebase.club
dig +short TXT send.littlebase.club
dig +short TXT _dmarc.littlebase.club
```

Esperado: una clave DKIM `p=…`; `10 feedback-smtp.us-east-1.amazonses.com.`; `"v=spf1 include:amazonses.com ~all"`; `"v=DMARC1; p=none;"`. Si algo no coincide, **detente** y avisa al owner; no se avanza.

- [ ] **Step 3.4 (baseline CORS):** correr el script del spec §10.1 **antes** de tocar el secreto. Esperado hoy: `localhost:5173` y `ligaspequenas.vercel.app` → 200 con su origen; `littlebase.club` y `evil.example` → 403. Esta salida es la referencia de R4 (valor previo de `ALLOWED_ORIGINS` = `http://localhost:5173,https://ligaspequenas.vercel.app`; confirmarlo con la salida). Guardarla para el handoff.

---

## Task 4 [owner]: Resend y Vercel (spec §8 pasos 2 y 3)

El orquestador le pasa al owner estos pasos y espera su confirmación de cada uno.

- [ ] **Step 4.1 (paso 2):** Resend → Domains → `littlebase.club` → **Verify** (región `us-east-1`). Confirmar que click tracking y open tracking están **apagados**. Crear la API key: permiso **Sending access**, restringida a `littlebase.club`, nombre `supabase-auth-smtp`. No se copia a ningún lado salvo al campo SMTP password del paso 7 (Task 6). Comprobación: el dominio aparece *Verified*. Si no verifica: no avanzar; revisar Task 3.3.
- [ ] **Step 4.2 (paso 3):** Vercel → proyecto de la app → Settings → Domains: agregar `littlebase.club` y `www.littlebase.club` con redirección **308** a `littlebase.club`. **No** tocar env vars. Comprobación: Task 5.1. Rollback si falla: R2.

---

## Task 5 [orchestrator]: Dominio vivo y CORS (spec §8 pasos 4 y 5)

- [ ] **Step 5.1 (paso 4):**

```bash
curl -sI https://littlebase.club/ | head -1
curl -sI https://littlebase.club/auth/callback | head -1
curl -sI https://www.littlebase.club/ | grep -iE '^HTTP|^location'
diff <(curl -s https://littlebase.club/ | grep -oE '/assets/[^"]+\.js' | sort -u) <(curl -s https://ligaspequenas.vercel.app/ | grep -oE '/assets/[^"]+\.js' | sort -u)
```

Esperado: `HTTP/2 200`; `HTTP/2 200`; `HTTP/2 308` con `location: https://littlebase.club/`; `diff` vacío. Si algo falla: **R2** (no seguir).

- [ ] **Step 5.2 (paso 5, secreto):** `pnpm exec supabase secrets set ALLOWED_ORIGINS="http://localhost:5173,https://ligaspequenas.vercel.app,https://littlebase.club" --project-ref eksbaugyypadtanyjcje`.
- [ ] **Step 5.3 (paso 5, redeploy):** desde un worktree limpio en `origin/develop` actualizado (sin cambios de código en la función): `pnpm exec supabase functions deploy invite-user --project-ref eksbaugyypadtanyjcje --use-api`.
- [ ] **Step 5.4 (paso 5, CORS):** script del spec §10.1. Esperado: `littlebase.club`, `ligaspequenas.vercel.app` y `localhost:5173` → 200 con su propio `Access-Control-Allow-Origin`; `evil.example` → 403 sin esa cabecera. Guardar la salida tal cual para el handoff. Si un origen legítimo da 403: **R4** (volver al valor de Task 3.4 y repetir).

---

## Task 6 [owner]: Supabase Auth (spec §8 pasos 6 a 9)

- [ ] **Step 6.1 (paso 6):** Authentication → URL Configuration → Redirect URLs: **agregar** `https://littlebase.club/auth/callback`; conservar `https://ligaspequenas.vercel.app/auth/callback` y `http://localhost:5173/auth/callback`. Site URL **no** se cambia todavía. Comprobación: la lista tiene las 3 URLs.
- [ ] **Step 6.2 (paso 7):** Authentication → Emails → SMTP Settings: activar SMTP propio; sender email `no-reply@littlebase.club`, sender name `Little Baseball Club`, host `smtp.resend.com`, port `465`, username `resend`, password = API key de Task 4.1, minimum interval 60 s. Guardar. Inmediatamente, pedir un magic link desde `https://ligaspequenas.vercel.app/login` con el correo del owner. Comprobación: llega de `Little Baseball Club <no-reply@littlebase.club>` y el enlace loguea. Si no llega en 2 minutos: **R1**.
- [ ] **Step 6.3 (paso 8, plantillas):** Authentication → Emails → Templates: para *Invite user*, *Magic link* y *Confirm signup*, pegar el `subject` de `supabase/config.toml` y el HTML completo del archivo correspondiente de `develop` (el orquestador puede pasarle al owner la ruta o el contenido del archivo; no hay secretos). Guardar cada una. Si una plantilla rompe el enlace: **R3**.
- [ ] **Step 6.4 (paso 8, vencimiento y límite):** Authentication → Providers → Email → "Email OTP Expiration" = `3600`. Authentication → Rate Limits → "Rate limit for sending emails" = `30`.
- [ ] **Step 6.5 (paso 9):** Site URL → `https://littlebase.club`. Comprobación: Task 7. Si el dominio nuevo falla: **R2**.

---

## Task 7 [orchestrator + owner]: E2E en navegador (spec §10.2)

Playwright del orquestador con Chromium persistente: un contexto para el admin y otro para el usuario readonly de prueba, ambos sobre `https://littlebase.club` (son sesiones nuevas: `localStorage` es por origen). Los enlaces de correo los abre el owner desde su bandeja **dentro** de la ventana de Playwright correspondiente; nunca se pegan en el chat. Cada paso se marca solo con su evidencia.

- [ ] **Step 7.1 (admin):** magic link del admin en `https://littlebase.club/login` → entra y ve **Usuarios** (spec §10.2.5; va primero porque la invitación lo necesita).
- [ ] **Step 7.2 (invitación):** como admin → Usuarios → invitar `<owner>+lp-smtp1@gmail.com`, rol readonly. Evidencia de red: `invite-user` → 200 con `Access-Control-Allow-Origin: https://littlebase.club`. El owner confirma: bandeja de entrada (no spam), remitente `Little Baseball Club <no-reply@littlebase.club>`, asunto `Te invitaron a Little Baseball Club`, copy de §5.3 incluido "válido por 1 hora".
- [ ] **Step 7.3 (cabeceras):** el owner copia de Gmail → "Mostrar original" las líneas `SPF: PASS`, `DKIM: PASS` (`d=littlebase.club`) y `DMARC: PASS`, y `Authentication-Results` con `smtp.mailfrom=…send.littlebase.club`. Van al handoff.
- [ ] **Step 7.4 (aterrizaje):** el enlace de la invitación, abierto en el contexto readonly, pasa por `…supabase.co/auth/v1/verify` y termina en `https://littlebase.club/auth/callback#access_token=…`; la app navega a `/` como readonly: sin pestaña Usuarios y sin acciones de escritura.
- [ ] **Step 7.5 (magic link recurrente):** cerrar sesión readonly → `/login` con el mismo correo → llega `Tu enlace para entrar a Little Baseball Club` → el enlace loguea.
- [ ] **Step 7.6 (origen viejo):** login por magic link desde `https://ligaspequenas.vercel.app` → aterriza en `https://ligaspequenas.vercel.app/auth/callback` y entra.
- [ ] **Step 7.7 (`www`):** `https://www.littlebase.club/login` → redirige a `https://littlebase.club/login`.
- [ ] **Step 7.8 (correo desconocido):** pedir enlace para un correo inexistente → mensaje neutral; el owner confirma que el log de Resend no muestra envío.
- [ ] **Step 7.9 (invitado sin confirmar):** invitar `<owner>+lp-smtp2@gmail.com` (readonly), **no** abrir esa invitación, pedir enlace desde `/login` para ese alias. `LoginPage` muestra el mensaje neutral. Registrar en el handoff cuál ocurrió: (a) sin correo ni envío en Resend → re-invitar y comprobar que llega `Te invitaron a Little Baseball Club` y loguea; (b) llega `Confirma tu correo en Little Baseball Club` en español y loguea como readonly; (c) llega la plantilla de magic link y loguea. Cualquier otro resultado (inglés, enlace que no loguea, error visible) es rojo: se investiga con `superpowers:systematic-debugging` antes de cerrar #7.
- [ ] **Step 7.10 (limpieza):** borrar los usuarios `+lp-smtp1` y `+lp-smtp2` y sus profiles con el procedimiento de datos de prueba vigente. Comprobación (Supabase MCP `execute_sql`): `select count(*) from auth.users where email like '%+lp-smtp%'` → 0 y lo mismo en `profiles` por esos ids → 0.
- [ ] **Step 7.11 (handoff):** comentario en #7 con: salidas de Task 3.4 y 5.4, cabeceras de 7.3, resultado de 7.9 y la lista de verificaciones manuales hechas por el owner. Esperar su aprobación explícita.

---

## Task 8 [owner]: Aviso a usuarios (spec §8 paso 10)

- [ ] **Step 8.1:** avisar que la app ahora está en `https://littlebase.club` y que cada usuario debe pedir un magic link nuevo una vez en el dominio nuevo; la sesión en `vercel.app` sigue sirviendo hasta el paso 11.

---

## Task 9 [orchestrator]: Seguimientos y cierre de #7

- [ ] **Step 9.1:** abrir los issues del spec §11 y agregarlos al board `aiyangar/projects/2`:
  1. **Dominio del enlace y pre-fetch de Safe Links** — `{{ .ConfirmationURL }}` apunta a `eksbaugyypadtanyjcje.supabase.co`; opciones: add-on Custom Domain de Supabase (pago) o enlaces `{{ .RedirectTo }}?token_hash={{ .TokenHash }}&type=…` con `verifyOtp` en `AuthCallbackPage`.
  2. **Endurecer DMARC** — `rua=mailto:<buzón externo>` y `p=quarantine` tras 2 a 4 semanas de pases limpios.
  3. **Cerrar la ventana de transición de `ligaspequenas.vercel.app` (T+14 días)** — incluye el paso 11 del spec §8 (secreto `ALLOWED_ORIGINS="http://localhost:5173,https://littlebase.club"` + curl §10.1 con vercel.app → 403, y el owner quita `https://ligaspequenas.vercel.app/auth/callback` de Redirect URLs; condición: *Last sign in* de los usuarios activos posterior al paso 9; rollback R5) y la redirección por host en `vercel.json` del spec §11.3 (rama y PR propios, verificación `curl -sI https://ligaspequenas.vercel.app/login` → 308 a `https://littlebase.club/login`, confirmar antes en la documentación vigente de Vercel que `has` con `type: "host"` aplica al dominio `vercel.app` de producción). Fecha objetivo: 2026-12-09 o después, nunca antes de 24 h después de Task 6.5.
- [ ] **Step 9.2:** cerrar #7 cuando se cumplen **todos**: PR de Task 1-2 mergeado a `develop`; Tasks 3 a 7 marcadas con evidencia; el owner aprobó el handoff de 7.11; Task 7.9 terminó en (a), (b) o (c); limpieza de 7.10 en cero; los tres issues de 9.1 abiertos. El paso 11 **no** bloquea el cierre: vive en el issue 9.1.3.
- [ ] **Step 9.3:** mergear la rama de progreso `update/smtp-littlebase-progress` (este plan con las marcas `- [x]` de Tasks 3 a 9) a `develop` por PR.

---

## Discrepancias y decisiones del planner

- **Ubicación de la suite (decisión del planner, pedida por el spec §5.4).** `supabase/templates/templates.test.ts` junto a las plantillas, incluida en `tsconfig.ops.json`. Ningún tsconfig de `tsc -b` cubre hoy `supabase/templates/`; `tsconfig.ops.json` es el único con tipos `node` + `vitest/globals`. Ampliar su `include` es una línea; meter la prueba en `ops/backup/` o en `src/` (sin tipos `node`) sería peor.
- **Diseño visual (el spec §5.3 lo deja al plan):** tabla de una columna, 480 px, fondo `#f4f4f5`, tarjeta blanca, botón `#6d28d9`, todo inline. Se añade la línea de apoyo `Si el botón no funciona, copia y pega este enlace en tu navegador:` antes de la URL en texto plano; no está en el spec pero no contradice ningún texto obligatorio.
- **Orden de la E2E:** el login del admin (§10.2.5) va primero, porque la invitación (§10.2.1) necesita un admin con sesión en el dominio nuevo.
- **Rama de progreso del orquestador:** las marcas de Tasks 3 a 9 no caben en la rama del implementer (ya mergeada en Task 3.2), así que van en `update/smtp-littlebase-progress` (Task 9.3).
- **Nombre de rama:** se usa `update/custom-smtp-templates`, como fija el spec §9 y §13.
