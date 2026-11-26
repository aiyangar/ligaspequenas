# Correos de Auth por SMTP propio (Resend) y dominio `littlebase.club` (#7) — Diseño

**Fecha:** 2026-11-25
**Estado:** Propuesto (decisiones del owner del 2026-11-25, dos rondas)
**Issue:** #7 "Move auth emails to a custom SMTP provider"

## 1. Objetivo

Hoy los correos de Auth (invitación y magic link) salen del mailer integrado de Supabase. Ese mailer solo entrega a correos del equipo de la organización de Supabase (cualquier otro destino falla con `email_address_not_authorized`) y tiene un límite por hora muy bajo. Con esto no se puede invitar a usuarios reales de la liga.

Este cambio hace tres cosas, en un solo corte coordinado:

1. Los correos de Auth salen por **Resend** (SMTP) con remitente `Little Baseball Club <no-reply@littlebase.club>`, con SPF, DKIM y DMARC alineados.
2. La app se mueve a **`https://littlebase.club`**. Hoy está en `https://ligaspequenas.vercel.app`, que se mantiene durante una ventana de transición.
3. Las plantillas de los correos que la app dispara pasan a estar **en español** y viven en el repo como fuente de verdad.

En ningún momento del corte deja de funcionar el login.

## 2. Decisiones del owner (2026-11-25, finales)

| Tema | Decisión |
|---|---|
| Proveedor | **Resend**, región `us-east-1`. Plan gratis: 100 correos/día, 3,000/mes. |
| Remitente | `Little Baseball Club <no-reply@littlebase.club>`. Sender name `Little Baseball Club`. |
| Marca en los correos | **"Little Baseball Club"** en asuntos y textos de las plantillas. El `<title>` de la app (`Liga MTY AC`) y el nombre del tenant no se tocan en este cambio. |
| Dominio | `littlebase.club`, registrado el 2026-11-25. Nameservers en Vercel DNS (`ns1/ns2.vercel-dns.com`), en la misma cuenta y team de Vercel que la app. |
| Origen de la app | Se mueve al apex `https://littlebase.club`. |
| DNS de Resend | **Ya hecho**, y resuelve públicamente (verificado con `dig` el 2026-11-25): TXT `resend._domainkey` (DKIM), MX `send` → `10 feedback-smtp.us-east-1.amazonses.com`, TXT `send` = `v=spf1 include:amazonses.com ~all`, TXT `_dmarc` = `v=DMARC1; p=none;`. Al owner todavía le falta hacer clic en **Verify** en Resend y crear la API key. |
| DMARC | Se queda en `p=none` por ahora. Endurecerlo (`rua` + `p=quarantine`) es un seguimiento (§11.2). |
| Plantillas | En español, solo las que la app dispara de verdad (§5), versionadas en el repo. |
| Contacto en el pie | **Sin línea de contacto** por ahora. `no-reply@` no tiene buzón (el apex no tiene MX) y Supabase SMTP no tiene campo `Reply-To`. Si más adelante se quiere un contacto, agregarlo es una edición trivial del bloque de pie (§5.3). |
| Vencimiento del enlace | **1 hora** (3600 s), fijado explícitamente en el Dashboard. Las plantillas dicen "válido por 1 hora". |
| Dominio del enlace / Safe Links | Fuera de alcance. Es un seguimiento (§11.1). |
| Redirección de `ligaspequenas.vercel.app` | Se hace **al final** de la ventana de 14 días, como seguimiento y no como parte de este corte (§11.3). |
| Management API | No se usa y no se abre issue para un script. |
| Plan de Resend | Sin acción ahora. El disparador para pasar a pago es acercarse a 100 correos/día (§7). |
| Invitado sin confirmar que pide magic link | No se sabe cómo se comporta GoTrue. Se prueba en la E2E con un segundo alias (§10.2, paso 9). |

## 3. Decisiones del orquestador (revisables)

- **`www` redirige al apex.** Se agregan `littlebase.club` (dominio principal) y `www.littlebase.club` (redirección **308** a `https://littlebase.club`) en el proyecto de Vercel. Así la app tiene un solo origen, y por lo tanto una sola entrada en `ALLOWED_ORIGINS`, una sola Redirect URL y un solo `localStorage` de sesión. `www` **no** se agrega a `ALLOWED_ORIGINS` ni a las Redirect URLs, porque nunca llega a ser origen de la app.
- **Configuración remota de Auth por el Dashboard** (§6).
- **Límite de correos de Auth: 30 por hora** (`rate_limit_email_sent`), explícito (§7).
- **Ventana de transición de 14 días** para `ligaspequenas.vercel.app` (§8, paso 11).
- **Tracking de Resend apagado.** Sin click tracking ni open tracking en el dominio. El click tracking reescribe `{{ .ConfirmationURL }}` y mete un salto por un dominio de terceros en un enlace de un solo uso.

## 4. Hechos verificados en el código (develop `7f999e6`)

- **Login:** `src/auth/LoginPage.tsx:32` llama `supabase.auth.signInWithOtp({ email, options: { shouldCreateUser: false, emailRedirectTo: `${window.location.origin}/auth/callback` } })`. Ignora el error devuelto a propósito (anti-enumeración) y solo muestra los fallos de transporte.
- **Invitación:** `src/users/inviteUser.ts:15` arma `redirectTo = ${window.location.origin}/auth/callback` y llama a la Edge Function `invite-user`. Esta (`supabase/functions/invite-user/index.ts:68`) llama `auth.admin.inviteUserByEmail(email, { redirectTo })` después de validar el origen contra el secreto `ALLOWED_ORIGINS` (l.19) y de comprobar que quien llama es admin.
- **Flujo implícito:** `src/lib/supabase.ts` crea el cliente sin `flowType`. En supabase-js v2 el default es `implicit`, así que la sesión llega en el hash. `AuthCallbackPage` acepta `access_token`/`refresh_token` del hash y también `code` en el query, pero hoy no se usa PKCE.
- **No hay más llamadas de Auth que manden correo.** En `src/`, `supabase/functions/` y `ops/` no aparecen `updateUser`, `resetPasswordForEmail`, `reauthenticate`, `signUp`, `resend`, `generateLink` ni `admin.createUser`. Solo están `signInWithOtp` e `inviteUserByEmail`.
- **Orígenes hard-codeados:** ver §9.

## 5. Plantillas

### 5.1 Cuáles se traducen y por qué

| Plantilla de Supabase | ¿Se dispara? | Decisión |
|---|---|---|
| **Invite user** (`invite`) | Sí: `inviteUserByEmail` desde `invite-user`, y "Send invitation" del Dashboard en el bootstrap del primer admin (`docs/plan2-bootstrap-admin.md`). | **Español, en repo.** |
| **Magic link** (`magic_link`) | Sí: `signInWithOtp` de `LoginPage` para usuarios ya confirmados. | **Español, en repo.** |
| **Confirm signup** (`confirmation`) | Hoy no debería: con `shouldCreateUser: false`, GoTrue no da de alta usuarios por OTP. Pero un usuario invitado que **nunca abrió** su invitación queda sin confirmar, y no se sabe si GoTrue lo rechaza en `/otp` o le manda el correo de confirmación. Se resuelve en la E2E (§10.2, paso 9). | **Español, en repo, como defensa.** Si se llega a mandar, que no salga en inglés con el texto "Confirm your signup" de una app que no tiene registro abierto. Cuesta poco. |
| Change email address (`email_change`) | No: la app no llama `updateUser({ email })`. | Fuera. Si algún día se agrega el cambio de correo, se traduce en ese cambio. |
| Reauthentication (`reauthentication`) | No: solo aplica a `updateUser({ password })` con "secure password change", y no hay contraseñas. | Fuera. |
| Reset password (`recovery`) | No desde la app (es passwordless). El Dashboard sí puede mandarlo a mano ("Send password recovery"). | Fuera. El runbook (§9) advierte que no se use. |
| Notificaciones de seguridad (password/email changed, etc.) | Están desactivadas por defecto y ninguna aplica. | Fuera. |

### 5.2 Ubicación y formato

- `supabase/templates/invite.html`, `supabase/templates/magic_link.html` y `supabase/templates/confirmation.html`: HTML completo (`<!doctype html>`, `<html lang="es">`, `<meta charset="utf-8">`).
- Los asuntos se declaran en `supabase/config.toml` con el formato nativo de la CLI. Se descomenta y se completa el bloque que ya existe en l.247:

  ```toml
  [auth.email.template.invite]
  subject = "Te invitaron a Little Baseball Club"
  content_path = "./supabase/templates/invite.html"

  [auth.email.template.magic_link]
  subject = "Tu enlace para entrar a Little Baseball Club"
  content_path = "./supabase/templates/magic_link.html"

  [auth.email.template.confirmation]
  subject = "Confirma tu correo en Little Baseball Club"
  content_path = "./supabase/templates/confirmation.html"
  ```

  En el mismo archivo se fija `otp_expiry = 3600` en `[auth.email]` (ya vale eso en l.234; se deja explícito y alineado con el valor remoto de §8).

  `config.toml` sigue siendo solo de dev local (el proyecto no está linkeado y **nunca** se hace `supabase config push`, porque subiría `site_url = 127.0.0.1`). Aquí funciona como registro canónico de asunto ↔ archivo, que es lo que el owner copia al Dashboard.

### 5.3 Contenido (texto obligatorio; el diseño visual lo cierra el plan)

Reglas comunes:
- El enlace es **siempre** `{{ .ConfirmationURL }}`, como botón y también como URL en texto plano debajo, para clientes que bloquean botones. No se construyen enlaces con `{{ .SiteURL }}` ni con `{{ .TokenHash }}`: con el flujo implícito, `ConfirmationURL` (`…supabase.co/auth/v1/verify?…&redirect_to=…`) ya aterriza en `/auth/callback` con la sesión en el hash.
- Sin imágenes remotas, sin `<script>`, sin CSS externo. Estilos inline, una sola columna y fondo claro (los clientes de correo no soportan bien el tema Dracula). Las únicas variables permitidas son `{{ .ConfirmationURL }}` y `{{ .Email }}`.
- Tono de "tú", igual que la app ("Ingresa un correo válido").
- **Pie:** un único bloque `<p>` de pie por plantilla, con dos líneas: "Si no esperabas este correo, puedes ignorarlo." y "Este buzón no recibe respuestas." **No lleva línea de contacto** (decisión del owner, §2). Agregarla más adelante tiene que ser una edición trivial: insertar una línea en ese bloque de cada plantilla y volver a pegar en el Dashboard. Ninguna prueba debe impedirlo (§5.4).

Textos:
- **invite:** título "Te dieron acceso a Little Baseball Club". Cuerpo: "Un administrador te invitó a la app de Little Baseball Club con el correo {{ .Email }}. Para entrar, abre este enlace:". Botón: "Aceptar invitación". Nota: "El enlace es válido por 1 hora y solo se puede usar una vez. Después, para entrar, pide un enlace nuevo en la pantalla de inicio de sesión."
- **magic_link:** título "Tu enlace de acceso". Cuerpo: "Pediste entrar a Little Baseball Club con {{ .Email }}.". Botón: "Entrar". Nota: "El enlace es válido por 1 hora y solo se puede usar una vez. Si ya no sirve, pide otro desde la pantalla de inicio de sesión."
- **confirmation:** título "Confirma tu correo". Cuerpo: "Para activar tu acceso a Little Baseball Club con {{ .Email }}, abre este enlace:". Botón: "Confirmar y entrar". Nota: "El enlace es válido por 1 hora y solo se puede usar una vez."

### 5.4 Pruebas del repo (TDD)

Una suite de Vitest (`supabase/templates/templates.test.ts` o la ubicación que elija el plan, siempre dentro de un tsconfig que ya cubra `tsc -b`) que lee los archivos y `config.toml` y comprueba lo siguiente:
1. Existen las tres plantillas y cada una aparece en `config.toml` con `subject` no vacío que contiene "Little Baseball Club" y un `content_path` que apunta a ella.
2. Cada plantilla tiene `lang="es"` y contiene `{{ .ConfirmationURL }}` al menos dos veces (botón y texto plano).
3. Solo usa variables de la lista permitida: cualquier `{{ … }}` fuera de `.ConfirmationURL` y `.Email` falla.
4. No contiene `<script`, `<img` con `src` remoto, `<link rel="stylesheet"` ni `http://`.
5. Contiene los textos obligatorios de §5.3: título, botón, "Little Baseball Club" y "1 hora".
6. No contiene "Liga MTY AC".

Ninguna aserción compara el pie completo ni prohíbe líneas extra en él, para que agregar el contacto no rompa la suite.

El rojo se ve antes de crear los archivos. Cierre: `pnpm exec vitest run`, `pnpm exec tsc -b` y `pnpm lint` en verde.

## 6. Configuración remota por el Dashboard

Toda la configuración de Auth la hace el owner en el Dashboard de Supabase. No se usa la Management API (`PATCH /v1/projects/{ref}/config/auth`) ni se crea un PAT:

- **Secretos:** la API key de Resend se teclea una vez en el campo SMTP password. No pasa por el chat, la shell del orquestador ni el repo. Con la API harían falta dos secretos: un PAT con poder sobre **toda** la cuenta de Supabase, y de vida larga, y la key de Resend dentro del body.
- **Frecuencia:** es un cambio de una sola vez y las plantillas casi no cambian.
- **Desalineación con el repo:** el owner pega exactamente el contenido de los archivos del `develop` mergeado, y la E2E (§10.2) comprueba que el correo recibido trae los textos de §5.3.

## 7. Límite de correos

- Resend gratis permite 100/día y 3,000/mes. Si se pasa, Resend responde error, Supabase falla el envío, `LoginPage` muestra el mensaje neutral (ignora el error a propósito) y `UsersPage` muestra `invite_failed`.
- **`rate_limit_email_sent` = 30/hora** (Authentication → Rate Limits → "Rate limit for sending emails"). Coincide con el default de Supabase para SMTP propio, pero se fija explícito para que no dependa de un default.
  - Alcanza para que un admin invite a un equipo completo de una vez (unas 15 a 20 invitaciones) y que esos usuarios entren por magic link en la misma hora.
  - Hace falta un abuso sostenido de más de 3 horas para agotar los 100 diarios. Además, el abuso por `LoginPage` está acotado: `shouldCreateUser: false` hace que los correos desconocidos no generen envío.
- **Intervalo mínimo por usuario: 60 s** (default de "Minimum interval per user" del formulario SMTP). Se deja así.
- **Plan de Resend:** sin acción ahora. El disparador para pasar a un plan pagado es que el uso diario se acerque a 100 correos (por ejemplo, durante el arranque de temporada). El owner lo vigila en el dashboard de Resend. El runbook (§9) deja anotado este disparador.

## 8. Secuencia de corte (login sin interrupción)

Del paso 0 al 8, cada paso es aditivo: ninguno quita algo de lo que dependa el login vigente.

| # | Quién | Paso | Comprobación antes de seguir |
|---|---|---|---|
| 0 | Repo | PR con plantillas, `config.toml` y docs (§9) mergeado a `develop`. No afecta el runtime. | CI y suite verdes. |
| 1 | Orquestador | Confirmar el DNS de Resend: `dig +short TXT resend._domainkey.littlebase.club`, `dig +short MX send.littlebase.club`, `dig +short TXT send.littlebase.club`, `dig +short TXT _dmarc.littlebase.club`. | Valores de §2. |
| 2 | Owner | **Resend:** Domains → `littlebase.club` → **Verify** (región `us-east-1`). Confirmar que **click tracking y open tracking están apagados**. Crear la API key con permiso **Sending access**, restringida al dominio `littlebase.club`, y nombre `supabase-auth-smtp`. La key se pega directo en el paso 7 y no se guarda en ningún otro lugar. | El dominio aparece como *Verified*. |
| 3 | Owner | **Vercel:** proyecto de la app → Settings → Domains → agregar `littlebase.club` y `www.littlebase.club` (con redirección 308 a `littlebase.club`). Como el DNS ya está en Vercel, los registros y el certificado se crean solos. **No** cambiar las env vars (`VITE_SUPABASE_URL` y `VITE_SUPABASE_PUBLISHABLE_KEY` siguen igual). | Paso 4. |
| 4 | Orquestador | `curl -sI https://littlebase.club/` → 200. `curl -sI https://littlebase.club/auth/callback` → 200 (rewrite de SPA en `vercel.json`). `curl -sI https://www.littlebase.club/` → 308 con `location: https://littlebase.club/`. Comparar los assets: `curl -s https://littlebase.club/ \| grep -oE '/assets/[^"]+\.js'` debe dar lo mismo que en `ligaspequenas.vercel.app` (mismo deploy de producción). | Todo como se indica. |
| 5 | Orquestador | Agregar el origen nuevo sin quitar nada: `pnpm exec supabase secrets set ALLOWED_ORIGINS="http://localhost:5173,https://ligaspequenas.vercel.app,https://littlebase.club" --project-ref eksbaugyypadtanyjcje`. Redeploy sin cambios de código desde `develop` actualizado, para forzar isolates nuevos: `pnpm exec supabase functions deploy invite-user --project-ref eksbaugyypadtanyjcje --use-api`. Comprobaciones con curl (§10.1). | `OPTIONS` con los 3 orígenes → 200 con su `Access-Control-Allow-Origin`; `https://evil.example` → 403. |
| 6 | Owner | **Supabase → Authentication → URL Configuration → Redirect URLs:** **agregar** `https://littlebase.club/auth/callback` y conservar `https://ligaspequenas.vercel.app/auth/callback` y `http://localhost:5173/auth/callback`. Site URL **todavía no** se cambia. | La lista tiene las 3 URLs. |
| 7 | Owner | **Supabase → Authentication → Emails → SMTP Settings:** activar el SMTP propio. Sender email `no-reply@littlebase.club`, sender name `Little Baseball Club`, host `smtp.resend.com`, port `465`, username `resend`, password = la API key del paso 2. Minimum interval 60 s. Guardar. Inmediatamente: pedir un magic link desde `https://ligaspequenas.vercel.app/login` con el correo del owner. | Llega desde `Little Baseball Club <no-reply@littlebase.club>` y el enlace loguea. Si no llega en 2 minutos → rollback R1 (§12). |
| 8 | Owner | **Supabase → Authentication → Emails → Templates:** para *Invite user*, *Magic link* y *Confirm signup*, pegar el asunto de `config.toml` y el HTML del archivo correspondiente de `develop`. Guardar cada una. **Vencimiento:** Authentication → Providers → Email → "Email OTP Expiration" = `3600`. **Rate Limits:** "Rate limit for sending emails" = 30. | Paso 9. |
| 9 | Owner | **Site URL** → `https://littlebase.club`. Es el fallback cuando un `redirect_to` no está en la lista. Como las dos URLs están en la lista, este cambio no altera el aterrizaje de los enlaces que ya se mandaron. | E2E completa (§10.2). |
| 10 | Owner | Avisar a los usuarios: la app ahora está en `https://littlebase.club`. La sesión vive en `localStorage` por origen, así que **cada usuario tendrá que pedir un magic link nuevo una vez** en el dominio nuevo. La sesión en `vercel.app` sigue sirviendo hasta el paso 11. | — |
| 11 | Orquestador + owner | **T+14 días** (no antes de 24 h después del paso 9, para que venzan los enlaces ya enviados con `redirect_to` a vercel.app): orquestador → `secrets set ALLOWED_ORIGINS="http://localhost:5173,https://littlebase.club"` + curl (vercel.app → 403). Owner → quitar `https://ligaspequenas.vercel.app/auth/callback` de Redirect URLs. La redirección de `ligaspequenas.vercel.app` a `littlebase.club` **no** es parte de este corte: es el seguimiento §11.3, y se hace en este mismo momento. | Condición previa: los usuarios activos ya entraron por el dominio nuevo. Se ve en Supabase → Users → *Last sign in* posterior al paso 9. |

`http://localhost:5173` se queda en `ALLOWED_ORIGINS` y en Redirect URLs (dev usa el mismo proyecto remoto, igual que en el spec de auth-hardening §8).

## 9. Cambios en el repo (implementador, una rama `update/custom-smtp-templates`)

Resultado del grep de `ligaspequenas.vercel.app` y otros orígenes:

| Archivo | Hoy | Cambio |
|---|---|---|
| `supabase/templates/{invite,magic_link,confirmation}.html` | No existen. | Nuevos (§5). |
| `supabase/config.toml` l.234 y l.246-249 | `otp_expiry = 3600`; bloque de plantilla comentado. | Los 3 bloques de §5.2; `otp_expiry` se queda en 3600. `site_url` y `additional_redirect_urls` (127.0.0.1) **no se tocan**: son de dev local. `[auth.email.smtp]` sigue comentado, porque las credenciales no van al repo. |
| Test de plantillas | — | Nuevo (§5.4). |
| `docs/security/pre-real-data-checklist.md` l.86 | `base=https://ligaspequenas.vercel.app` | `base=https://littlebase.club`. Revisar en el mismo archivo cualquier otra mención del dominio de producción. |
| `docs/plan2-bootstrap-admin.md` l.26-31 | Redirect allowlist "URL de producción de Vercel"; Email: "integrado de Supabase… SMTP propio se difiere". | Redirect URLs = `http://localhost:5173/auth/callback` y `https://littlebase.club/auth/callback`. Email → "SMTP propio por Resend, ver `docs/ops/auth-email.md`". En el paso 1, preferir "Send invitation" (manda la plantilla en español) en vez de crear con contraseña. |
| `docs/ops/auth-email.md` | No existe. | Runbook nuevo: configuración vigente (remitente `Little Baseball Club <no-reply@littlebase.club>`, host, puerto, límite de 30/h, vencimiento de 3600 s y dónde vive cada secreto), la tabla de §8 como procedimiento para re-aplicar plantillas, cómo agregar la línea de contacto al pie (§5.3), la verificación de §10, el rollback de §12, el disparador del plan de Resend (§7) y la regla "no usar *Send password recovery*". **Ningún valor secreto.** |
| `.env.example` l.9 | Lista `ALLOWED_ORIGINS` como secreto de la función. | Agregar una línea: la API key de Resend vive solo en Supabase → Auth → SMTP y nunca en `.env` ni en `VITE_*`. Sin variable nueva. |
| `supabase/functions/invite-user/http.test.ts` | Usa `https://app.example.com` y `http://localhost:5173`. | Sin cambio: son orígenes ficticios de prueba. |
| `src/` (`LoginPage`, `inviteUser`) | Usan `window.location.origin`. | Sin cambio: ya se adaptan solos al dominio. |
| `vercel.json`, `index.html` | Rewrite SPA y `<title>Liga MTY AC</title>`. | Sin cambio en este corte. `vercel.json` cambia en el seguimiento §11.3. |
| `docs/superpowers/specs/*` y `plans/*` antiguos (auth-hardening, pre-real-data-checklist, techdebt-i) | Mencionan vercel.app. | **No se editan**: son registro histórico. |

Fuera del repo (no se commitean): el secreto `ALLOWED_ORIGINS`, la configuración de Auth en Supabase y los dominios de Vercel.

## 10. Verificación

### 10.1 Orquestador (curl/DNS), en el paso 5 y otra vez en el 11

```bash
fn=https://eksbaugyypadtanyjcje.supabase.co/functions/v1/invite-user
for o in https://littlebase.club https://ligaspequenas.vercel.app http://localhost:5173 https://evil.example; do
  echo "== $o"; curl -s -o /dev/null -D - -X OPTIONS "$fn" -H "Origin: $o" \
    -H 'Access-Control-Request-Method: POST' | grep -iE '^HTTP|access-control-allow-origin'
done
```
Esperado en el paso 5: los tres primeros dan 200 con su propio origen y `evil.example` da 403 sin `Access-Control-Allow-Origin`. En el paso 11, `vercel.app` pasa a 403. El PR o handoff guarda la salida tal como sale.

### 10.2 E2E en navegador (Playwright del orquestador más bandeja real del owner), después del paso 9

1. **Invitación:** como admin en `https://littlebase.club` → Usuarios → invitar un correo real del owner (alias `+lp-smtp1@gmail.com`, rol readonly).
   - En DevTools, la llamada a `invite-user` responde 200 con `Access-Control-Allow-Origin: https://littlebase.club`.
   - El correo llega a la bandeja de entrada (no a spam). Remitente `Little Baseball Club <no-reply@littlebase.club>`, asunto "Te invitaron a Little Baseball Club" y cuerpo con los textos de §5.3, incluido "válido por 1 hora".
2. **Cabeceras** (Gmail → "Mostrar original"): `SPF: PASS`, `DKIM: PASS` con `d=littlebase.club` y `DMARC: PASS`. `Authentication-Results` muestra `smtp.mailfrom=…send.littlebase.club` (alineación relajada con `littlebase.club`). Se copian esas tres líneas al handoff.
3. **Aterrizaje:** el enlace pasa por `…supabase.co/auth/v1/verify` y termina en `https://littlebase.club/auth/callback#access_token=…`. La app navega a `/` como el usuario readonly: sin la pestaña Usuarios y sin acciones de escritura.
4. **Magic link recurrente:** cerrar sesión → `/login` con ese mismo correo → llega "Tu enlace para entrar a Little Baseball Club" → el enlace loguea.
5. **Admin:** magic link del admin en `https://littlebase.club` → entra y ve Usuarios.
6. **Origen viejo durante la transición:** login por magic link desde `https://ligaspequenas.vercel.app` → aterriza en `https://ligaspequenas.vercel.app/auth/callback` y entra.
7. **`www`:** `https://www.littlebase.club/login` redirige a `https://littlebase.club/login`.
8. **Correo desconocido:** pedir un enlace para un correo que no existe → mensaje neutral y ningún correo en el log de Resend.
9. **Invitado sin confirmar pide magic link:** invitar un segundo alias (`+lp-smtp2@gmail.com`, readonly) y **no** abrir esa invitación. Desde `/login`, pedir un enlace para ese alias. En todos los casos `LoginPage` muestra el mensaje neutral. Se registra en el handoff cuál de estos comportamientos ocurrió:
   - **(a) GoTrue lo rechaza** ("Signups not allowed for otp"): no llega correo y el log de Resend no muestra envío. Es aceptable. El runbook (§9) documenta que, para un invitado que no abrió su invitación, el admin tiene que volver a invitarlo (`inviteUserByEmail` sobre un usuario sin confirmar reenvía la invitación). Se comprueba re-invitando: llega "Te invitaron a Little Baseball Club" y el enlace loguea.
   - **(b) GoTrue manda la plantilla *Confirm signup*:** llega "Confirma tu correo en Little Baseball Club" en español, desde el mismo remitente, y el enlace aterriza en `https://littlebase.club/auth/callback` y loguea como readonly. Es aceptable y confirma que la plantilla `confirmation` hacía falta.
   - **(c) Llega la plantilla *Magic link*:** el enlace loguea. Es aceptable.
   - **Cualquier otro resultado** (correo en inglés, enlace que no loguea, error visible en `LoginPage`) es rojo: se investiga antes de cerrar #7.
10. **Limpieza:** borrar los usuarios de prueba (`+lp-smtp1`, `+lp-smtp2`) y sus profiles siguiendo el procedimiento de datos de prueba vigente. Confirmar que no queda residuo.

### 10.3 Repo

`pnpm exec vitest run`, `pnpm exec tsc -b` y `pnpm lint` en verde, con revisión previa al PR (ciclo implementador → revisor).

## 11. Seguimientos (issues a abrir, fuera de este corte)

1. **Dominio del enlace y pre-fetch de Safe Links.** `{{ .ConfirmationURL }}` apunta a `eksbaugyypadtanyjcje.supabase.co`, no a `littlebase.club`, lo que puede bajar un poco la reputación en filtros de spam. Además, los escáneres corporativos (Outlook Safe Links) pueden abrir el enlace antes que el usuario y gastarlo. Hay dos opciones: el add-on de Custom Domain de Supabase (de pago), o cambiar a enlaces `{{ .RedirectTo }}?token_hash={{ .TokenHash }}&type=…` con `verifyOtp` en `AuthCallbackPage` (cambio de código). Se abre un issue con ambas.
2. **Endurecer DMARC.** Agregar `rua=mailto:<buzón de reportes>` (tiene que ser externo, porque el apex no tiene MX) y subir a `p=quarantine` después de 2 a 4 semanas de pases limpios. Se abre un issue.
3. **Redirigir `ligaspequenas.vercel.app` → `https://littlebase.club`** al cerrar la ventana de 14 días (paso 11). El dominio `*.vercel.app` por defecto del proyecto no se puede redirigir desde Settings → Domains, así que se hace en código con una redirección condicionada por host en `vercel.json`. `redirects` se evalúa antes de `rewrites`, así que no choca con el rewrite de la SPA:

   ```json
   "redirects": [
     {
       "source": "/:path*",
       "has": [{ "type": "host", "value": "ligaspequenas.vercel.app" }],
       "destination": "https://littlebase.club/:path*",
       "permanent": true
     }
   ]
   ```

   Va en su propia rama y su propio PR, con una verificación por curl (`curl -sI https://ligaspequenas.vercel.app/login` → 308 a `https://littlebase.club/login`). Antes de implementarlo se confirma en la documentación vigente de Vercel que `has` con `type: "host"` aplica al dominio `vercel.app` de producción. Se abre un issue.

El plan pagado de Resend **no** es un seguimiento: solo queda anotado su disparador (§7).

## 12. Rollback

- **R1. El SMTP no entrega** (paso 7 o E2E): en Supabase → SMTP Settings, desactivar el SMTP propio y volver al integrado. Ojo: el integrado **solo entrega a miembros del equipo de Supabase**, así que con esto el owner puede seguir entrando, pero los demás usuarios no reciben correos hasta que se corrija Resend (dominio verificado, key, puerto 465 ↔ 587). Las plantillas en español pueden quedarse, porque no dependen del SMTP.
- **R2. El dominio nuevo falla** (TLS, 404, assets distintos): Site URL de vuelta a `https://ligaspequenas.vercel.app` y avisar a los usuarios que sigan usando ese dominio. Las entradas de `littlebase.club` en `ALLOWED_ORIGINS` y en Redirect URLs son inofensivas y se pueden quedar o quitar con `secrets set`. Se quita el dominio en Vercel si hace falta.
- **R3. Una plantilla rompe el enlace:** en el Dashboard, "Reset to default" en esa plantilla (vuelve al default en inglés de Supabase, que funciona). Se corrige el archivo con un `git revert` del PR de plantillas en una rama nueva y se reintenta. No se parcha hacia adelante.
- **R4. CORS** (el paso 5 o el 11 deja fuera un origen legítimo): `secrets set` con el valor anterior y repetir §10.1. No requiere código.
- **R5. Paso 11 prematuro** (usuarios atrapados en vercel.app): volver a agregar vercel.app a `ALLOWED_ORIGINS` y a Redirect URLs, y alargar la ventana.
- **Vencimiento:** si 3600 s causa problemas, se regresa el valor anterior de "Email OTP Expiration" en el Dashboard. El texto "1 hora" de las plantillas tendría que cambiar en el mismo movimiento (revert del PR de plantillas).

## 13. Restricciones

- **Secretos:** la API key de Resend solo existe en Resend y en el campo SMTP password de Supabase. Nunca en el repo, el chat, la shell del orquestador, `.env` ni `VITE_*`. No se crea ningún PAT de Supabase. `ALLOWED_ORIGINS` se cambia con `secrets set` y no se commitea.
- Nada de `supabase config push` ni `supabase link`: `config.toml` es solo de dev local.
- Reglas del repo: identificadores en inglés; sin comentarios salvo una línea corta con el porqué; commits en inglés. Una rama para los cambios del repo (`update/custom-smtp-templates`), PR a `develop` con `Refs #7`. El issue se cierra cuando se completa la E2E de §10.2, no con el merge.
- Lo que queda solo como verificación manual (bandeja real y cabeceras) se lista en el handoff y espera la aprobación del owner.

## 14. Preguntas abiertas

Ninguna. Todas las preguntas de la primera versión quedaron resueltas como decisiones del owner (§2) o como seguimientos (§11).

## 15. Fuera de alcance

- Los seguimientos de §11: dominio del enlace, Safe Links, DMARC y la redirección de vercel.app.
- Cambiar el `<title>` de la app o el nombre del tenant a "Little Baseball Club".
- Script o issue para la Management API.
- Plantillas de `email_change`, `reauthentication`, `recovery` y notificaciones de seguridad (§5.1).
- Correo transaccional fuera de Auth (por ejemplo, avisos de pagos): sería otro uso de Resend, con su propio spec.
- Previews de Vercel en `ALLOWED_ORIGINS`.
