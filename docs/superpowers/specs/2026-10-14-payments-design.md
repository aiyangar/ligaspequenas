# Pagos por jugador (#2) y vista "Quién debe" (#3) — Diseño

**Fecha:** 2026-10-14
**Estado:** Borrador (diseño aprobado por el owner; pendiente de revisión adversarial)
**Issues:** [#2](https://github.com/aiyangar/ligaspequenas/issues/2), [#3](https://github.com/aiyangar/ligaspequenas/issues/3)
**Spec maestro:** `2026-06-22-liga-mty-registro-jugadores-design.md` §4.7 (tabla `payments`, "Quién debe" derivado) y §8 (pantallas)

## 1. Contexto y objetivo

La tabla `payments` existe desde `0001` con sus enums (`payment_concept`, `payment_method`, `payment_status`), FK compuesta `(player_id, tenant_id) → players` con `on delete cascade` (`0006`) y RLS tenant-lee / admin-escribe (`0002`, reescrita sobre `private.*` en `0003`). Nada en `src/` la usa todavía, y `/quien-debe` es un `PlaceholderPage`.

Objetivo:

- **#2:** en el detalle del jugador, el admin registra, edita y borra pagos; readonly los ve.
- **#3:** la página **Quién debe** agrupa a los jugadores activos en **Con adeudo**, **Sin pagos** y **Al corriente**, con el desglose de lo pendiente para quienes deben.
- El estado de pago por jugador se calcula en **una vista** (`player_payment_status`) reutilizable por #4.

Fuera de alcance:

- **Saldo / total esperado.** El v1 no guarda cuánto *debería* pagar cada jugador (spec maestro §4.7: "solo marcar cuánto pagó cada jugador").
- **#4** (columna de estatus de pago y filtro en `PlayersPage`). La vista de §3 se diseña para que #4 la consuma sin cambios, pero #4 no se implementa aquí.
- **Exportación a Excel** (#5).
- Cambios a la tabla `payments` o a sus políticas RLS.

## 2. Decisiones

| Decisión | Elección |
|---|---|
| Semántica de una fila | **Una fila por cargo** (concepto). `amount` = lo que el jugador lleva pagado de ese cargo. Un `parcial` se liquida **editando la misma fila** (subir `amount`, pasar a `pagado`), no agregando otra. Descartado: una fila por abono — sin total esperado no se podría saber cuándo un cargo queda liquidado. |
| Estado por jugador | Vista `player_payment_status` con `security_invoker = true`, columna `payment_state` (`text`): `con_adeudo` si tiene algún pago `pendiente` o `parcial`; `sin_pagos` si no tiene filas; `al_corriente` en otro caso. Descartado: calcularlo solo en el cliente — #4 lo necesitaría de nuevo y no se podría filtrar del lado servidor. |
| Columnas de la vista | Solo `player_id`, `tenant_id`, `payment_state`. Nombre, estatus del jugador y categoría vienen de `players_with_category` (vía `fetchPlayers()` existente) y se unen en el cliente. Así la vista no duplica columnas de jugador ni depende de la temporada activa. |
| Validación `concept_note` / `amount` | **Solo en cliente** (el owner descartó cambios a la tabla). `concept_note` obligatoria si `concept = 'otro'`, opcional en los demás (p. ej. "Octubre" en una mensualidad); `amount > 0`. Riesgo aceptado en §9. |
| Carga de pagos en el detalle | **La sección carga sus propios pagos** (a diferencia de documentos, que carga `PlayerFormPage` porque `PlayerPhoto` también los necesita). Ningún otro componente del detalle usa pagos. |
| Escrituras con 0 filas | `update` y `delete` piden `.select('id')`; 0 filas devueltas se trata como error ("No se encontró el pago o no tienes permiso."). RLS no lanza error cuando filtra la fila de un `update`/`delete`, solo no la toca. |
| Fecha por defecto | `payment_date` = hoy en **hora local** (`YYYY-MM-DD` armado con `getFullYear/getMonth/getDate`), no `toISOString()` — en Monterrey (UTC−6) eso daría mañana después de las 18:00. |
| Formato de dinero | `Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' })`. |
| Entrega | Un spec + un plan; dos ramas en secuencia (§8). |

## 3. Base de datos — `supabase/migrations/0014_player_payment_status_view.sql`

### 3.1 Vista

```sql
create view player_payment_status with (security_invoker = true) as
select
  p.id as player_id,
  p.tenant_id,
  case
    when bool_or(pay.status in ('pendiente', 'parcial')) then 'con_adeudo'
    when count(pay.id) = 0 then 'sin_pagos'
    else 'al_corriente'
  end as payment_state
from players p
left join payments pay on pay.player_id = p.id and pay.tenant_id = p.tenant_id
group by p.id, p.tenant_id;
```

- Una fila por jugador, **incluidos los de `baja`**: el filtro de activos lo aplica cada consumidor (#3 aquí, #4 después), para no amarrar la vista a una pantalla.
- `bool_or` sobre un jugador sin pagos da `null`, que cae a la rama `count = 0`.
- `security_invoker = true`, igual que `players_with_category` (`0005`/`0007`/`0011`): la vista corre con los permisos de quien consulta, así que la RLS de `players` y `payments` (tenant) aplica tal cual. Sin `grant` explícito: `0005` tampoco lo tiene y los privilegios por defecto de Supabase en `public` ya cubren `authenticated`.
- La RLS de `payments` filtra por `tenant_id`; la de `players` igual. Como la FK es compuesta `(player_id, tenant_id)`, el `pay.tenant_id = p.tenant_id` del join es redundante pero deja explícito el aislamiento.
- No toca `payments`, sus índices ni sus políticas. Los índices `payments_player_idx` y `payments_tenant_idx` ya cubren el join.

### 3.2 Pruebas — `supabase/tests/0014_player_payment_status_view.test.sql`

pgTAP aplicado vía MCP contra el remoto (no hay Docker local; truco de dos sentencias con `is()`, ver memoria del proyecto). Fixtures propios dentro de la transacción o limpiados al final; advisors después del DDL.

- Estructura: `has_view`, columnas `player_id`, `tenant_id`, `payment_state`; `security_invoker` activo (`pg_class.reloptions` contiene `security_invoker=true`).
- Agrupación (como `postgres`, con un tenant de fixture):
  - jugador sin pagos → `sin_pagos`;
  - solo `pagado` → `al_corriente`;
  - un `pagado` + un `parcial` → `con_adeudo`;
  - solo `pendiente` → `con_adeudo`;
  - jugador de `baja` con un `pendiente` → aparece, `con_adeudo`;
  - exactamente una fila por jugador aunque tenga varios pagos.
- Aislamiento y `security_invoker` (simulando `authenticated` con `set_config('role', …)` + `request.jwt.claims`, patrón de `0002_rls.test.sql`):
  - un usuario del tenant A no ve filas de jugadores del tenant B;
  - un readonly del tenant A ve las filas de su tenant (lectura permitida);
  - como `anon` no obtiene filas (0 filas o permiso denegado, según los grants vigentes; se fija el resultado real al escribir la prueba).

## 4. Capa de datos — `src/payments/payments.ts`

Mismo estilo que `src/documents/documents.ts` y `src/teams/teams.ts`: lecturas lanzan `Error` (la UI las convierte en `LoadError`); escrituras devuelven `{ ok, error? }` (`MutationResult`).

### 4.1 Tipos y etiquetas

- `PaymentConcept`, `PaymentMethod`, `PaymentStatus`, `PaymentState = 'con_adeudo' | 'al_corriente' | 'sin_pagos'`.
- `PaymentRow`: `id, tenant_id, player_id, concept, concept_note, amount, payment_date, method, status, created_at, updated_at`. `amount` llega de PostgREST como `number` (numeric) y se normaliza con `Number(...)` al leer.
- `PaymentFormValues`: `concept, concept_note, amount` (string del input), `payment_date, method, status`.
- Etiquetas:

  | Enum | Valores → etiqueta |
  |---|---|
  | `concept` | `inscripcion` Inscripción · `mensualidad` Mensualidad · `uniforme` Uniforme · `otro` Otro |
  | `method` | `efectivo` Efectivo · `transferencia` Transferencia |
  | `status` | `pagado` Pagado · `pendiente` Pendiente · `parcial` Parcial |
  | `payment_state` | `con_adeudo` Con adeudo · `sin_pagos` Sin pagos · `al_corriente` Al corriente |

### 4.2 Funciones

- **`emptyPayment(today = localToday())`** → `concept: 'inscripcion'`, `concept_note: ''`, `amount: ''`, `payment_date: today`, `method: 'efectivo'`, `status: 'pagado'`.
- **`localToday()`** → `YYYY-MM-DD` en hora local (§2).
- **`validatePayment(values)`** → `Partial<Record<keyof PaymentFormValues, string>>` (vacío = válido):
  - `concept_note` vacío (tras `trim`) con `concept = 'otro'` → "Describe el concepto.";
  - `amount` no numérico, `<= 0`, con más de 2 decimales o `> 99999999.99` (límite de `numeric(10,2)`) → "Ingresa un monto mayor a 0 con hasta 2 decimales.";
  - `payment_date` vacío → "Ingresa la fecha.".
- **`paymentText(row)`** → etiqueta del concepto, más ` — ${concept_note}` si hay nota.
- **`formatMoney(amount)`** → MXN es-MX.
- **`fetchPlayerPayments(playerId)`** → `payments` del jugador ordenados por `payment_date desc`, luego `created_at desc`.
- **`createPayment(playerId, tenantId, values)`** → insert con `concept_note` recortada (vacía → `null`) y `amount: Number(values.amount)`.
- **`updatePayment(id, values)`** → update + `.select('id')`; 0 filas → error (§2).
- **`deletePayment(id)`** → delete + `.select('id')`; 0 filas → error.
- **`paymentErrorMessage(message)`** → `row-level security|unauthorized|403` → "No tienes permiso para esta acción."; cualquier otro, el mensaje original (mismo criterio que `documentErrorMessage`).

Para #3:

- **`fetchPaymentStatuses()`** → todas las filas visibles de `player_payment_status`.
- **`fetchOutstandingPayments()`** → `payments` con `status in ('pendiente','parcial')`, ordenados por `payment_date`.
- **`buildDebtGroups(players, statuses, outstanding)`** (pura) → `{ con_adeudo: { player, payments }[], sin_pagos: player[], al_corriente: player[] }`:
  - solo jugadores con `status = 'activo'`;
  - cada grupo ordenado por `full_name`;
  - un jugador activo sin fila en `statuses` (no debería pasar: la vista tiene una fila por jugador) se trata como `sin_pagos`.

### 4.3 Pruebas (Vitest, cliente de Supabase mockeado como en `documents.test.ts`)

`validatePayment` (nota obligatoria solo con `otro`; monto 0, negativo, texto, 3 decimales, sobre el límite; fecha vacía); `localToday` con un `Date` fijado cerca de medianoche UTC; insert con nota recortada / `null` y `amount` numérico; `update`/`delete` con 0 filas → error; orden de `fetchPlayerPayments`; errores de lectura lanzan; `paymentErrorMessage` traduce RLS; `buildDebtGroups` (excluye `baja`, orden por nombre, asocia los pagos pendientes al jugador correcto, jugador sin fila en la vista → `sin_pagos`).

## 5. UI — #2: sección de pagos en el detalle del jugador

### 5.1 `src/payments/PlayerPaymentsSection.tsx`

- Se renderiza en `PlayerFormPage` **solo en modo detalle** (`editing && row`), **debajo** de `PlayerDocumentsSection` y antes del mensaje/botón Guardar del formulario. En `/jugadores/nuevo` no aparece.
- Props: `playerId`, `tenantId`, `canEdit` (`isAdmin(role)`), `onChanged(flash)` → el padre muestra el Snackbar existente (`showToast`).
- Carga propia con el patrón async de `PlayerFormPage` (`setState` dentro del `.then`, bandera `active`, `reloadKey`). Error de carga → `<LoadError message="No se pudieron cargar los pagos." onRetry={…} />`. Mientras carga: "Cargando pagos…".
- Encabezado "Pagos". Lista mobile-first (`List`), una fila por pago:
  - primario: `paymentText(row)`;
  - secundario: `formatMoney(amount)` · fecha (`dd/mm/aaaa`) · método;
  - chip de estatus: Pagado `success`, Parcial `warning`, Pendiente `default`.
- Sin pagos: texto "Sin pagos registrados.".
- **Admin:**
  - botón **Registrar pago** → abre `PaymentDialog` vacío;
  - por fila, **Editar** (abre `PaymentDialog` con la fila) y **Borrar** → diálogo de confirmación "¿Borrar el pago de {paymentText}?" con Cancelar / Borrar;
  - tras crear / editar / borrar con éxito: se recarga la lista y se llama `onChanged('Pago registrado' | 'Pago actualizado' | 'Pago eliminado')`;
  - error al borrar: `Alert` en línea sobre la lista con el texto traducido; la confirmación se cierra.
- **Readonly:** solo la lista; no se renderizan Registrar, Editar ni Borrar (spec maestro §8). RLS bloquea cualquier escritura forzada.

### 5.2 `src/payments/PaymentDialog.tsx`

- `Dialog` con título "Registrar pago" o "Editar pago". Campos (selects `native` como el selector de equipo):
  - **Concepto** (select de los 4 valores);
  - **Detalle** (`concept_note`) — siempre visible; `required` y con error si el concepto es Otro; helper "Obligatorio cuando el concepto es Otro";
  - **Monto** (`type="text"`, `inputMode="decimal"`; prefijo `$`); helper "Lo pagado hasta hoy en este concepto";
  - **Fecha** (`type="date"`, por defecto `localToday()`);
  - **Método** (Efectivo / Transferencia);
  - **Estatus** (Pagado / Pendiente / Parcial).
- Validación con `validatePayment` al enviar; errores por campo (`error` + `helperText`), sin llamar a Supabase.
- El diálogo está dentro del `<form>` de `PlayerFormPage` en el árbol de React: aunque el `Dialog` se porta al `body` en el DOM, los eventos sintéticos de React burbujean por el árbol de componentes. Por eso el `onSubmit` del diálogo hace `preventDefault()` **y** `stopPropagation()`, y sus botones que no envían son `type="button"`; si no, guardar un pago dispararía el guardado del jugador.
- Al guardar: botón deshabilitado con guarda síncrona `useRef` contra doble envío (patrón de `PlayerDocumentsSection`). Éxito → se cierra. **Error → el diálogo sigue abierto** con un `Alert` arriba de los botones con `paymentErrorMessage(...)`, y conserva lo capturado.
- Cancelar o cerrar descarta lo capturado; al abrir de nuevo se reinicia desde la fila o desde `emptyPayment()`.

### 5.3 Pruebas (Testing Library)

`PaymentDialog`: valores por defecto (fecha de hoy, Efectivo, Pagado); nota obligatoria solo con Otro; monto inválido bloquea el envío sin llamar al callback; modo edición precarga la fila; error del guardado deja el diálogo abierto con el mensaje y los valores; doble clic en Guardar envía una sola vez; el submit no burbujea al `<form>` padre (render dentro de un `form` con `onSubmit` espía).
`PlayerPaymentsSection`: admin ve Registrar/Editar/Borrar y readonly no; lista con texto, monto formateado y chip; estado vacío; `LoadError` + Reintentar; crear/editar/borrar recargan y llaman `onChanged`; confirmación de borrado (cancelar no borra).
`PlayerFormPage`: la sección aparece en `/jugadores/:id` y no en `/jugadores/nuevo`.

## 6. UI — #3: página "Quién debe"

### 6.1 `src/payments/DebtorsPage.tsx`, ruta `/quien-debe`

- Reemplaza el `PlaceholderPage` en `src/app/routes.tsx`, en el mismo lugar (fuera de `RequireAdmin`): **admin y readonly** la ven. El enlace del `AppLayout` ya existe.
- Carga en paralelo `fetchPlayers()` (existente, `players_with_category`), `fetchPaymentStatuses()` y `fetchOutstandingPayments()`; arma los grupos con `buildDebtGroups`. Cualquier falla → `LoadError` con Reintentar. Mientras carga: "Cargando…".
- Título "Quién debe" y tres secciones en este orden, cada una con su conteo en el encabezado ("Con adeudo (3)"):
  1. **Con adeudo** — por jugador: nombre, categoría (`playerCategoryText`) y, debajo, una línea por pago `pendiente`/`parcial`: `paymentText` · `formatMoney(amount)` (lo pagado hasta hoy) · chip Pendiente/Parcial.
  2. **Sin pagos** — nombre y categoría.
  3. **Al corriente** — nombre y categoría.
- Grupo vacío: "Nadie en este grupo.". Sin jugadores activos: "No hay jugadores activos.".
- Cada jugador es un `ListItemButton` hacia `/jugadores/:id`.
- Mobile-first: una sola columna, sin tablas; el desglose va dentro del mismo item.
- Sin acciones de escritura en esta página para ningún rol.

### 6.2 Pruebas (Testing Library, data module mockeado)

Tres grupos con conteos y orden; jugador de `baja` no aparece; desglose del adeudo con concepto/nota y monto; navegación a `/jugadores/:id` al tocar; grupos vacíos; `LoadError` + Reintentar; render idéntico para admin y readonly; la ruta `/quien-debe` ya no muestra el placeholder.

## 7. Errores — resumen

| Situación | Comportamiento |
|---|---|
| Falla al cargar pagos (sección) | `LoadError` "No se pudieron cargar los pagos." + Reintentar; el resto del detalle sigue usable. |
| Falla al cargar "Quién debe" | `LoadError` genérico + Reintentar. |
| Validación del formulario | Errores por campo; no se llama a Supabase. |
| Falla al crear/editar | Diálogo abierto, `Alert` con `paymentErrorMessage`, valores conservados. |
| Update/delete con 0 filas | "No se encontró el pago o no tienes permiso." |
| Falla al borrar | `Alert` en línea en la sección. |
| Rechazo de RLS | "No tienes permiso para esta acción." |

## 8. Entrega

| Orden | Rama | Contenido | Depende de |
|---|---|---|---|
| 1 | `feature/payments` | §3 (migración `0014` + pgTAP, aplicada al remoto vía MCP `apply_migration`) + §4.1–4.2 de pagos por jugador + §5 | — |
| 2 | `feature/quien-debe` | `fetchPaymentStatuses`, `fetchOutstandingPayments`, `buildDebtGroups` + §6 + cambio de ruta | 1 (vista y módulo de datos) |

La migración va en la rama 1 aunque la consuma la 2: así la vista queda aplicada y probada antes de construir encima. El PR de la rama 1 lleva `Closes #2`; el de la 2, `Closes #3`.

Verificación por rama: `pnpm exec vitest run`, `tsc -b`, `pnpm lint` en verde; en la rama 1 además pgTAP de §3.2 en verde contra el remoto y advisors sin hallazgos nuevos. E2E en navegador (tester con Playwright, el owner pega el magic link): registrar, editar (liquidar un parcial) y borrar un pago como admin; ver la lista como readonly sin controles; en la rama 2, que el jugador cambie de grupo en "Quién debe" tras liquidar su parcial.

## 9. Riesgos abiertos

- **Reglas solo en cliente:** `concept_note` con `otro` y `amount > 0` no se refuerzan en BD (decisión del owner: sin cambios a `payments`). Un admin vía API podría guardar `amount = 0` u `otro` sin nota. Impacto bajo (solo admins escriben, mismo tenant). Si se quiere reforzar, es una migración aparte con `CHECK`s, previa revisión de datos existentes.
- **Sin saldo:** un `parcial` no dice cuánto falta; el desglose muestra lo pagado. Es el alcance acordado del v1.
- **Varias filas por concepto:** nada impide registrar dos "Mensualidad" abiertas; la convención (una fila por cargo, se edita para liquidar) depende del uso. La nota ("Octubre") ayuda a distinguirlas.
- **Volumen en "Quién debe":** carga todos los jugadores y pagos abiertos del tenant en el cliente. Adecuado para el tamaño de una liga; si crece, paginar o filtrar del lado servidor sobre la vista.
- **#4** consumirá `player_payment_status`; si necesita otra forma (p. ej. conteos), se extiende la vista con `create or replace view` agregando columnas al final, sin romper a #3.
