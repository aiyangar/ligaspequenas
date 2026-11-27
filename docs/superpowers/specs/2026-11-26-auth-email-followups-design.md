# Seguimientos del corte SMTP / `littlebase.club` (#172–#176) — Diseño

**Fecha:** 2026-11-26
**Estado:** Decisiones del orquestador (tomadas de las correcciones que sugiere cada issue y de las convenciones del repo); revisables por el owner.
**Contexto:** cinco seguimientos chicos que dejaron la revisión pre-PR de #171 y el corte de #7 (spec `docs/superpowers/specs/2026-11-25-custom-smtp-littlebase-design.md`, plan `docs/superpowers/plans/2026-11-25-custom-smtp-littlebase.md`, runbook `docs/ops/auth-email.md`).
**Relacionados, fuera de alcance:** #177 (dominio del enlace / Safe Links), #178 (endurecer DMARC) y #179 (paso 11: cerrar la ventana de `ligaspequenas.vercel.app`, no antes del 2026-12-09). Los tres esperan decisiones del owner o una fecha. #179 depende de #172: el paso 11 se corre con los comandos completos que deja este cambio.

## 1. Issues y lotes

| Lote | Rama | Issues | Archivos |
|---|---|---|---|
| A | `update/auth-email-runbook-followups` | #172, #176 | `docs/ops/auth-email.md` |
| B | `fix/auth-email-templates-outlook` | #173 | `supabase/templates/{invite,magic_link,confirmation}.html`, `supabase/templates/templates.test.ts` |
| C | `update/env-example-wrap` | #174 | `.env.example` |
| D | `fix/checklist-secret-grep` | #175 | `docs/security/pre-real-data-checklist.md` |

#172 y #176 tocan el mismo archivo (el runbook), así que van juntos en el lote A. A, B, C y D no comparten archivos y van en paralelo en una sola ola. El plan de este spec tampoco lo commitea ningún implementer: las marcas de avance las junta el orquestador en una rama de progreso (la define el plan).

## 2. Hechos verificados (develop `8a6a70a`)

- **DNS de Resend en vivo (verificado el 2026-11-25):** CNAME `send` → `send.forge.rmta.net`; CNAME `rsend` → `rsend.forge.rmta.net`; TXT `resend._domainkey` (DKIM, sin cambios); TXT `_dmarc` = `v=DMARC1; p=none;`. Ya **no** hay MX ni TXT en `send`: un CNAME no puede convivir con otros registros en el mismo nombre. El runbook §1 (tabla DNS) y §4 paso 1 (`dig`) todavía listan el MX y el TXT viejos.
- **Runbook, `ALLOWED_ORIGINS`:** el paso 5 (l.78) ya usa el comando completo y redeploya `invite-user`. El paso 11 (l.84), R4 (l.120) y R5 (l.121) no: usan `secrets set ALLOWED_ORIGINS=…` abreviado (sin `pnpm exec supabase` ni `--project-ref`; el proyecto no está linkeado, así que copiar y pegar falla) y sin redeploy (un isolate caliente puede seguir con el valor viejo y el curl de §5.1 engaña).
- **Caché de plantillas:** después de cambiar una plantilla, GoTrue siguió sirviendo la versión anterior de `magic_link` entre 7 y 27 minutos. `invite` y `confirmation`, que nunca se habían usado, se aplicaron al instante. Desde la E2E del 2026-11-25 **las tres** ya se usaron, así que hoy las tres pueden quedar en caché.
- **Cómo se aplicaron las plantillas:** por la Management API de Supabase (`PATCH https://api.supabase.com/v1/projects/eksbaugyypadtanyjcje/config/auth`, campos `mailer_subjects_<name>` y `mailer_templates_<name>_content`) con el token de login de la CLI de Supabase, guardado en el llavero de macOS (servicio `Supabase CLI`, cuenta `supabase`, valor con prefijo `go-keyring-base64:`). El owner lo aprobó el 2026-11-25, aunque el spec de #7 §6 decía que no se usaría la API. El runbook solo documenta el Dashboard.
- **Plantillas (#173):** el botón es un `<a style="display:inline-block;…padding:12px 24px;border-radius:6px">` dentro de un `<p>` (l.17-19). Outlook de escritorio ignora `padding` y `border-radius` en un `<a>` y lo pinta como enlace de texto. La tarjeta interna es `<table width="100%" style="max-width:480px;…">` (l.12); Outlook ignora `max-width` y la estira a todo el ancho. No hay preheader. Las tres plantillas tienen exactamente la misma estructura y solo cambia el copy.
- **Suite de plantillas:** `supabase/templates/templates.test.ts`, 25 tests. Ya fija el copy, las variables permitidas, el enlace como botón (`<a … href="{{ .ConfirmationURL }}">Botón</a>`) y en texto plano, y que las dos líneas del pie vivan en el mismo `<p>` (sin comparar el pie completo).
- **`.env.example` (#174):** la l.12 mide 168 caracteres. Las bullets vecinas envuelven con sangría de 3 espacios (`#   …`) y miden como máximo 83.
- **Checklist C(3) (#175):** `grep -rnE 'sb_secret_|service_role|SERVICE_ROLE' src .env.example` debe salir vacío para ser verde, pero en develop siempre encuentra las l.7, 9 y 11 de `.env.example`, que son comentarios que *nombran* los secretos. Sobre `src` sale vacío.

## 3. Decisiones

### 3.1 #172 — Runbook: comandos completos y redeploy de `invite-user`

En `docs/ops/auth-email.md`, cada cambio de `ALLOWED_ORIGINS` (paso 11, R4 y R5) queda igual que el paso 5: el comando completo y después el redeploy, y luego el script de §5.1.

```bash
pnpm exec supabase secrets set ALLOWED_ORIGINS="<valor>" --project-ref eksbaugyypadtanyjcje
pnpm exec supabase functions deploy invite-user --project-ref eksbaugyypadtanyjcje --use-api
```

El redeploy se hace desde un worktree limpio en `origin/develop` actualizado (sin cambios de código en la función), como en el paso 5. Valores:

- **Paso 11:** `http://localhost:5173,https://littlebase.club`.
- **R4:** el valor anterior al cambio que falló. Si falló el paso 5, `http://localhost:5173,https://ligaspequenas.vercel.app`; si falló el paso 11, `http://localhost:5173,https://ligaspequenas.vercel.app,https://littlebase.club`. Se escriben los dos valores, no un "valor anterior" genérico.
- **R5:** `http://localhost:5173,https://ligaspequenas.vercel.app,https://littlebase.club`, más volver a agregar la Redirect URL de vercel.app (eso ya lo dice).

**El spec del 2026-11-25 (§8 y §12) no se edita.** Ese mismo spec (§9) dejó como regla que los specs y planes antiguos son registro histórico y no se tocan. La fuente operativa es el runbook, y #179 ya apunta a #172. Después del merge, el orquestador comenta en #179 que el runbook §4 paso 11 ya tiene los comandos completos.

### 3.2 #176 — Runbook: DNS por CNAME, caché de plantillas y Management API

1. **Tabla DNS (§1, "Resend"):** se quitan las filas MX `send` y TXT `send`, y se agregan CNAME `send` → `send.forge.rmta.net` y CNAME `rsend` → `rsend.forge.rmta.net`. DKIM y `_dmarc` siguen igual. Debajo, una línea: desde el 2026-11-25 Resend delega SPF y return-path con CNAMEs, y en `send` ya no hay MX ni TXT (un CNAME no convive con otros registros en el mismo nombre).
2. **Paso 1 (§4):** los `dig` pasan a ser `dig +short TXT resend._domainkey.littlebase.club`, `dig +short CNAME send.littlebase.club`, `dig +short CNAME rsend.littlebase.club` y `dig +short TXT _dmarc.littlebase.club`. No se agrega un `dig MX send…`: con un CNAME, `dig` sigue el alias y devolvería los registros del destino, así que no prueba nada.
3. **§5.2 paso 2 (cabeceras):** sin cambio. `smtp.mailfrom=…send.littlebase.club` ya se comprobó en la E2E del 2026-11-25 con el esquema CNAME en vivo.
4. **Caché (§2 y §7):** después de cambiar una plantilla, GoTrue puede seguir mandando la versión anterior hasta unos 30 minutos (observado el 2026-11-25: 7 a 27 minutos para `magic_link`; las plantillas nunca usadas se aplican al instante, pero hoy las tres ya se usaron). Regla: esperar 30 minutos antes de juzgar un cambio de plantilla y probar con una petición nueva, nunca con un correo que llegó antes.
5. **Re-aplicar plantillas (§2):** dos caminos equivalentes.
   - **Dashboard** (el de hoy): pegar asunto y HTML.
   - **Management API** (nuevo, aprobado por el owner el 2026-11-25): lo corre el orquestador. Es una subsección con el procedimiento y sus reglas de seguridad (§4 de este spec).

   En los dos casos se termina igual: verificación byte a byte contra el archivo de `develop` (por la API, aunque se haya pegado en el Dashboard), espera de 30 minutos por la caché y prueba en una bandeja real.
6. **§3 (contacto en el pie), paso 3:** "re-aplicar las tres plantillas (§2)", sin atarlo al Dashboard.
7. **Encabezado:** agregar la ruta de este spec junto a las del spec y plan de #7.

### 3.3 #173 — Plantillas: botón a prueba de Outlook, ancho fijo y preheader

Mismo cambio en las tres plantillas. Solo cambia el marcado y no se toca ningún texto obligatorio:

1. **Botón:** el `<p>` que envuelve al `<a>` pasa a ser una tabla de presentación de una celda: `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 24px;"><tr><td align="center" bgcolor="#6d28d9" style="border-radius:6px;">` con el mismo `<a>` adentro. El `<a>` conserva sus estilos (`display:inline-block`, `padding`, `background`, `border-radius`). En Outlook, el `bgcolor` de la celda pinta el bloque de color aunque ignore el padding del `<a>`. En los demás clientes se ve igual que hoy. No se usa VML ni comentarios condicionales `<!--[if mso]>`, porque meterían URLs `urn:` y `xmlns` en un HTML que la suite revisa y que GoTrue procesa como plantilla de Go.
2. **Ancho de la tarjeta:** la tabla interna lleva el atributo `width="480"` y su `style` pasa de `max-width:480px` a `width:100%;max-width:480px`. Outlook respeta el atributo (480 px fijos). Los demás clientes aplican el CSS, que gana sobre el atributo: el ancho sigue siendo fluido en móvil y con tope de 480 px.
3. **Preheader:** un `<div>` oculto como primer hijo de `<body>`, con `style="display:none;max-height:0;overflow:hidden;mso-hide:all;font-size:1px;line-height:1px;color:#f4f4f5;opacity:0;"`. Es el texto que muestra la bandeja junto al asunto. No lleva variables (ni `{{ .Email }}`). Copy (decisión del orquestador, revisable):
   - **invite:** `Acepta tu invitación a Little Baseball Club. El enlace es válido por 1 hora.`
   - **magic_link:** `Tu enlace para entrar a Little Baseball Club. Es válido por 1 hora.`
   - **confirmation:** `Confirma tu correo para entrar a Little Baseball Club. El enlace es válido por 1 hora.`

**Pruebas (TDD), en la suite existente:** tres tests nuevos por plantilla (9 en total, de 25 a 34). Ninguno compara el pie, y el test actual del botón sigue pasando sin cambios.

1. `%s.html wraps the button in a bgcolor cell for Outlook`: hay un `<td … bgcolor="#6d28d9" …>` seguido (con espacios en medio) del `<a … href="{{ .ConfirmationURL }}" …>`.
2. `%s.html gives the card a fixed width for Outlook and a fluid width elsewhere`: una `<table>` tiene a la vez el atributo `width="480"`, y `width:100%` y `max-width:480px` en su `style`.
3. `%s.html starts the body with its hidden preheader`: justo después de la etiqueta `<body …>` viene un `<div>` con `display:none` y `mso-hide:all` cuyo texto es exactamente el preheader de esa plantilla.

El rojo se ve antes de tocar los HTML. Cierre: `pnpm exec vitest run`, `pnpm exec tsc -b` y `pnpm lint` en verde. La revisión visual se hace con capturas de Playwright (`file://`) antes y después. **No hay Outlook de escritorio disponible:** la mejora en Outlook se razona y no se prueba. La bandeja real del owner (Gmail) prueba que no hay regresión.

**Aplicar al proyecto vivo (después del merge, orquestador y owner):** el repo es la fuente de verdad, pero Supabase sirve su propia copia. Después del merge de B, y del de A para que el runbook ya tenga el procedimiento:

1. **PATCH por la Management API** de los tres asuntos y contenidos desde `develop` (§4).
2. **Verificación byte a byte:** el GET de cada `mailer_templates_<name>_content` es idéntico al archivo (`cmp`) y cada `mailer_subjects_<name>` es igual al `subject` de `config.toml`.
3. **Esperar 30 minutos** por la caché.
4. **Bandeja real del owner:** pedir un magic link nuevo en `https://littlebase.club/login`. En la bandeja, el preheader se ve junto al asunto. El correo trae el botón y el enlace en texto plano, y el enlace loguea.

#173 se cierra cuando el owner aprueba ese último paso, no con el merge (igual que #7). Rollback: volver a hacer el PATCH con la versión anterior de cada archivo (`git show <merge de B>^1:supabase/templates/<name>.html`), hacer `git revert` del PR en una rama nueva y reintentar. No se parcha hacia adelante.

### 3.4 #174 — `.env.example`: envolver la línea de Resend

La l.12 se parte en tres líneas, igual que las bullets vecinas (`# - …` y continuación `#   …`), sin cambiar ni una palabra:

```
# - API key de Resend (SMTP de los correos de Auth): solo en Supabase →
#   Authentication → Emails → SMTP Settings. Nunca en .env ni en VITE_*.
#   Ver docs/ops/auth-email.md.
```

Ninguna línea nueva pasa de 80 caracteres. Las l.1 y 7 (81 y 83) no se tocan, porque el issue pide solo la línea nueva.

### 3.5 #175 — Checklist C(3): buscar valores, no menciones

El grep de C(3) se parte en dos:

```bash
# (3) secretos: cualquier mención en src y valores en .env.example — verde: vacío
grep -rnE 'sb_secret_|service_role|SERVICE_ROLE' src
grep -nE 'sb_secret_[A-Za-z0-9_-]{8,}|eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}|SERVICE_ROLE_KEY[[:space:]]*=[[:space:]]*[^[:space:]]' .env.example
```

- **`src` conserva el patrón amplio:** en el código del navegador, cualquier mención es sospechosa, y hoy sale vacío.
- **`.env.example` busca valores:** una key `sb_secret_` con al menos 8 caracteres de key (el `sb_secret_…` de la l.7 termina en `…`, que no es un carácter de key, así que no coincide); un JWT (las keys legacy `service_role` son JWT `eyJ…`); y una asignación `SERVICE_ROLE_KEY=<algo>`. También coincide si la asignación está comentada: un valor real comentado sigue siendo una fuga.
- Se ajusta el párrafo "Verde:" de C solo si nombra el grep viejo. "(3) vacío" sigue valiendo.
- **Prueba (sin commitear nada plantado):** en develop, los dos comandos salen vacíos. Una copia de `.env.example` en un directorio temporal fuera del repo (`mktemp -d`), con tres líneas falsas agregadas (`SUPABASE_SERVICE_ROLE_KEY=fakevalue123`, `X=sb_secret_FAKEfake0123456789` y un JWT falso `eyJhbGciOiJIUzI1NiJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIn0.abc`), da exactamente esas 3 coincidencias. El planner ya lo comprobó sobre develop `8a6a70a`. El implementer lo repite y pega la salida en el PR. El archivo plantado nunca entra al worktree.
- El spec y el plan del 2026-10-16 (pre-real-data-checklist) no se editan: son registro histórico.

## 4. Management API — procedimiento y reglas de seguridad (para el runbook §2)

El token de la CLI tiene poder sobre **toda** la cuenta de Supabase. Reglas, todas obligatorias:

- Solo lo usa el orquestador, para plantillas de Auth (asuntos y contenidos). Con la API no se tocan SMTP, rate limits, URLs ni nada más: eso sigue en el Dashboard.
- El token se lee del llavero a una variable de la shell y se pasa a `curl` por `-K <(…)` (config por un descriptor), nunca como argumento visible en `ps`. **Nunca** se imprime, ni se escribe en un archivo, el repo, el chat, un issue o un log. Al terminar se hace `unset`.
- La respuesta del `PATCH` (que devuelve la config completa, incluida `smtp_pass`) se descarta (`-o /dev/null`) y solo se mira el código HTTP.
- Un `GET` nunca se imprime ni se guarda entero: se extraen con `jq` solo los campos de plantilla. Si hace falta guardar un `GET` (diagnóstico), primero se le quitan `smtp_pass` y todo campo cuyo nombre contenga `pass`, `secret`, `token` o `key`.
- El cuerpo del `PATCH` se arma con `jq --rawfile` desde el archivo de `develop` y el asunto de `config.toml`, nunca a mano.

Forma del procedimiento (el plan fija el texto exacto del runbook):

```bash
api=https://api.supabase.com/v1/projects/eksbaugyypadtanyjcje/config/auth
token=$(security find-generic-password -s "Supabase CLI" -a supabase -w | sed 's/^go-keyring-base64://' | base64 -d)
auth() { printf 'header = "Authorization: Bearer %s"\n' "$token"; }
# por cada name en invite magic_link confirmation:
#   PATCH {mailer_subjects_<name>, mailer_templates_<name>_content} → 200, respuesta descartada
#   GET → jq -j '.mailer_templates_<name>_content' | cmp - supabase/templates/<name>.html
#   GET → jq -r '.mailer_subjects_<name>' = subject de config.toml
unset token
```

El planner comprobó, sin imprimir nada, que el valor del llavero tiene el prefijo `go-keyring-base64:` y que, decodificado, tiene forma de token `sbp_…`.

## 5. Verificación

- **A:** `rg` sobre el runbook. Cero coincidencias de `MX` en la tabla y de `dig +short (MX|TXT) send`, y aparecen `send.forge.rmta.net` y `rsend.forge.rmta.net`. Cada `secrets set` tiene `pnpm exec supabase` y `--project-ref eksbaugyypadtanyjcje` y va seguido de un `functions deploy invite-user … --use-api`. En el runbook no aparece ningún valor de token (`sbp_`) ni de key (`re_`).
- **B:** TDD (rojo real con los 9 tests nuevos, verde con 34), suite completa, `tsc -b` y `lint`, más capturas antes y después. Después del merge, §3.3 "Aplicar al proyecto vivo".
- **C:** la diff toca solo la l.12, el texto unido es igual al original y ninguna línea nueva pasa de 80 caracteres.
- **D:** la prueba de §3.5 (vacío en develop, 3 coincidencias con los valores plantados fuera del repo).
- **Después de los cuatro merges:** el orquestador corre C(3) sobre `develop` actualizado (C cambió `.env.example`) y sale vacío.
- Ciclo implementer → reviewer antes de cada PR.
- Sin cambios de base de datos ni de código de la app.

## 6. Restricciones

- Secretos: igual que el spec de #7 §13, más las reglas de §4 para el token de la CLI. Ningún secreto ni valor plantado se commitea.
- Nada de `supabase config push` ni `supabase link`.
- Código, identificadores y comentarios en inglés, sin comentarios nuevos. Docs en español. Commits en inglés.
- Specs y planes antiguos no se editan.
- Una rama por lote (§1). PR a `develop` con `Closes #N`, salvo B, que usa `Refs #173` y se cierra a mano después de la prueba en bandeja real.

## 7. Preguntas abiertas

Ninguna bloquea. Quedan como decisiones revisables del orquestador:

1. El texto de los preheaders (§3.3).
2. Que C(3) también marque una asignación comentada de `SERVICE_ROLE_KEY=` (§3.5).
3. No corregir el spec de #7 §8/§12 (§3.1), siguiendo su propia regla de registro histórico.

## 8. Fuera de alcance

- #177, #178 y #179.
- Probar el render real en Outlook de escritorio (no hay cliente disponible).
- VML o comentarios condicionales MSO en las plantillas.
- Cambiar textos obligatorios, el pie o la línea de contacto de las plantillas.
- Script versionado para la Management API (el runbook documenta el procedimiento; no se agrega código).
- Reenvolver las l.1 y 7 de `.env.example`.
