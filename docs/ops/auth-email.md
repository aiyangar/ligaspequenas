# Correos de Auth por Resend (#7) — Runbook

Cómo salen los correos de Auth (invitación, magic link y confirmación), dónde vive su configuración y cómo se cambia, se verifica y se revierte. Diseño y motivos: `docs/superpowers/specs/2026-11-25-custom-smtp-littlebase-design.md`; plan de implementación: `docs/superpowers/plans/2026-11-25-custom-smtp-littlebase.md`.

Casi todo esto vive en Dashboards (Resend, Vercel, Supabase), no en el repo. El repo solo guarda las plantillas y sus asuntos. **Nunca** se corre `supabase config push` ni `supabase link`: `supabase/config.toml` es de dev local y subiría `site_url = 127.0.0.1`.

## 1. Configuración vigente

### SMTP (Supabase → Authentication → Emails → SMTP Settings)

| Campo | Valor |
|---|---|
| Remitente | `Little Baseball Club <no-reply@littlebase.club>` (sender email `no-reply@littlebase.club`, sender name `Little Baseball Club`) |
| Host | `smtp.resend.com` |
| Puerto | `465` |
| Usuario | `resend` |
| Contraseña | La API key de Resend (ver "Dónde vive cada secreto"). |
| Minimum interval per user | 60 s |

### Auth (Supabase)

| Ajuste | Dónde | Valor |
|---|---|---|
| Rate limit for sending emails (`rate_limit_email_sent`) | Authentication → Rate Limits | 30 por hora |
| Email OTP Expiration | Authentication → Providers → Email | 3600 s (1 hora; las plantillas dicen "válido por 1 hora") |
| Site URL | Authentication → URL Configuration | `https://littlebase.club` |
| Redirect URLs | Authentication → URL Configuration | `http://localhost:5173/auth/callback`, `https://littlebase.club/auth/callback` y, solo durante la ventana de transición de 14 días, `https://ligaspequenas.vercel.app/auth/callback` |

### Resend

- Dominio `littlebase.club`, región `us-east-1`, estado *Verified*.
- **Click tracking y open tracking apagados.** El click tracking reescribe `{{ .ConfirmationURL }}` y mete un salto por un dominio de terceros en un enlace de un solo uso.
- Registros DNS (en Vercel DNS):

| Tipo | Nombre | Valor |
|---|---|---|
| TXT | `resend._domainkey` | Llave pública DKIM que da Resend. |
| MX | `send` | `10 feedback-smtp.us-east-1.amazonses.com` |
| TXT | `send` | `v=spf1 include:amazonses.com ~all` |
| TXT | `_dmarc` | `v=DMARC1; p=none;` |

### Dónde vive cada secreto

- **API key de Resend:** nombre `supabase-auth-smtp`, permiso **Sending access**, restringida al dominio `littlebase.club`. Existe **solo** en Resend y en el campo SMTP password de Supabase. Nunca en el repo, el chat, una shell, `.env` ni `VITE_*`. Si hay que rotarla: crear una nueva en Resend, pegarla en el campo SMTP password, guardar, mandar un magic link de prueba y borrar la vieja en Resend.
- **`ALLOWED_ORIGINS`:** solo como secreto de la Edge Function `invite-user` (`pnpm exec supabase secrets set … --project-ref eksbaugyypadtanyjcje`). No se commitea. Valor vigente tras el corte: `http://localhost:5173,https://littlebase.club` (más `https://ligaspequenas.vercel.app` durante la ventana de transición).

## 2. Plantillas

| Plantilla de Supabase | Archivo | Asunto | Por qué está en el repo |
|---|---|---|---|
| Invite user | `supabase/templates/invite.html` | `Te invitaron a Little Baseball Club` | La dispara `inviteUserByEmail` (`invite-user`) y "Send invitation" del Dashboard. |
| Magic link | `supabase/templates/magic_link.html` | `Tu enlace para entrar a Little Baseball Club` | La dispara `signInWithOtp` desde `/login`. |
| Confirm signup | `supabase/templates/confirmation.html` | `Confirma tu correo en Little Baseball Club` | Defensa: un invitado sin confirmar que pide enlace podría recibirla. |

Las demás (`email_change`, `reauthentication`, `recovery`, notificaciones de seguridad) no se disparan desde la app y se quedan con el default de Supabase.

El registro canónico de asunto ↔ archivo es `supabase/config.toml` (bloques `[auth.email.template.<nombre>]`). La suite `supabase/templates/templates.test.ts` fija el copy obligatorio, las variables permitidas (`{{ .ConfirmationURL }}` y `{{ .Email }}`) y el enlace en texto plano.

**Re-aplicar las plantillas** (después de cualquier cambio mergeado a `develop`): por cada una, en Supabase → Authentication → Emails → Templates, abrir la plantilla, pegar el `subject` de `supabase/config.toml` y el HTML completo del archivo tal como está en `develop`, y guardar. Después, mandarse un magic link y una invitación de prueba para ver el texto nuevo.

## 3. Agregar una línea de contacto al pie

1. En una rama nueva, en las tres plantillas, insertar `<br>` y la línea nueva dentro del `<p>` de pie (el que tiene "Si no esperabas este correo, puedes ignorarlo." y "Este buzón no recibe respuestas.").
2. Correr `pnpm exec vitest run supabase/templates`: debe seguir en verde (la suite no compara el pie completo).
3. PR a `develop` y, ya mergeado, re-aplicar las tres plantillas en el Dashboard (§2).

## 4. Secuencia de corte

Del paso 0 al 8 cada paso es aditivo: ninguno quita algo de lo que dependa el login vigente.

| # | Quién | Paso | Comprobación antes de seguir |
|---|---|---|---|
| 0 | Repo | PR con plantillas, `config.toml` y docs mergeado a `develop`. | CI y suite verdes. |
| 1 | Orquestador | `dig +short TXT resend._domainkey.littlebase.club`, `dig +short MX send.littlebase.club`, `dig +short TXT send.littlebase.club`, `dig +short TXT _dmarc.littlebase.club`. | Valores de la tabla DNS de §1. |
| 2 | Owner | Resend: Domains → `littlebase.club` → **Verify**. Confirmar tracking apagado. Crear la API key (§1, "Dónde vive cada secreto"); se pega directo en el paso 7. | Dominio *Verified*. |
| 3 | Owner | Vercel: proyecto de la app → Settings → Domains → agregar `littlebase.club` y `www.littlebase.club` (redirección 308 a `littlebase.club`). No cambiar env vars. | Paso 4. |
| 4 | Orquestador | `curl -sI https://littlebase.club/` → 200; `curl -sI https://littlebase.club/auth/callback` → 200; `curl -sI https://www.littlebase.club/` → 308 con `location: https://littlebase.club/`. Los assets de `curl -s https://littlebase.club/ \| grep -oE '/assets/[^"]+\.js'` coinciden con los de `ligaspequenas.vercel.app`. | Todo como se indica. |
| 5 | Orquestador | `pnpm exec supabase secrets set ALLOWED_ORIGINS="http://localhost:5173,https://ligaspequenas.vercel.app,https://littlebase.club" --project-ref eksbaugyypadtanyjcje` y redeploy sin cambios desde `develop`: `pnpm exec supabase functions deploy invite-user --project-ref eksbaugyypadtanyjcje --use-api`. | Script de §5.1: los 3 orígenes → 200 con su `Access-Control-Allow-Origin`; `https://evil.example` → 403. |
| 6 | Owner | Supabase → URL Configuration → Redirect URLs: **agregar** `https://littlebase.club/auth/callback`, conservando las de vercel.app y localhost. Site URL todavía no. | La lista tiene las 3 URLs. |
| 7 | Owner | Supabase → SMTP Settings: activar el SMTP propio con los valores de §1. Guardar. Pedir de inmediato un magic link desde `https://ligaspequenas.vercel.app/login` con el correo del owner. | Llega desde `Little Baseball Club <no-reply@littlebase.club>` y el enlace loguea. Si no llega en 2 minutos → R1. |
| 8 | Owner | Plantillas (§2). Email OTP Expiration = `3600`. Rate limit for sending emails = 30. | Paso 9. |
| 9 | Owner | Site URL → `https://littlebase.club`. | E2E completa (§5.2). |
| 10 | Owner | Avisar a los usuarios que la app está en `https://littlebase.club` y que cada quien pedirá un magic link nuevo una vez (la sesión vive en `localStorage` por origen). | — |
| 11 | Orquestador + owner | **T+14 días** (nunca antes de 24 h después del paso 9): `secrets set ALLOWED_ORIGINS="http://localhost:5173,https://littlebase.club"` + script de §5.1 (vercel.app → 403). Owner: quitar `https://ligaspequenas.vercel.app/auth/callback` de Redirect URLs. La redirección de `ligaspequenas.vercel.app` a `littlebase.club` es un seguimiento aparte, en este mismo momento. | Los usuarios activos ya entraron por el dominio nuevo (Supabase → Users → *Last sign in* posterior al paso 9). |

`http://localhost:5173` se queda siempre en `ALLOWED_ORIGINS` y en Redirect URLs: dev usa el mismo proyecto remoto.

## 5. Verificación

### 5.1 CORS de `invite-user` (pasos 5 y 11)

```bash
fn=https://eksbaugyypadtanyjcje.supabase.co/functions/v1/invite-user
for o in https://littlebase.club https://ligaspequenas.vercel.app http://localhost:5173 https://evil.example; do
  echo "== $o"; curl -s -o /dev/null -D - -X OPTIONS "$fn" -H "Origin: $o" \
    -H 'Access-Control-Request-Method: POST' | grep -iE '^HTTP|access-control-allow-origin'
done
```

Paso 5: los tres primeros dan 200 con su propio origen y `evil.example` da 403 sin `Access-Control-Allow-Origin`. Paso 11: `vercel.app` pasa a 403.

### 5.2 E2E en navegador (después del paso 9)

1. **Invitación:** como admin en `https://littlebase.club` → Usuarios → invitar un alias real del owner (`+lp-smtp1`, readonly). `invite-user` responde 200 con `Access-Control-Allow-Origin: https://littlebase.club`. El correo llega a la bandeja de entrada (no a spam) desde `Little Baseball Club <no-reply@littlebase.club>`, con asunto "Te invitaron a Little Baseball Club" y el copy de la plantilla, incluido "válido por 1 hora".
2. **Cabeceras** (Gmail → "Mostrar original"): `SPF: PASS`, `DKIM: PASS` con `d=littlebase.club` y `DMARC: PASS`; `smtp.mailfrom=…send.littlebase.club`.
3. **Aterrizaje:** el enlace pasa por `…supabase.co/auth/v1/verify` y termina en `https://littlebase.club/auth/callback#access_token=…`; la app entra como readonly (sin pestaña Usuarios ni acciones de escritura).
4. **Magic link recurrente:** cerrar sesión → `/login` con ese correo → llega "Tu enlace para entrar a Little Baseball Club" → el enlace loguea.
5. **Admin:** magic link del admin en `https://littlebase.club` → entra y ve Usuarios.
6. **Origen viejo durante la transición:** magic link desde `https://ligaspequenas.vercel.app` → aterriza en `https://ligaspequenas.vercel.app/auth/callback` y entra.
7. **`www`:** `https://www.littlebase.club/login` redirige a `https://littlebase.club/login`.
8. **Correo desconocido:** pedir enlace para un correo que no existe → mensaje neutral y ningún envío en el log de Resend.
9. **Invitado sin confirmar pide magic link:** invitar un segundo alias (`+lp-smtp2`, readonly) sin abrir la invitación y pedir enlace desde `/login`. `LoginPage` siempre muestra el mensaje neutral. Aceptable: (a) no llega nada y el log de Resend no muestra envío (se resuelve re-invitando, ver §7); (b) llega "Confirma tu correo en Little Baseball Club" en español y el enlace loguea; (c) llega el magic link y loguea. Cualquier otro resultado (correo en inglés, enlace que no loguea, error visible) es rojo.
10. **Limpieza:** borrar los usuarios de prueba y sus profiles con el procedimiento de datos de prueba vigente; confirmar que no queda residuo.

## 6. Rollback

- **R1. El SMTP no entrega** (paso 7 o E2E): en SMTP Settings, desactivar el SMTP propio. El mailer integrado **solo entrega a miembros del equipo de Supabase**: el owner sigue entrando, pero los demás no reciben correos hasta corregir Resend (dominio verificado, key, puerto 465 ↔ 587). Las plantillas pueden quedarse.
- **R2. El dominio nuevo falla** (TLS, 404, assets distintos): Site URL de vuelta a `https://ligaspequenas.vercel.app` y avisar a los usuarios. Las entradas de `littlebase.club` en `ALLOWED_ORIGINS` y Redirect URLs son inofensivas. Quitar el dominio en Vercel si hace falta.
- **R3. Una plantilla rompe el enlace:** "Reset to default" en esa plantilla en el Dashboard (vuelve al default en inglés, que funciona). Corregir con un `git revert` del PR de plantillas en una rama nueva y reintentar; no se parcha hacia adelante.
- **R4. CORS deja fuera un origen legítimo** (paso 5 u 11): `secrets set` con el valor anterior y repetir §5.1.
- **R5. Paso 11 prematuro** (usuarios atrapados en vercel.app): volver a agregar `https://ligaspequenas.vercel.app` a `ALLOWED_ORIGINS` y `https://ligaspequenas.vercel.app/auth/callback` a Redirect URLs, y alargar la ventana.
- **Vencimiento:** si 3600 s causa problemas, regresar el valor anterior de "Email OTP Expiration"; el texto "1 hora" de las plantillas cambia en el mismo movimiento (revert del PR de plantillas).

## 7. Operación

- **Plan de Resend:** el gratis da 100 correos/día y 3,000/mes. El disparador para pasar a uno pagado es que el uso diario se acerque a 100 correos (por ejemplo, en el arranque de temporada). Vigilarlo en el dashboard de Resend. Si se pasa, Resend rechaza, `LoginPage` muestra el mensaje neutral y `UsersPage` muestra `invite_failed`.
- **No usar "Send password recovery"** del Dashboard: la app es passwordless y la plantilla `recovery` no está traducida.
- **Invitado que nunca abrió su invitación** y no recibe enlace al pedirlo desde `/login`: el admin lo re-invita desde Usuarios (`inviteUserByEmail` sobre un usuario sin confirmar reenvía la invitación).
- **Primer admin:** "Send invitation" del Dashboard (manda la plantilla `invite` en español). Ver `docs/plan2-bootstrap-admin.md`.
