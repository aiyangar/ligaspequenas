# Spec de diseño — App de Registro y Control de Jugadores (v1)

- **Proyecto**: Liga Infantil y Juvenil de Béisbol de Monterrey, A.C. (Liga MTY AC)
- **Fecha**: 2026-06-22
- **Versión**: v1
- **Fuente**: `Brief App Liga MTY AC.docx` + tabla oficial de edades ALIJBRM/PONY + aclaraciones por WhatsApp (Lizette García, 22-jun-2026)
- **Estado**: aprobado en brainstorming, pendiente de plan de implementación

> Convención: la prosa va en español; **todos los identificadores, nombres de tabla/columna, enums y código van en inglés**.

---

## 1. Objetivo y alcance del v1

Una **aplicación web mobile-first** (se abre desde celular o computadora, sin tienda de apps), detrás de login, que sea la **única fuente de verdad** de la liga y permita:

- **Registro** de cada jugador con sus datos y los de su tutor.
- **Documentos**: control del estatus de los documentos entregados por familia.
- **Pagos**: registrar y consultar pagos (al corriente / pendiente / parcial).
- **Consulta**: filtrar y buscar rápido, y **exportar a Excel**.

Dos roles: **Administrador** (mesa directiva, lee/escribe) y **Solo lectura** (lee y exporta).

La **categoría nunca se captura a mano**: se calcula sola desde la fecha de nacimiento contra la temporada activa, así se actualiza sola cada temporada.

---

## 2. Stack

- **Frontend**: Vite + React + TypeScript (modo estricto) + Tailwind CSS. Mobile-first.
- **Backend**: Supabase — Postgres (datos), Auth (cuentas con invitación), Storage (fotos y documentos en buckets privados), RLS (autorización real).
- **Repo**: GitHub `aiyangar/ligaspequenas` (ya existe).
- **Deploy**: Vercel (scope personal `aiyangar`).
- **Package manager**: pnpm.
- **Proyecto Supabase**: ya provisionado, `project_ref=eksbaugyypadtanyjcje` (ver `.mcp.json`).

### Variables de entorno

- `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY` — públicas, van al bundle. La anon key es rol limitado, protegida por RLS.
- `service_role` key — **jamás** en el frontend ni en el repo. Solo en contextos server-only (edge functions / tareas administrativas).

---

## 3. Arquitectura general

- Una sola base de datos Postgres como fuente única de verdad. Nada de hojas sueltas.
- Toda la app requiere sesión: sin login no se ve nada.
- La categoría es un **dato derivado**, nunca almacenado: se calcula al vuelo en una vista de Postgres contra la temporada activa.
- Multi-tenant desde el modelo de datos (un tenant en el v1; ver sección 10).
- Frontend dividido por features con fronteras claras: `auth`, `players`, `documents`, `payments`, `users`, más `lib` (cliente Supabase, helpers) y un `TenantContext`.

---

## 4. Modelo de datos

Todas las tablas con datos de liga llevan `tenant_id` (ver sección 10). PK = `uuid` con default, `created_at`/`updated_at` timestamptz salvo que se indique.

### 4.1 `tenants`

| Columna | Tipo | Nota |
|---|---|---|
| `id` | uuid PK | |
| `name` | text | Nombre de la liga (ej. "Liga MTY AC"). |
| `slug` | text unique | Futuro subdominio (ej. `ligamtyac`). |
| `is_active` | boolean | |

El v1 siembra **un** tenant: Liga MTY AC.

### 4.2 `profiles`

Extiende a `auth.users` (1:1, `id` = `auth.users.id`).

| Columna | Tipo | Nota |
|---|---|---|
| `id` | uuid PK FK→auth.users | |
| `tenant_id` | uuid FK→tenants | El usuario pertenece a un tenant. |
| `full_name` | text | |
| `role` | enum `user_role` (`admin` \| `readonly`) | |

### 4.3 `seasons`

| Columna | Tipo | Nota |
|---|---|---|
| `id` | uuid PK | |
| `tenant_id` | uuid FK→tenants | |
| `name` | text | Ej. "2026-2027". |
| `cutoff_date` | date | Fecha de corte de edad = 30 abril del año en que cierra la temporada (ej. 2027-04-30). |
| `is_active` | boolean | Solo una activa por tenant (constraint parcial unique). |

Seed v1: `2026-2027`, `cutoff_date = 2027-04-30`, `is_active = true`.

### 4.4 `categories` (tabla de referencia, por tenant)

| Columna | Tipo | Nota |
|---|---|---|
| `id` | uuid PK | |
| `tenant_id` | uuid FK→tenants | Categorías por tenant (otra liga puede tener rangos distintos). |
| `division` | text | Pre-infantil / Infantil / Juvenil / Juvenil Superior. |
| `name` | text | Nombre de categoría. |
| `min_edad_liga` | int | Edad liga mínima (inclusive). |
| `max_edad_liga` | int | Edad liga máxima (inclusive). |
| `sort_order` | int | Para ordenar de menor a mayor. |

**Seed para Liga MTY AC** (tabla oficial ALIJBRM/PONY temporada 2026-2027):

| division | name | min_edad_liga | max_edad_liga |
|---|---|---|---|
| Pre-infantil | Pañalitos | 3 | 4 |
| Pre-infantil | Escuelita | 5 | 6 |
| Infantil | Infantil | 7 | 8 |
| Infantil | Infantil Menor | 9 | 10 |
| Infantil | Infantil Mayor | 11 | 12 |
| Juvenil | Juvenil Menor | 13 | 14 |
| Juvenil | Juvenil Mayor | 15 | 16 |
| Juvenil Superior | Juvenil Superior Menor | 17 | 18 |
| Juvenil Superior | Juvenil Superior Mayor | 19 | 23 |

### 4.5 `players`

| Columna | Tipo | Nota |
|---|---|---|
| `id` | uuid PK | |
| `tenant_id` | uuid FK→tenants | |
| `full_name` | text | |
| `birth_date` | date | **Dato clave.** De aquí salen edad y categoría. |
| `curp` | text | |
| `photo_path` | text null | Ruta en Storage (bucket privado). |
| `status` | enum `player_status` (`activo` \| `baja`) | |
| `enrollment_date` | date | Fecha de inscripción. |
| `tutor_name` | text | |
| `tutor_whatsapp` | text | Teléfono principal de contacto. |
| `tutor_email` | text null | Opcional. |
| `emergency_contact_name` | text null | |
| `emergency_contact_phone` | text null | |
| `affiliation_status` | enum `affiliation_status` (`autoriza` \| `no_autoriza` \| `pendiente`) | Autorización de afiliación a ALIJBRM. Default `pendiente`. |
| `affiliation_date` | date null | Fecha en que el tutor respondió. |

La **categoría no es columna** aquí: se obtiene de la vista `players_with_category` (sección 5).

### 4.6 `documents`

Una fila por (jugador, tipo de documento).

| Columna | Tipo | Nota |
|---|---|---|
| `id` | uuid PK | |
| `tenant_id` | uuid FK→tenants | |
| `player_id` | uuid FK→players | |
| `doc_type` | enum `document_type` | Ver lista abajo. |
| `status` | enum `document_status` (`pendiente` \| `fisico` \| `digital`) | Default `pendiente`. |
| `file_path` | text null | Solo cuando `digital`. Ruta en Storage. |

`document_type`: `curp`, `birth_certificate`, `proof_of_address`, `image_consent`, `privacy_notice`, `medical_clearance`.

Unique `(player_id, doc_type)`. Al crear un jugador se siembran las 6 filas en `pendiente`.

### 4.7 `payments`

| Columna | Tipo | Nota |
|---|---|---|
| `id` | uuid PK | |
| `tenant_id` | uuid FK→tenants | |
| `player_id` | uuid FK→players | |
| `concept` | enum `payment_concept` (`inscripcion` \| `mensualidad` \| `uniforme` \| `otro`) | |
| `concept_note` | text null | Detalle libre cuando `otro`. |
| `amount` | numeric(10,2) | |
| `payment_date` | date | |
| `method` | enum `payment_method` (`efectivo` \| `transferencia`) | |
| `status` | enum `payment_status` (`pagado` \| `pendiente` \| `parcial`) | |

**"Quién debe"** es derivado: un jugador tiene adeudo si tiene algún `payments` con `status in ('pendiente','parcial')`. No se lleva saldo numérico exacto en el v1 (acuerdo: "solo marcar cuánto pagó cada jugador").

---

## 5. Cálculo automático de categoría

### Regla de corte

`edad_liga` = años cumplidos a la fecha de corte de la temporada activa (30 de abril del año en que cierra la temporada). Confirmado contra la tabla oficial: rango de nacimiento de cada edad liga corre del 1 de mayo al 30 de abril.

En SQL: `extract(year from age(season.cutoff_date, players.birth_date))::int`.

### Vista `players_with_category`

Calcula sobre la marcha, leyendo la temporada activa del tenant:

```sql
-- Pseudocódigo de la vista (la implementación final usa la season activa por tenant)
select
  p.*,
  extract(year from age(s.cutoff_date, p.birth_date))::int as edad_liga,
  c.division,
  c.name as category_name,
  case
    when c.id is not null then (extract(year from age(s.cutoff_date, p.birth_date))::int - c.min_edad_liga + 1)
  end as category_year  -- 1ro, 2do, ...
from players p
join seasons s on s.tenant_id = p.tenant_id and s.is_active
left join categories c
  on c.tenant_id = p.tenant_id
 and extract(year from age(s.cutoff_date, p.birth_date))::int
       between c.min_edad_liga and c.max_edad_liga;
```

- **Display**: "category_name (category_year)" → ej. "Infantil Menor (1ro)".
- **Fuera de rango** (edad_liga < 3 o > 23): no hay match en `categories` → `category_name` null → la UI muestra **"Fuera de categoría"** mostrando aún la `edad_liga`. El jugador se registra igual.
- Cuando cambia la temporada activa, todos los jugadores se recategorizan solos.

### Datos de verificación (fixtures de prueba)

Para la temporada 2026-2027 (`cutoff_date = 2027-04-30`):

| birth_date | edad_liga | categoría esperada |
|---|---|---|
| 2023-05-15 | 3 | Pañalitos (1ro) |
| 2024-04-20 | 3 | Pañalitos (1ro) |
| 2024-05-01 | 2 | Fuera de categoría |
| 2019-05-01 | 7 | Infantil (1ro) |
| 2020-04-30 | 7 | Infantil (1ro) |
| 2015-06-10 | 11 | Infantil Mayor (1ro) |
| 2003-06-10 | 23 | Juvenil Superior Mayor (5to) |

---

## 6. Auth y roles

- **Cuentas con invitación**, sin registro público. Un admin invita por correo y asigna rol; cada persona tiene su propio usuario y contraseña.
- Rol almacenado en `profiles.role` (`admin` | `readonly`).
- Pantalla de **Usuarios** (solo admin) para invitar y asignar rol dentro del tenant.

---

## 7. Seguridad — RLS y datos sensibles de menores

> Cumple la sección 4 del brief (datos sensibles de menores).

### RLS desde el día uno (todas las tablas con tenant)

Helpers `SECURITY DEFINER` para evitar recursión de RLS sobre `profiles`:

- `current_tenant_id()` → `tenant_id` del usuario que llama.
- `is_admin()` → boolean si el rol del usuario que llama es `admin`.

Políticas por tabla (`players`, `documents`, `payments`, `seasons`, `categories`):

- **SELECT**: `tenant_id = current_tenant_id()` (admin y readonly).
- **INSERT / UPDATE / DELETE**: `tenant_id = current_tenant_id() AND is_admin()`.

`profiles`: SELECT propio + admins ven los de su tenant; INSERT/UPDATE solo admin dentro del tenant.
`tenants`: SELECT solo el tenant propio; sin escritura desde el cliente (gestión futura vía server-only).

### Storage (datos sensibles)

- Buckets **privados** para fotos y documentos. Nunca públicos.
- Acceso solo vía **URLs firmadas temporales**.
- Rutas namespaceadas por tenant: `{tenant_id}/{player_id}/{doc_type}` (y foto: `{tenant_id}/{player_id}/photo`).
- Políticas de Storage: leer requiere pertenecer al tenant; subir/borrar requiere además `is_admin()`.

### Candado de consentimiento

La app **no permite subir foto ni documentos en digital** mientras `image_consent` o `privacy_notice` estén en `pendiente`. Ambos deben estar en `fisico` o `digital` (firmados). Se valida en cliente y se refuerza con una restricción del lado servidor.

### Acuerdos de la sección 4 del brief

- **Ubicación**: proyecto Supabase bajo cuenta personal `aiyangar` (`project_ref=eksbaugyypadtanyjcje`), región US más cercana a Monterrey. Storage privado.
- **Acceso**: solo usuarios autenticados del tenant; admin escribe, readonly lee; aislado por RLS.
- **Respaldo**: plan free + exportación a Excel de toda la base bajo demanda. Se evalúa Supabase Pro (backups diarios + PITR) antes de cargar volumen real.
- **Consentimiento**: forzado por el sistema (candado anterior). No se cargan fotos/documentos sin aviso de privacidad y consentimiento de imagen firmados.

### Checklist pre-carga de datos reales / pre-merge a `main`

- [ ] Cada tabla con RLS habilitado y al menos una policy explícita.
- [ ] Ningún env var con prefijo público contiene service/admin key.
- [ ] Ningún `.env*` con secretos en git (`git ls-files | grep -E '^\.env'` vacío).
- [ ] Buckets de Storage en privado, acceso solo por URL firmada.
- [ ] Candado de consentimiento verificado.

---

## 8. Pantallas (mobile-first)

- **Login** — correo + contraseña.
- **Lista de jugadores** (principal): nombre, categoría (auto), estatus de pago y de documentos de un vistazo. Filtros: búsqueda por nombre, filtro por categoría y por estatus de pago. Botón **Exportar a Excel**.
- **Detalle / edición de jugador**: formulario de registro (jugador + tutor + afiliación), sección de documentos (estatus por documento + subida si digital, con candado de consentimiento), sección de pagos. Categoría mostrada solo lectura.
- **"Quién debe"**: jugadores con adeudo vs al corriente.
- **Usuarios** (solo admin): invitar cuentas y asignar rol.

Los controles de edición/guardado no se renderizan para `readonly`; aunque se forzaran, RLS bloquea la escritura.

---

## 9. Exportación a Excel

Del lado del cliente con la librería `xlsx`, generando un `.xlsx` a partir del dataset ya filtrado (respeta filtros activos). Incluye categoría calculada, estatus de pago y de documentos. Solo disponible con sesión iniciada.

---

## 10. Multi-tenant por subdominio (cimientos en el v1)

### Se construye en el v1

- Tabla `tenants` y `tenant_id` en todas las tablas con datos de liga.
- RLS con doble candado (tenant + rol) vía `current_tenant_id()` / `is_admin()`.
- Storage namespaceado por tenant.
- Categorías y temporadas por tenant.
- `TenantContext` en el frontend: resuelve el tenant en un solo lugar. En el v1 devuelve el tenant único; mañana lo resuelve por subdominio (`hostname`) sin tocar el resto de la app.
- Seed de un solo tenant (Liga MTY AC).

### Queda para después

- Wildcard de subdominios en Vercel (`*.dominio`) y routing subdominio → tenant.
- Pantalla de alta/onboarding de ligas.
- Usuarios pertenecientes a varias ligas (hoy: un usuario, un tenant). Si se necesita, se reemplaza `profiles.tenant_id` por una tabla de membresías.

Efecto neto: el v1 se ve idéntico a una app de una sola liga, pero por dentro ya está particionado por tenant. Activar multi-tenant = prender routing + dar de alta el tenant, sin migrar modelo ni RLS.

---

## 11. Estrategia de pruebas (TDD)

- **Lógica de categoría** (mayor valor): tests unitarios con los fixtures de la sección 5, incluyendo bordes de mes (abril/mayo) y fuera de rango.
- **RLS**: readonly no puede escribir; sin sesión no se lee; un tenant no ve datos de otro.
- **Candado de consentimiento**: no se permite subir archivo sin los dos consentimientos firmados.
- **Formularios**: validación de campos requeridos.

---

## 12. Fuera de alcance (Fase 2)

Tal cual el brief, no se construye en el v1:

- Estadísticas deportivas y desempeño por jugador.
- Control de asistencia a entrenamientos.
- Calendario de juegos y roles.
- Notificaciones automáticas a papás.

---

## 13. Decisiones tomadas en brainstorming

| Tema | Decisión |
|---|---|
| Backend | Supabase (en vez de Insforge). |
| Granularidad de categoría | Categoría + año (ej. "Infantil Menor (1ro)"). |
| Regla de corte de edad | Edad cumplida al 30 de abril del año de cierre de temporada. |
| Acceso | Cuentas con invitación, sin registro público. |
| Respaldo | Free + export manual en v1; Pro se evalúa antes de data real. |
| Afiliación | Estatus (`autoriza`/`no_autoriza`/`pendiente`) + fecha. |
| Multi-tenant | Cimientos en v1 (data + RLS), routing por subdominio en fase futura. |
