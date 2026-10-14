# Documentos y foto del jugador: estatus, Storage privado y candado de consentimiento (#1) — Diseño

**Fecha:** 2026-10-13
**Estado:** Borrador (pendiente de revisión del owner)
**Issue:** [#1](https://github.com/aiyangar/ligaspequenas/issues/1)
**Spec maestro:** `2026-06-22-liga-mty-registro-jugadores-design.md` §4.6 (tabla `documents`) y §7 (Storage, candado de consentimiento)

## 1. Contexto y objetivo

Cada jugador ya tiene sus 6 filas en `documents`, sembradas en `pendiente` por `private.seed_player_documents()` (`0008`), y RLS admin-escribe / tenant-lee (`0002`/`0003`). `players.photo_path` existe desde `0001` pero nada lo usa. No hay buckets ni políticas de Storage, y `src/` no usa Storage.

Objetivo:

- El admin registra, por documento, si se entregó en **físico** o en **digital**, y sube el archivo cuando es digital. Readonly ve el estatus y abre los archivos.
- El admin sube, reemplaza y quita la **foto** del jugador.
- Todo archivo vive en un bucket **privado**, por tenant, y solo se abre con **URLs firmadas temporales**.
- **Candado de consentimiento:** no se sube foto ni documento digital mientras `image_consent` o `privacy_notice` estén en `pendiente`. Se aplica en el cliente **y** en el servidor (Storage + BD).

Fuera de alcance: vista previa embebida, historial de versiones de archivos, columnas de estatus en el listado de jugadores (#4), exportación (#5).

## 2. Decisiones

| Decisión | Elección |
|---|---|
| Foto en este slice | **Sí.** Comparte bucket, políticas y candado con los documentos. Descartado: ticket aparte — duplicaría la migración de Storage y el patrón de subida. |
| Consentimientos y el candado | **`image_consent` y `privacy_notice` están exentos**: siempre se pueden marcar `fisico` o subir en `digital` (si no, el candado nunca se abriría). El candado aplica a la **foto** y a `curp`, `birth_certificate`, `proof_of_address`, `medical_clearance`. Marcar `fisico` nunca está bloqueado: no carga datos en la app. |
| Buckets | **Uno**, `player-files`: `public = false`, `file_size_limit = 10 MB`, `allowed_mime_types = application/pdf, image/jpeg, image/png, image/webp`. La foto se limita además en el cliente a imagen ≤ 5 MB. Descartado: dos buckets — límites distintos forzados por servidor a cambio de duplicar políticas. HEIC no se acepta: Safari iOS convierte a JPEG al elegir de la galería con `accept="image/*"`. |
| Rutas | Exactamente `{tenant_id}/{player_id}/{doc_type}` y `{tenant_id}/{player_id}/photo`, **sin extensión**; el content-type queda en la metadata del objeto. Ruta fija por documento → reemplazar = upload con `upsert`. |
| Salir de `digital` | **Se borra el archivo** (con confirmación en la UI) y `file_path = null`. Un archivo por documento, sin historial. Descartado: conservarlo — deja datos sensibles huérfanos. |
| Revocar un consentimiento | **Bloqueado en servidor** si el jugador tiene `photo_path` o algún documento no-consentimiento en `digital`; la UI lo explica ("primero quita la foto y los documentos digitales"). Descartado: borrar en cascada — elimina archivos sin que el admin lo vea. |
| Enforcement en servidor | **Dos capas: políticas de `storage.objects` + triggers en BD.** Ni la API directa de Storage ni un update directo a las tablas saltan el candado. Descartado: (a) edge function con service role — más superficie (deploy, CORS, auth, rollback) y el archivo pasa por la función; (b) solo triggers — un admin podría subir a Storage sin consentimiento vía API aunque la fila nunca se marque digital. |
| URLs firmadas | `createSignedUrl` desde el cliente (respeta la política de lectura), expiración **300 s**. |
| Errores de BD en la UI | Los triggers lanzan mensajes con **prefijo estable** (`consent_required:`, `consent_in_use:`, `invalid_file_path:`, `file_path_mismatch:`) y la capa de datos los traduce a español. Es un patrón **nuevo** en el repo (los triggers de equipos hoy llegan crudos a la UI). |
| Entrega | Tres ramas, base `develop` (§7). |

## 3. Base de datos y Storage — `supabase/migrations/0012_player_files.sql`

### 3.1 Bucket

```sql
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('player-files', 'player-files', false, 10485760,
        array['application/pdf', 'image/jpeg', 'image/png', 'image/webp']);
```

### 3.2 Helpers (`private`, `security definer`, `set search_path = ''`, `grant execute … to authenticated`)

- **`private.player_consent_granted(p_player_id uuid) returns boolean`** — `true` si las filas `image_consent` **y** `privacy_notice` del jugador tienen `status <> 'pendiente'`.
- **`private.player_file_path_allowed(p_name text) returns boolean`** — `true` si y solo si:
  1. `p_name` tiene exactamente 3 segmentos separados por `/`;
  2. el segmento 1 es `private.current_tenant_id()::text`;
  3. el segmento 2 es el `id` de un jugador de ese tenant (un segmento que no castea a uuid → `false`, sin excepción);
  4. el segmento 3 es uno de los 6 valores de `document_type` o `photo`;
  5. si el segmento 3 **no** es `image_consent` ni `privacy_notice`, `private.player_consent_granted(segmento 2)` es `true`.

### 3.3 Políticas sobre `storage.objects` (todas con `bucket_id = 'player-files'`, rol `authenticated`)

| Política | Regla |
|---|---|
| `player_files_select` | `(storage.foldername(name))[1] = private.current_tenant_id()::text` (admin y readonly). Habilita `createSignedUrl`. |
| `player_files_insert` | `with check (private.is_admin() and private.player_file_path_allowed(name))` |
| `player_files_update` | `using` y `with check` iguales a insert (el `upsert` necesita insert + update + select). |
| `player_files_delete` | `using (private.is_admin() and (storage.foldername(name))[1] = private.current_tenant_id()::text)` — **sin candado**: siempre se puede quitar un archivo. |

### 3.4 Integridad en `documents`

- `alter table documents add constraint documents_file_path_iff_digital check ((status = 'digital') = (file_path is not null));` — hoy todas las filas están en `pendiente` sin `file_path`; no rompe datos.
- Trigger **`private.enforce_document_rules()`**, `before insert or update on documents`, `for each row`:
  1. Bloquea la fila del jugador con `select … from public.players where id = new.player_id for update` (evita la carrera revocar-vs-subir, mismo patrón que `0010`).
  2. **Ruta:** si `new.file_path is not null` y `new.file_path <> new.tenant_id || '/' || new.player_id || '/' || new.doc_type` → `raise exception 'file_path_mismatch: …'`.
  3. **Candado:** si `new.status = 'digital'`, `new.doc_type` no es consentimiento y `not private.player_consent_granted(new.player_id)` → `raise exception 'consent_required: …'`.
  4. **Revocación:** si `new.doc_type` es consentimiento, `new.status = 'pendiente'`, `old.status <> 'pendiente'` y el jugador tiene `photo_path is not null` o algún documento no-consentimiento en `digital` → `raise exception 'consent_in_use: …'`.

  El trigger de siembra (`0008`) inserta todo en `pendiente` sin `file_path`: pasa las cuatro reglas sin cambios.

### 3.5 Integridad en `players`

Trigger **`private.enforce_player_photo_rules()`**, `before insert or update of photo_path on players`: si `new.photo_path is not null`:
- `new.photo_path <> new.tenant_id || '/' || new.id || '/photo'` → `raise exception 'invalid_file_path: …'`;
- `not private.player_consent_granted(new.id)` → `raise exception 'consent_required: …'` (en un `insert` no hay documentos todavía → siempre bloquea, que es lo correcto: la foto se sube después de crear al jugador).

La fila del jugador ya está bloqueada por el propio `update`, así que la revocación concurrente (§3.4 paso 1) se serializa con esta escritura.

### 3.6 Pruebas — `supabase/tests/0012_player_files.test.sql`

pgTAP aplicado vía MCP contra el remoto (truco de dos sentencias con `is()`; ver memoria del proyecto). Fixtures propios, limpiados al final; advisors después del DDL. Casos:

- Bucket: existe, `public = false`, límite 10 MB, los 4 MIME.
- Candado en `documents`: `digital` en `curp` sin consentimiento → `consent_required`; con ambos consentimientos en `fisico` → ok.
- Exención: `image_consent`/`privacy_notice` a `digital` sin consentimiento previo → ok.
- Revocación: con `curp` digital, `privacy_notice` → `pendiente` falla con `consent_in_use`; sin archivos → ok. Lo mismo con `photo_path` puesto.
- CHECK: `digital` sin `file_path` y `fisico` con `file_path` → violación del constraint.
- Ruta: `file_path` de otro jugador o de otro `doc_type` → `file_path_mismatch`.
- Foto: `photo_path` sin consentimiento → `consent_required`; con ruta ajena → `invalid_file_path`; con consentimiento y ruta correcta → ok.
- `player_file_path_allowed`: otro tenant, jugador inexistente, segmento no-uuid, 2 o 4 segmentos, nombre fuera de la lista, documento sin consentimiento → `false`; consentimiento sin consentimiento previo y documento con consentimiento → `true`.
- Políticas de Storage (simulando `authenticated` con `request.jwt.claims`): readonly no puede insertar ni borrar; admin de otro tenant no lee; admin del tenant inserta una ruta permitida y no inserta una ruta bloqueada por el candado.

## 4. Capa de datos

### 4.1 `src/documents/documents.ts` (módulo nuevo, mismo patrón que `src/teams/teams.ts`)

- Tipos `DocumentType`, `DocumentStatus`, `DocumentRow` (`id, tenant_id, player_id, doc_type, status, file_path, updated_at`).
- `DOCUMENT_TYPES` en orden fijo y `DOCUMENT_LABELS`:

  | `doc_type` | Etiqueta |
  |---|---|
  | `curp` | CURP |
  | `birth_certificate` | Acta de nacimiento |
  | `proof_of_address` | Comprobante de domicilio |
  | `image_consent` | Consentimiento de imagen |
  | `privacy_notice` | Aviso de privacidad |
  | `medical_clearance` | Constancia médica |

- `CONSENT_TYPES` y la función pura **`consentGranted(docs)`** (reflejo en cliente de `private.player_consent_granted`).
- **`fetchPlayerDocuments(playerId)`** → las 6 filas ordenadas por `DOCUMENT_TYPES`.
- **`setDocumentStatus(doc, status: 'pendiente' | 'fisico')`** — si `doc.status === 'digital'`: **primero** `storage.remove([doc.file_path])`, **después** `update` de la fila (`status`, `file_path = null`). Si el update falla, la fila queda `digital` apuntando a un archivo inexistente: recuperable desde la UI (reintentar o volver a subir). El orden inverso podría dejar un archivo sensible huérfano sin forma de encontrarlo.
- **`uploadDocument(doc, file)`** — valida en cliente MIME ∈ los 4 permitidos y tamaño ≤ 10 MB (error en español sin llamar a Supabase); `upload(path, file, { upsert: true, contentType: file.type })` a `{tenant_id}/{player_id}/{doc_type}`; luego `update` a `status = 'digital'`, `file_path = path`. Si el update falla **y** la fila no estaba ya en `digital`, `remove([path])` (rollback) y se propaga el error. Si ya estaba en `digital` (reemplazo), no se borra: el objeto nuevo sustituyó al anterior en la misma ruta.
- **`getSignedFileUrl(path)`** → `createSignedUrl(path, 300)`.
- **`documentErrorMessage(error)`** — traduce por prefijo:

  | Prefijo | Texto |
  |---|---|
  | `consent_required` | "Primero registra el consentimiento de imagen y el aviso de privacidad." |
  | `consent_in_use` | "No se puede regresar a pendiente: primero quita la foto y los documentos digitales." |
  | `invalid_file_path` / `file_path_mismatch` | "Ruta de archivo inválida." |
  | errores de RLS/Storage (`row-level security`, `Unauthorized`, 403) | "No tienes permiso para esta acción." |
  | cualquier otro | el mensaje original |

### 4.2 Foto — `src/players/players.ts`

- **`uploadPlayerPhoto(player, file)`** — solo `image/jpeg|png|webp`, ≤ 5 MB; upload con `upsert` a `{tenant_id}/{id}/photo`; luego `update players set photo_path`. Rollback igual que `uploadDocument` (solo si `photo_path` era `null`).
- **`removePlayerPhoto(player)`** — `remove` del objeto, luego `photo_path = null` (mismo orden y razón que §4.1).

Ambas escriben a la tabla `players` (no a la vista `players_with_category`).

### 4.3 Pruebas (Vitest, cliente de Supabase mockeado como en `players.test.ts` / `teams.test.ts`)

Orden remove → update; rollback cuando falla el update; **sin** rollback en reemplazo; validación de MIME y tamaño sin llamada a Supabase; ruta construida correctamente; `consentGranted` (todas las combinaciones de los dos consentimientos); `documentErrorMessage` por prefijo; `getSignedFileUrl` con 300 s.

## 5. UI

Solo en `PlayerFormPage` en modo edición/vista (`/jugadores/:id`). En modo crear no se muestra nada: las filas se siembran al insertar.

### 5.1 `src/players/PlayerPhoto.tsx`

- En la cabecera del detalle: `Avatar` con la imagen vía URL firmada, o iniciales si no hay foto.
- Admin: **Subir foto** (`accept="image/jpeg,image/png,image/webp"`), o **Cambiar** / **Quitar** si ya existe. Quitar pide confirmación.
- Sin consentimiento: botón deshabilitado con el texto "Requiere consentimiento de imagen y aviso de privacidad". Readonly: solo el avatar.
- Necesita saber el estado del consentimiento: `PlayerFormPage` carga los documentos y se los pasa a ambos componentes; tras cualquier cambio de documento o foto se recargan (fetch-returns-data, sin `setState` dentro de efectos — regla de lint del repo).

### 5.2 `src/documents/PlayerDocumentsSection.tsx`

- Lista mobile-first, una fila por documento: etiqueta + chip de estatus (Pendiente gris, Físico azul, Digital verde, con la paleta del tema).
- **Admin:**
  - Selector de estatus **Pendiente / Físico / Digital**.
  - Elegir **Digital** abre el selector de archivo (`accept="application/pdf,image/jpeg,image/png,image/webp"`); la fila cambia solo al terminar la subida. Cancelar el selector no cambia nada.
  - Con documento digital: **Ver** y **Reemplazar**.
  - Salir de Digital pide confirmación: "Se eliminará el archivo subido".
- **Readonly:** chip + **Ver**.
- **Ver:** `window.open('', '_blank')` **síncrono** en el clic y después se asigna `location` con la URL firmada (si se abre tras el `await`, Safari iOS bloquea el popup). Si la firma falla, se cierra la pestaña y se muestra el error.
- **Candado visible:**
  - Sin consentimiento: `Alert` arriba de la sección explicando el motivo; la opción **Digital** deshabilitada en los 4 documentos no-consentimiento.
  - En los consentimientos: la opción **Pendiente** deshabilitada si hay foto o documentos digitales, con texto explicativo.
  - El servidor vuelve a validar; un rechazo se muestra traducido con `documentErrorMessage`.
- **Feedback:** Snackbar de éxito ("Documento actualizado", "Foto actualizada") y `Alert` de error en línea. Mientras hay una operación en curso en una fila: spinner y controles deshabilitados, con guarda síncrona con `useRef` contra doble envío (mismo patrón que `LoginPage`, #12).

### 5.3 Pruebas (Testing Library)

Admin vs readonly; candado (Digital deshabilitado, foto deshabilitada, consentimientos exentos); Pendiente deshabilitado en consentimientos con archivos; diálogo de confirmación al salir de Digital y al quitar la foto; subida exitosa y con error (mensaje traducido); cancelar el selector no cambia nada; Ver abre la pestaña síncronamente y asigna la URL; doble clic no lanza dos subidas.

## 6. Verificación final

- `pnpm exec vitest run`, `tsc -b`, `pnpm lint` en verde en cada rama.
- pgTAP de §3.6 en verde contra el remoto; advisors sin hallazgos nuevos.
- E2E en navegador (tester con Playwright, el owner pega el magic link): subir un PDF y una foto; verificar el candado (Digital y foto deshabilitados sin consentimiento); revocar bloqueado; Ver abre el archivo; la URL pública del objeto (`/storage/v1/object/public/player-files/…`) responde 400/404.
- Checklist de §7 del spec maestro: "Buckets de Storage en privado, acceso solo por URL firmada" y "Candado de consentimiento verificado" quedan marcados.

## 7. Entrega

| Orden | Rama | Contenido | Depende de |
|---|---|---|---|
| 1 | `feature/documents-db-storage` | §3: migración `0012` + pgTAP, aplicada al remoto | — |
| 2 | `feature/documents-ui` | §4.1 + §5.2 + carga de documentos en `PlayerFormPage` | 1 |
| 3 | `feature/player-photo` | §4.2 + §5.1 | 1, 2 (ambas tocan `PlayerFormPage`; la 3 usa `consentGranted` de la 2) |

En secuencia: la 2 y la 3 tocan `PlayerFormPage` y la 3 reusa el módulo de la 2. El PR de la última rama lleva `Closes #1`; las anteriores, `Refs #1`.
