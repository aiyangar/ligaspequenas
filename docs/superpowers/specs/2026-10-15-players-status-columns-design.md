# Lista de jugadores: estatus de pago y documentos (#4) — Diseño

**Fecha:** 2026-10-15
**Estado:** Revisado (revisión adversarial aplicada)
**Issue:** [#4](https://github.com/aiyangar/ligaspequenas/issues/4)
**Spec maestro:** `2026-06-22-liga-mty-registro-jugadores-design.md` §8 (pantallas)
**Specs previos:** `2026-10-14-payments-design.md` (vista `player_payment_status`, `PaymentState`), `2026-10-13-documents-design.md` (estatus de documentos)

## 1. Contexto y objetivo

`PlayersPage` (`src/players/PlayersPage.tsx`) lista a todos los jugadores del tenant desde `players_with_category` vía `fetchPlayers()` (`src/players/players.ts:35-42`), con filtros en cliente por nombre, categoría, estatus y equipo (`PlayersPage.tsx:71-77`). Cada item muestra el nombre y una línea secundaria `categoría · estatus · equipo` (`:162`). Hoy no se ve ni el estado de pago ni el avance de documentos sin abrir el detalle de cada jugador.

Ya existen las piezas:

- `player_payment_status` (`0014`): una fila por jugador (incluidos los de `baja`) con `payment_state` ∈ `con_adeudo` / `sin_pagos` / `al_corriente`, `security_invoker = true`. El spec de pagos (§9) la diseñó para que #4 la consumiera.
- `documents`: exactamente una fila por jugador y tipo (`unique (player_id, doc_type)`, `0001`), sembradas en `pendiente` por `trg_players_seed_documents` (`0008`); estatus `pendiente` / `fisico` / `digital`.
- En TS: `PaymentState` y `PAYMENT_STATE_LABELS` (`src/payments/payments.ts:191-197`, de #3) y `DOCUMENT_TYPES` (6 tipos, `src/documents/documents.ts:33-40`).

Objetivo:

- Cada jugador de la lista muestra **dos chips**: estado de pago y "Docs N/6".
- Dos filtros nuevos: **Pago** y **Documentos**, combinables con los existentes.
- Los dos datos llegan como **columnas nuevas de `players_with_category`**, para que la lista (y después la exportación de #5) los lean en la misma consulta que ya hace.

Fuera de alcance:

- **#71** (las `List` renderizan `<a>` directo dentro de `<ul>`, sin `<li>`). Toca el mismo bloque de `PlayersPage.tsx` (`:157-168`) pero es otra issue y otra rama; este cambio no lo arregla ni lo empeora (§5.4).
- **#5** (exportación a Excel): consumirá estas columnas; no se implementa aquí.
- **#72** (nombre accesible del enlace de deudor en "Quién debe"). Nota relacionada en §9.
- Cambios a `player_payment_status` (`0014` no se edita), a `documents`, a `payments` o a sus políticas RLS.
- Cambiar `DebtorsPage` / `buildDebtGroups` para que usen la columna nueva en vez de `fetchPaymentStatuses()`.

## 2. Decisiones

| Decisión | Elección |
|---|---|
| Dónde se calculan los datos | **En `players_with_category`**, con dos columnas agregadas **al final**: `payment_state` y `docs_delivered`. Descartado: leer `player_payment_status` y `documents` aparte y unir en el cliente — serían dos consultas más en la lista y #5 tendría que repetirlo. |
| Forma de la migración | `create or replace view` en `0015`, mismo `with (security_invoker = true)`, **mismas columnas en el mismo orden** y las dos nuevas al final. `create or replace view` solo permite agregar columnas al final; cualquier cambio de orden o tipo falla al aplicar, lo que sirve de guarda. `0014` no se toca. |
| Origen de `payment_state` | `left join player_payment_status` por `player_id` (una fila por jugador, no multiplica filas) con `coalesce(…, 'sin_pagos')`. El `coalesce` no debería dispararse (ambas vistas corren con los permisos del mismo usuario sobre `players`), pero deja la columna no nula y coincide con el criterio de `buildDebtGroups` para un jugador sin fila en la vista (`payments.ts:252`). |
| Origen de `docs_delivered` | Subconsulta escalar `count(*)::int` de `documents` del jugador con `status in ('fisico', 'digital')`. Escalar (no `join` + `group by`) para no tocar los joins existentes ni agrupar por `p.*`. `::int` para que PostgREST devuelva un `number` simple. |
| Total de documentos | `DOCUMENT_TOTAL = DOCUMENT_TYPES.length` exportado desde `src/documents/documents.ts`; nada de un `6` literal en la UI ni en las pruebas de UI. "Completos" = `docs_delivered >= DOCUMENT_TOTAL` (§5.2). |
| Colores del chip de pago | `PAYMENT_STATE_COLOR: Record<PaymentState, 'warning' \| 'default' \| 'success'>` en `payments.ts`, junto a `PAYMENT_STATE_LABELS` y con la forma de `PAYMENT_STATUS_COLOR` (`:60-64`): `con_adeudo` → `warning`, `sin_pagos` → `default`, `al_corriente` → `success`. Hoy **no existe** un mapa de colores para `PaymentState` (#3 solo agregó etiquetas; `DebtorsPage` usa secciones, no chips por estado). |
| Ubicación de los chips | **Debajo** de la línea secundaria actual, en una fila que hace `wrap`. La línea `categoría · estatus · equipo` no cambia (las pruebas existentes la buscan por texto, `PlayersPage.test.tsx:76-81`). |
| Filtros | Cliente, como los existentes (la lista ya trae todo el tenant). Dos `TextField select` nativos más: **Pago** y **Documentos**. Todos los filtros se combinan con AND. |
| `fetchPlayers` / `fetchPlayer` | **Sin cambios**: ya usan `select('*')`, así que las columnas nuevas llegan solas. Solo cambia el tipo `PlayerRow`. |
| Entrega | Un spec + un plan; una rama `feature/players-status-columns` con migración, tipos, UI y pruebas (§8). |

## 3. Base de datos — `supabase/migrations/0015_players_view_status_columns.sql`

### 3.1 Vista

Definición actual (`0011`) + las dos columnas al final:

```sql
create or replace view players_with_category with (security_invoker = true) as
select
  p.*,
  extract(year from age(s.cutoff_date, p.birth_date))::int as edad_liga,
  c.division,
  c.name as category_name,
  case
    when c.id is not null
    then extract(year from age(s.cutoff_date, p.birth_date))::int - c.min_edad_liga + 1
  end as category_year,
  c.id as category_id,
  t.id as team_id,
  t.name as team_name,
  coalesce(pps.payment_state, 'sin_pagos') as payment_state,
  (
    select count(*)::int
    from documents d
    where d.player_id = p.id
      and d.tenant_id = p.tenant_id
      and d.status in ('fisico', 'digital')
  ) as docs_delivered
from players p
left join seasons s on s.tenant_id = p.tenant_id and s.is_active
left join categories c
  on c.tenant_id = p.tenant_id
 and extract(year from age(s.cutoff_date, p.birth_date))::int between c.min_edad_liga and c.max_edad_liga
left join team_players tp on tp.player_id = p.id and tp.season_id = s.id
left join teams t on t.id = tp.team_id
left join player_payment_status pps on pps.player_id = p.id;
```

- **Orden de columnas.** `p.*` se expande al crear la vista. Ninguna migración posterior a `0001` agregó columnas a `players` (solo un constraint en `0006`), así que la expansión es idéntica a la de `0011` y las columnas existentes quedan en su lugar. Si `create or replace` detectara un cambio, Postgres rechaza la migración (§9).
- **`security_invoker = true`** se repite explícitamente: `create or replace view` sin la opción la **quitaría**. Con él, `players`, `documents` y `player_payment_status` (también invoker) se leen con los permisos de quien consulta; la RLS tenant aplica a las tres.
- `d.tenant_id = p.tenant_id` es redundante con RLS pero deja explícito el aislamiento, igual que el join de `0014`.
- Sin `grant`/`revoke`: `create or replace` conserva los privilegios actuales de la vista.
- Índices: `documents_player_idx` y `payments_player_idx` cubren la subconsulta y el agregado de `player_payment_status`. Volumen de una liga; sin índices nuevos.
- **Dependencia nueva:** `players_with_category` pasa a depender de `player_payment_status`. Un futuro `drop view player_payment_status` fallará sin `cascade`; un `create or replace` de `0014` que solo agregue columnas al final sigue funcionando (§9).
- Después de aplicar, PostgREST recarga el esquema solo (event trigger de Supabase). Si `select('*')` no trae las columnas nuevas, `notify pgrst, 'reload schema';`.
- **Plan de consulta.** Después de aplicar se corre (solo lectura, vía MCP `execute_sql`) `explain select * from players_with_category where id = '<id de un jugador fixture>'` y el plan se registra en la evidencia del PR. Un hash join o seq scan sobre `payments` / `documents` es aceptable a escala de liga, pero debe quedar documentado.

### 3.2 Consumidores verificados

Grep de `players_with_category` / `PlayerRow` en `src/` y `supabase/`:

| Consumidor | Uso | Efecto |
|---|---|---|
| `src/players/players.ts:35-51` `fetchPlayers`, `fetchPlayer` | `select('*')` | Reciben las columnas nuevas; sin cambio de código. |
| `src/teams/teams.ts:91-111` `fetchRoster`, `fetchEligiblePlayers` | `select('*')` + filtros por `team_id`, `category_id`, `status` | Reciben las columnas; no las usan. Filtros intactos. |
| `PlayerFormPage`, `PlayerPhoto`, `TeamDetailPage`, `AddPlayerDialog`, `DebtorsPage`, `payments.ts` (`buildDebtGroups`) | Leen campos de `PlayerRow` por nombre | Sin cambio de comportamiento. |
| `supabase/tests/0005`, `0007`, `0011` | Columnas existentes por nombre / `has_column` | Siguen válidos (append-only). |
| **Fixtures de `PlayerRow` en pruebas** (`tsc -b` incluye `src/`, `tsconfig.app.json:21`): `src/payments/payments.test.ts:195`, `src/payments/DebtorsPage.test.tsx:29`, `src/players/players.test.ts:23`, `src/players/PlayersPage.test.tsx:15`, `src/players/PlayerFormPage.test.tsx:74`, `src/teams/teams.test.ts:16`, `src/teams/TeamDetailPage.test.tsx:23`, `src/teams/AddPlayerDialog.test.tsx:13` | Construyen un `PlayerRow` completo | **Hay que agregar** `payment_state: 'sin_pagos', docs_delivered: 0` en cada uno, o el typecheck falla. Cambio mecánico, sin cambiar aserciones. |

### 3.3 Pruebas — `supabase/tests/0015_players_view_status_columns.test.sql`

Misma mecánica que §3.2 del spec de pagos: archivo canónico con `begin; select extensions.plan(n); … select * from extensions.finish(); rollback;` (forma de `supabase/tests/0014_player_payment_status_view.test.sql`), y la evidencia se corre vía MCP `execute_sql` contra el remoto:

- `execute_sql` **no hace rollback**: fixtures con prefijo UUID propio `eeeeeeee-…` (no usado por otras pruebas), **borrado explícito al final** (jugadores — documentos y pagos caen por `on delete cascade` —, luego perfiles, `auth.users` y tenants) y conteos de `tenants`, `players`, `documents`, `payments`, `profiles` y `auth.users` de vuelta a la línea base tomada antes de crear nada.
- El cambio de rol (`set_config('role', …, true)` / `request.jwt.claims`) es local a la transacción: **rol y aserción van en la misma llamada** a `execute_sql`.
- Valores con `is()` (truco de dos sentencias, memoria del proyecto); estructura por catálogo.
- Advisors después del DDL.

**Fixtures.** Tenants A y B (sin temporada activa: la vista los incluye por el `left join seasons` de `0007`), admin A, readonly A, admin B. Jugadores insertados → `trg_players_seed_documents` les crea sus 6 documentos en `pendiente`. Para marcar entregados se hace `update documents set status = 'fisico'`; un caso usa `digital` sobre `image_consent` con `file_path = '<tenant>/<player>/image_consent'` (los tipos de consentimiento no exigen consentimiento previo y el `file_path` cumple `documents_file_path_iff_digital` y el trigger de `0013`).

Casos:

- **Estructura:**
  - `security_invoker=true` sigue en `pg_class.reloptions` de `public.players_with_category`;
  - `information_schema.columns` de la vista: las columnas existentes **en el mismo orden** que antes de aplicar (la corrida MCP guarda la lista `string_agg(column_name order by ordinal_position)` **antes** de `apply_migration` y compara que la nueva lista = la anterior + `,payment_state,docs_delivered`); el archivo canónico afirma la lista completa literal;
  - tipos: `docs_delivered` es `integer`, `payment_state` es `text`.
- **Valores (como `postgres`):**
  - jugador sin pagos, documentos sin tocar → `sin_pagos`, `0`;
  - jugador con un `pagado` → `al_corriente`;
  - jugador con un `pendiente` → `con_adeudo`;
  - jugador con 3 documentos `fisico` → `3`;
  - jugador con 5 `fisico` + `image_consent` `digital` → `6`;
  - jugador de `baja` con un `parcial` → aparece, `con_adeudo`;
  - **una fila por jugador** (varios pagos y documentos no duplican filas: `count(*) where id = …` = 1).
- **Aislamiento y `security_invoker`** (patrón de `0014`):
  - admin A ve solo jugadores del tenant A, y con sus valores (`payment_state`, `docs_delivered`) correctos;
  - admin A: 0 filas con `tenant_id` de B;
  - readonly A ve las mismas filas que admin A;
  - admin B ve solo su jugador;
  - `anon` → `diag` de `has_table_privilege('anon', 'public.players_with_category', 'select')` y luego **0 filas**.

## 4. Capa de datos y tipos

- `src/players/players.ts` — `PlayerRow` agrega, al final y en el orden de la vista:
  ```ts
  payment_state: PaymentState
  docs_delivered: number
  ```
  `PaymentState` se importa como tipo desde `../payments/payments`. Es `import type`, así que no crea un ciclo en runtime aunque `payments.ts` ya importe `PlayerRow` de `players.ts`.
- `fetchPlayers` / `fetchPlayer`: sin cambios (`select('*')`). Por eso **no hay prueba nueva de la capa de datos**; `players.test.ts` solo actualiza su fixture.
- `src/payments/payments.ts`: agrega `PAYMENT_STATE_COLOR` (§2).
- `src/documents/documents.ts`: agrega `export const DOCUMENT_TOTAL = DOCUMENT_TYPES.length`.

## 5. UI — `src/players/PlayersPage.tsx`

### 5.1 Chips por jugador

- Dentro del `ListItemButton` actual, un contenedor explícito `<Box sx={{ minWidth: 0, flex: 1 }}>` envuelve la `ListItemText` (primario y secundario **sin cambios**) y, debajo, una fila de chips: `Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: 'wrap', mt: 0.5 }}`. `ListItemButton` es `display: flex` en fila, así que sin ese `Box` la `ListItemText` y el `Stack` quedarían lado a lado; el `Box` es el único hijo flex, ocupa el ancho (`flex: 1`) y con `minWidth: 0` el contenido no ensancha el item. Dentro del `Box` (bloque) la `ListItemText` y el `Stack` se apilan. Los chips no van dentro de `secondary` (que es un `<p>`: un `div` dentro sería HTML inválido).
- **Chip de pago:** `<Chip size="small" label={PAYMENT_STATE_LABELS[p.payment_state]} color={PAYMENT_STATE_COLOR[p.payment_state]} />` → "Con adeudo" ámbar, "Sin pagos" gris, "Al corriente" verde.
- **Chip de documentos:** label `Docs ${p.docs_delivered}/${DOCUMENT_TOTAL}`; `color="success"` si `docs_delivered >= DOCUMENT_TOTAL`, `color="warning"` en otro caso (incluido 0). Mismo umbral que el filtro **Documentos** (§5.2).
- Se muestran para todos los jugadores, también los de `baja`.

### 5.2 Filtros

Dos `TextField` más en el `Stack` de filtros, después de **Equipo**, con el mismo patrón (`select`, `slotProps={{ select: { native: true }, inputLabel: { shrink: true } }}`):

| Filtro | Estado | Opciones (valor → texto) | Regla |
|---|---|---|---|
| **Pago** (`minWidth: 160`) | `paymentState: '' \| PaymentState` | `''` Todos · `con_adeudo` Con adeudo · `sin_pagos` Sin pagos · `al_corriente` Al corriente (textos de `PAYMENT_STATE_LABELS`) | `p.payment_state === paymentState` |
| **Documentos** (`minWidth: 160`) | `docsFilter: '' \| 'completos' \| 'incompletos'` | `''` Todos · `completos` Completos · `incompletos` Incompletos | completos: `docs_delivered >= DOCUMENT_TOTAL`; incompletos: `docs_delivered < DOCUMENT_TOTAL` |

En `visible` (`:71-77`) se agregan dos condiciones más; todas se combinan con AND. Las opciones son fijas (no se derivan de los datos, a diferencia de Categoría y Equipo). Si la combinación no deja a nadie, la lista queda vacía, como hoy.

Umbral `>=` (no `===`): si `DOCUMENT_TYPES` quedara por detrás del enum (§9) y llegara un `docs_delivered` mayor que `DOCUMENT_TOTAL`, el jugador cuenta como completo en el filtro y en el color del chip, en vez de caer en "Incompletos".

**Fuera de alcance de #4:** un mensaje de "sin resultados" cuando los filtros no dejan a nadie. La lista queda vacía, como hoy; el orquestador lo registra como issue de seguimiento.

### 5.3 Roles

Admin y readonly ven **la misma lista**, chips y filtros: son lecturas y la RLS ya deja a readonly leer jugadores, pagos y documentos de su tenant. El único elemento por rol sigue siendo **Nuevo jugador** (`:90-94`).

### 5.4 Mobile-first

- Los chips hacen `wrap` debajo del nombre; en 360 px de ancho no hay scroll horizontal.
- Los filtros siguen en `direction={{ xs: 'column', sm: 'row' }}` con `flexWrap`: en móvil se apilan como hoy (ahora 6 controles); en `sm+` fluyen en filas.
- Estructura `List` → `ListItemButton` sin cambiar: #71 se arregla aparte; quien lo implemente después envuelve el mismo `ListItemButton` (con sus chips) en `ListItem`.

### 5.5 Errores y estados

| Situación | Comportamiento |
|---|---|
| Falla `fetchPlayers()` | `LoadError` + Reintentar, sin cambios (`:98`). Las columnas nuevas vienen en la misma consulta: no hay estado de error parcial. |
| Columnas nuevas ausentes (migración no aplicada en un entorno) | `payment_state` `undefined` → el chip quedaría sin texto. Mitigación por proceso: la migración se aplica al remoto antes de mergear la rama (§8). No se agrega código defensivo. |
| Sin jugadores o filtros sin coincidencias | Lista vacía, como hoy. Un mensaje de "sin resultados" queda **fuera de alcance** de #4 (issue de seguimiento, §5.2). |

## 6. Pruebas (Vitest + Testing Library)

`src/players/PlayersPage.test.tsx` — el fixture `player()` agrega `payment_state: 'sin_pagos', docs_delivered: 0` y los jugadores de `beforeEach` pasan a cubrir los casos. Fixture **obligatorio** de tres jugadores, para que aparezcan los tres estados de pago y haya combinaciones que coinciden con un filtro y no con el otro:

| Jugador | `payment_state` | `status` | `docs_delivered` |
|---|---|---|---|
| Ana | `con_adeudo` | `activo` | `DOCUMENT_TOTAL` |
| Beto | `sin_pagos` | `baja` (el actual del fixture) | `2` |
| Carla | `al_corriente` | `activo` | `DOCUMENT_TOTAL - 1` |

Casos nuevos:

- chip de pago con la etiqueta de cada estado; chip "Docs N/total" (total construido con `DOCUMENT_TOTAL`, no literal);
- color: el chip completo tiene la clase de `success` y el incompleto la de `warning`; igual para los tres estados de pago. Aserción por la raíz del chip, con el patrón de `PlayerFormPage.test.tsx:233` (`closest('.MuiAlert-root')` + `toHaveClass`): `expect(within(list).getByText(`Docs ${DOCUMENT_TOTAL}/${DOCUMENT_TOTAL}`).closest('.MuiChip-root')).toHaveClass('MuiChip-colorSuccess')`;
- umbral: un jugador con `docs_delivered: DOCUMENT_TOTAL + 1` aparece en **Completos** (no en Incompletos) y su chip es `MuiChip-colorSuccess`;
- filtro **Pago**: cada opción deja solo a los jugadores de ese estado; **Todos** los restaura;
- filtro **Documentos**: Completos / Incompletos / Todos;
- **combinaciones** (AND): Pago = Con adeudo + Documentos = Completos → solo Ana; Pago = Al corriente + Documentos = Completos → lista vacía (Carla coincide con Pago pero no con Documentos, Ana al revés), lo que prueba AND y no OR; Pago + Estatus también;
- readonly ve los mismos chips y filtros (y no ve Nuevo jugador, ya cubierto).

Las etiquetas "Con adeudo", "Sin pagos" y "Al corriente" aparecen en las `<option>` del filtro **y** en los chips: las aserciones de chips se hacen `within(screen.getByRole('list'))` (mismo problema que ya resuelve el comentario de `PlayersPage.test.tsx:79`).

Actualizaciones mecánicas: fixtures de `PlayerRow` de §3.2. `payments.test.ts` agrega una prueba de `PAYMENT_STATE_COLOR`; `documents.test.ts`, que `DOCUMENT_TOTAL === DOCUMENT_TYPES.length`. Sin prueba nueva de `fetchPlayers` (no cambia).

pgTAP: §3.3.

## 7. Resumen de archivos

| Archivo | Cambio |
|---|---|
| `supabase/migrations/0015_players_view_status_columns.sql` | Nueva (§3.1). |
| `supabase/tests/0015_players_view_status_columns.test.sql` | Nueva (§3.3). |
| `src/players/players.ts` | `PlayerRow` + 2 campos. |
| `src/payments/payments.ts` | `PAYMENT_STATE_COLOR`. |
| `src/documents/documents.ts` | `DOCUMENT_TOTAL`. |
| `src/players/PlayersPage.tsx` | Chips + 2 filtros. |
| `src/players/PlayersPage.test.tsx` | Casos de §6. |
| 7 archivos de prueba más con fixtures de `PlayerRow` | Agregar los 2 campos. |

## 8. Entrega

Una rama: **`feature/players-status-columns`**, PR con `Closes #4`.

Orden dentro de la rama: (1) migración `0015` + pgTAP aplicada al remoto vía MCP `apply_migration`, con la lista de columnas capturada antes y el `explain` de §3.1; (2) tipos y constantes + fixtures; (3) UI y pruebas.

**Migración aplicada = inmutable.** `apply_migration` corre contra el remoto antes del review y `supabase_migrations.schema_migrations` registra el nombre aplicado (`0015_players_view_status_columns`). Una vez aplicada, `0015` **no se vuelve a editar** en el repo: cualquier cambio que pida el review sale como una migración nueva `0016_…` (`create or replace view`, append-only, con su pgTAP), para que el repo y `schema_migrations` no diverjan.

Verificación:

- `pnpm exec vitest run`, `tsc -b`, `pnpm lint` en verde;
- corrida pgTAP vía MCP de §3.3 en verde contra el remoto (fixtures borrados, conteos en línea base, incluido `auth.users`); advisors sin hallazgos nuevos; plan del `explain` registrado (§3.1);
- E2E en navegador (tester con Playwright, el owner pega el magic link): como admin, ver chips y usar ambos filtros combinados con Estatus; registrar un pago pendiente o marcar un documento en el detalle y comprobar al volver que el chip cambia; como readonly, la misma lista; en viewport de 360 px, sin scroll horizontal;
- **datos del E2E:** el tester crea jugadores de prueba dedicados con prefijo `E2E Status` en el nombre y solo sobre ellos registra pagos o marca documentos; **nunca se modifican jugadores reales**. Al terminar, el orquestador los borra por SQL (`delete from players where full_name like 'E2E Status%'`; pagos y documentos caen por `on delete cascade`) y confirma que no queda ninguno.

## 9. Riesgos abiertos

- **Rollback.** No se edita ni se revierte `0015` en el repo (§8). Si hay que deshacerla, va una migración nueva que hace `drop view players_with_category` y la vuelve a crear con la definición de `0011` (con `with (security_invoker = true)`). `drop` + `create` resetea los privilegios a los default del esquema (las migraciones de esta vista nunca hicieron `grant` explícito), así que su pgTAP verifica `security_invoker=true` en `reloptions`, `has_table_privilege('authenticated', 'public.players_with_category', 'select')` = `true`, y registra con `diag` el de `anon`. Nada depende hoy de `players_with_category`, así que el `drop` no necesita `cascade`.
- **Migración frágil ante cambios a `players`.** `p.*` se re-expande en cada `create or replace`. Si una migración futura agrega columnas a `players`, recrear esta vista fallará (columnas nuevas en medio). Es preexistente (`0007` y `0011` ya dependían de esto); la solución entonces es `drop view … ; create view …` con sus grants y dependencias.
- **Vista dependiente de `player_payment_status`.** Ver §3.1. Cualquier cambio a `0014` que no sea agregar columnas al final requiere recrear ambas.
- **Costo por lectura.** Toda lectura de `players_with_category` (incluidas `fetchPlayer`, `fetchRoster` y `fetchEligiblePlayers`) calcula ahora el agregado de pagos y el conteo de documentos. Adecuado al tamaño de una liga; si crece, el plan sería una vista o función aparte solo para la lista.
- **Dos fuentes de estado de pago en "Quién debe".** `DebtorsPage` sigue usando `fetchPaymentStatuses()` + pagos pendientes, aunque `fetchPlayers()` ya traerá `payment_state`. Unificarlo es simplificación posterior, no parte de #4.
- **Nombre accesible del enlace.** El texto de los chips ("Con adeudo", "Docs 3/6") pasa a formar parte del nombre accesible de cada `ListItemButton`, como el desglose de #72 en "Quién debe". Aquí es corto e informativo; se acepta y se revisa junto con #71/#72.
- **Total fijo en el cliente.** `DOCUMENT_TOTAL` depende de que `DOCUMENT_TYPES` refleje el enum `document_type`; si el enum crece y la lista TS no, "Completos" sería incorrecto. Ya es un supuesto de la sección de documentos.
