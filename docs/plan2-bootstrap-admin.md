# Runbook — Bootstrap del primer admin (Plan 2)

El primer admin no puede crearse desde la app: la Edge Function `invite-user`
exige que quien llama YA sea admin del tenant. Por eso se provisiona una sola
vez, fuera de banda. No existe ningún code path en la app que auto-otorgue admin
(fail-closed).

## Pasos (una sola vez)

1. **Crear el usuario** en el dashboard de Supabase: Authentication → Users →
   Add user. Captura email + contraseña (o usa "Send invitation"). Copia el
   `id` (uuid) del usuario creado.
2. **Insertar su profile como admin** (vía MCP `execute_sql` contra `main`),
   sustituyendo `<auth-user-id>` y `<Nombre>`:

   ```sql
   insert into profiles (id, tenant_id, full_name, role)
   values ('<auth-user-id>', '00000000-0000-0000-0000-000000000001', '<Nombre>', 'admin');
   ```

   (tenant = Liga MTY AC, sembrado en Foundation `0004_seed_ligamtyac.sql`.)
3. **Verificar**: iniciar sesión en la app con ese usuario; debe ver la pestaña
   **Usuarios**. A partir de ahí, ese admin invita al resto desde la app.

## Configuración operativa requerida (Supabase Auth)

- **Redirect allowlist**: agrega las URLs de `/auth/callback` de la app
  (dev `http://localhost:5173/auth/callback` y la URL de producción de Vercel)
  en Authentication → URL Configuration → Redirect URLs. Sin esto, tanto el
  link de invitación (`inviteUserByEmail`) como el magic link (`signInWithOtp`)
  caen al Site URL y no aterrizan en la app.
- **Email**: el v1 usa el email integrado de Supabase (rate-limited, para bajo
  volumen). SMTP propio se difiere a cuando haya volumen real.
