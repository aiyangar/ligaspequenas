# Lista de jugadores: exportar a Excel (#5) — Diseño

**Fecha:** 2026-10-15
**Estado:** Borrador para revisión
**Issue:** [#5](https://github.com/aiyangar/ligaspequenas/issues/5)
**Spec maestro:** `2026-06-22-liga-mty-registro-jugadores-design.md` §1, §8 y §9 (exportación a Excel)
**Specs previos:** `2026-10-15-players-status-columns-design.md` (#4: columnas `payment_state` y `docs_delivered` en `players_with_category`, pensadas para que #5 las consuma)

## 1. Contexto y objetivo

`PlayersPage` (`src/players/PlayersPage.tsx`) carga todo el tenant con `fetchPlayers()` (`src/players/players.ts:38-45`, ordenado por `full_name`) y filtra en cliente por nombre, categoría, estatus, equipo, pago y documentos (`PlayersPage.tsx:86-95`, el arreglo `visible`). El encabezado tiene el título "Jugadores" y, solo para admin (`isAdmin(role)`, `src/lib/authorize.ts`), el botón "Nuevo jugador" (`PlayersPage.tsx:99-113`).

Desde #4, cada `PlayerRow` ya trae todo lo que pide el spec maestro §9 — categoría calculada, estatus de pago (`payment_state`) y documentos entregados (`docs_delivered`) — en la misma consulta. Falta el botón **Exportar a Excel**.

Objetivo:

- Botón **"Exportar a Excel"** en el encabezado, junto a "Nuevo jugador", **solo para admin**.
- Genera en el navegador un `.xlsx` con **una hoja** que contiene **exactamente los jugadores visibles** (filtros activos aplicados), **en el mismo orden** que en pantalla.
- Fechas como **celdas de fecha reales** de Excel (ordenables y filtrables), mostradas `dd/mm/yyyy`; enums con **etiquetas humanas**.
- Nombre de archivo `jugadores-YYYY-MM-DD.xlsx` con la fecha **local**.
- La librería se carga con **`import()` dinámico** al hacer clic: no pesa en el bundle inicial.

Fuera de alcance:

- **Respaldo completo de la base** (spec maestro §7, "exportación a Excel de toda la base bajo demanda"): otra issue. Aquí solo la lista de jugadores.
- **Hoja de pagos** (o de documentos por tipo) dentro del mismo archivo.
- **Exportación para readonly** (ver §2, desviación del spec maestro).
- **#71** (`<a>` directo dentro de `<ul>` en las `List`), **#72** (nombre accesible del enlace de deudor) y **#76**: tocan pantallas vecinas; no se arreglan ni se empeoran aquí.
- Cambios a la base de datos: **ninguno** (sin migraciones, sin RLS nueva, sin pgTAP).
- Refactorizar las `<option>` existentes de los filtros o de `PlayerForm` para que usen los mapas de etiquetas nuevos (§4.1).

## 2. Decisiones

| Decisión | Elección |
|---|---|
| Librería | **`write-excel-file` 4.1.1**, fijada exacta (`pnpm add -E write-excel-file@4.1.1`; MIT; una sola dependencia, `fflate`). Import **`write-excel-file/browser`**: el paquete no tiene export raíz (`.`), solo `./browser`, `./node`, `./universal`, `./utility`. API: `writeExcelFile(sheetData, sheetOptions).toFile(nombre)` genera el blob y dispara la descarga (`<a download>` temporal + `URL.createObjectURL`). |
| Desviación del spec maestro §9 (librería) | §9 nombra `xlsx` (SheetJS). **Aprobado por el owner:** no se usa. En npm, `xlsx` sigue en **0.18.5** (sin versiones nuevas en el registro) y esa versión tiene vulnerabilidades conocidas (prototype pollution y ReDoS); las versiones corregidas solo se distribuyen como tarball desde el CDN de SheetJS, fuera de npm, lo que rompe el flujo de dependencias y auditoría con `pnpm`. Además solo necesitamos **escribir** un archivo; `write-excel-file` es solo-escritura y mucho más chico. |
| Desviación del spec maestro §1/§9 (rol) | §1 dice que readonly "lee y exporta". **Aprobado por el owner:** el botón es **solo admin**; readonly no lo ve. Ver §7 sobre el alcance real de esta restricción. |
| Carga de la librería | `await import('write-excel-file/browser')` dentro de la función de exportación (§4.3). Vite la separa en su propio chunk; se descarga la primera vez que alguien exporta. Medido: el entry `browser` empaquetado y minificado pesa **~73 KB (~20 KB gzip)**. |
| Separación de código | **Función pura** `buildPlayersSheet(rows)` (`src/players/playersSheet.ts`) que traduce `PlayerRow[]` al esquema de filas/celdas de la librería, probada sin cargarla; y un módulo chico `src/players/exportPlayers.ts` que hace el `import()` dinámico, arma las opciones de hoja y descarga. `PlayersPage` solo llama a `exportPlayersToExcel(visible)`. |
| Qué filas | El arreglo `visible` tal cual, **en el momento del clic** (se pasa la referencia de ese render; cambiar filtros durante la generación no altera el archivo). Mismo orden que la lista: `full_name` ascendente, el que devuelve `fetchPlayers()`. |
| Fechas | Celda `Date` con `format: 'dd/mm/yyyy'`. El `Date` se construye con **`Date.UTC`** a partir de los componentes de la cadena `YYYY-MM-DD` (§4.1). |
| Etiquetas de enums | Pago: `PAYMENT_STATE_LABELS` (`src/payments/payments.ts:193-197`), ya existe. Estatus y afiliación: **no existen mapas**; hoy los textos viven en `<option>` sueltas (`PlayersPage.tsx:155-156`, `PlayerForm.tsx:107-109`). Se agregan `PLAYER_STATUS_LABELS` y `AFFILIATION_STATUS_LABELS` en `src/players/players.ts` con **los mismos textos** que esas `<option>`. |
| Documentos | Texto `` `${docs_delivered}/${DOCUMENT_TOTAL}` `` (`DOCUMENT_TOTAL`, `src/documents/documents.ts:41`), como el chip de la lista pero sin el prefijo "Docs". |
| Nombre de archivo | `` `jugadores-${localToday()}.xlsx` `` reutilizando `localToday()` (`src/payments/payments.ts:72-77`, fecha local, no `toISOString()`). |
| Feedback de error | `Alert` en línea `role="alert" severity="error"`, el patrón de `PlayerDocumentsSection.tsx:124` y `PlayerPhoto.tsx:122`. Sin toast de éxito: la descarga del navegador es el feedback. |
| Base de datos | Sin cambios. |

## 3. Contenido del archivo

Una hoja llamada **`Jugadores`**. Fila 1: encabezados en negritas (`fontWeight: 'bold'`), fijada (`stickyRowsCount: 1`). Desde la fila 2: un jugador por fila. Sin filas de totales ni de filtros aplicados.

### 3.1 Columnas

| # | Encabezado | Origen (`PlayerRow`) | Celda | Nulo |
|---|---|---|---|---|
| 1 | Nombre | `full_name` | texto | — (no nulo) |
| 2 | Fecha de nacimiento | `birth_date` | fecha `dd/mm/yyyy` | — (no nulo) |
| 3 | CURP | `curp` | texto | vacía |
| 4 | Categoría | `playerCategoryText(row)` (`players.ts:57-63`) | texto | — (siempre devuelve texto, p. ej. "Fuera de categoría") |
| 5 | Equipo | `team_name` | texto | vacía |
| 6 | Estatus | `PLAYER_STATUS_LABELS[status]` | texto | — |
| 7 | Fecha de inscripción | `enrollment_date` | fecha `dd/mm/yyyy` | — (no nulo) |
| 8 | Tutor | `tutor_name` | texto | — (no nulo) |
| 9 | WhatsApp del tutor | `tutor_whatsapp` | texto, `format: '@'` | — (no nulo) |
| 10 | Correo del tutor | `tutor_email` | texto | vacía |
| 11 | Contacto de emergencia | `emergency_contact_name` | texto | vacía |
| 12 | Teléfono de emergencia | `emergency_contact_phone` | texto, `format: '@'` | vacía |
| 13 | Afiliación | `AFFILIATION_STATUS_LABELS[affiliation_status]` | texto | — |
| 14 | Fecha de afiliación | `affiliation_date` | fecha `dd/mm/yyyy` | vacía |
| 15 | Pago | `PAYMENT_STATE_LABELS[payment_state]` | texto | — |
| 16 | Documentos | `` `${docs_delivered}/${DOCUMENT_TOTAL}` `` | texto, `format: '@'` | — |

- **Vacía** = `null` en la posición de la celda (la librería acepta `null` como celda vacía). Nunca la cadena `"null"` ni `""`.
- Los teléfonos y "Documentos" llevan `format: '@'` (texto) para que Excel no los trate como número (`8112345678` en notación científica) ni "3/6" como fecha si alguien edita la celda.
- **No se exportan:** `id`, `tenant_id`, `photo_path`, `created_at`, `updated_at`, `edad_liga`, `division`, `category_name`/`category_year`/`category_id` por separado (ya están en "Categoría"), `team_id`.
- Anchos de columna fijos vía `columns: [{ width }]` en las opciones de hoja (en caracteres; p. ej. 28 para Nombre, 12 para fechas, 20 para CURP). Cosmético; no se prueba más allá de que haya uno por columna.

### 3.2 Fechas sin desfase de zona horaria

`write-excel-file` convierte un `Date` a serial de Excel con `date.getTime() / día + 25569` (`modules/xlsx/helpers/convertDateToSerialNumber.js`), es decir, **en UTC**. Por eso:

- **Correcto:** `new Date(Date.UTC(year, month - 1, day))` a partir de `'YYYY-MM-DD'` partido con `/^(\d{4})-(\d{2})-(\d{2})$/`. Da medianoche UTC → serial **entero** → Excel muestra exactamente ese día, en cualquier zona horaria de quien abra el archivo.
- **Incorrecto:** `new Date(year, month - 1, day)` (medianoche local): en Monterrey (UTC−6) el serial queda con `.25` de fracción; en una zona UTC+ caería en el día anterior.
- `new Date('YYYY-MM-DD')` también da medianoche UTC por especificación, pero no se usa: depende de una regla de parsing implícita (el mismo motivo por el que existe `formatPaymentDate`, `payments.ts:101-105`) y no valida la forma.

Helpers en `playersSheet.ts`: `excelDate(value: string): Date | null` (devuelve `null` si la cadena no cumple el patrón) y `dateCell(value: string | null): Cell`: `null` → celda vacía (`null`); fecha válida → celda de fecha; cadena que no cumple el patrón (no debería pasar: son columnas `date` de Postgres) → **no tumba la exportación**: la celda sale como texto con el valor crudo.

El formato `dd/mm/yyyy` se escribe como formato personalizado en el archivo, así que Excel, LibreOffice, Google Sheets y Numbers lo muestran igual sin importar la configuración regional de quien lo abra; lo que sí depende del locale es cómo **edita** el usuario la fecha después.

## 4. Código

### 4.1 `src/players/players.ts`

```ts
export const PLAYER_STATUS_LABELS: Record<PlayerStatus, string> = {
  activo: 'Activo',
  baja: 'Baja',
}

export const AFFILIATION_STATUS_LABELS: Record<AffiliationStatus, string> = {
  autoriza: 'Autoriza',
  no_autoriza: 'No autoriza',
  pendiente: 'Pendiente',
}
```

Textos idénticos a las `<option>` actuales. Usarlos en esos `<option>` (y en la línea secundaria de la lista, que hoy muestra `p.status` crudo, `PlayersPage.tsx:208`) es una simplificación posterior; aquí no se tocan.

### 4.2 `src/players/playersSheet.ts` (puro)

- `PLAYERS_SHEET_COLUMNS: readonly { header: string; width: number }[]` — las 16 columnas de §3.1 en orden.
- `excelDate(value)` y `dateCell(value)` — §3.2.
- `buildPlayersSheet(rows: readonly PlayerRow[]): SheetData` — fila de encabezados (`{ value: header, fontWeight: 'bold' }`) + una fila por jugador, en el orden recibido. Celdas de fecha: `{ value: Date, type: Date, format: 'dd/mm/yyyy' }`; texto con formato: `{ value, type: String, format: '@' }`; texto simple: el string; nulo: `null`.
- `playersExportFileName(today = localToday()): string` → `` `jugadores-${today}.xlsx` `` (parámetro inyectable para pruebas, como `emptyPayment(today)` en `payments.ts:79`).

Solo `import type { Cell, SheetData } from 'write-excel-file/browser'`: el import de tipo se borra al compilar, así que este módulo **no** arrastra la librería al bundle principal.

### 4.3 `src/players/exportPlayers.ts`

```ts
export async function exportPlayersToExcel(rows: readonly PlayerRow[]): Promise<void> {
  const { default: writeExcelFile } = await import('write-excel-file/browser')
  await writeExcelFile(buildPlayersSheet(rows), {
    sheet: 'Jugadores',
    stickyRowsCount: 1,
    columns: PLAYERS_SHEET_COLUMNS.map(({ width }) => ({ width })),
  }).toFile(playersExportFileName())
}
```

Cualquier fallo (chunk que no carga tras un deploy, error al comprimir) se propaga como rechazo; lo maneja la página.

### 4.4 `src/players/PlayersPage.tsx`

- Estado `exporting: boolean` y `exportError: string | null`; un `useRef<boolean>` como guarda síncrona contra doble clic (el `disabled` por estado llega un render tarde; dos clics en el mismo tick pasarían ambos).
- `handleExport()`: si la ref está activa, sale; si no, la activa, `setExporting(true)`, `setExportError(null)`, `await exportPlayersToExcel(visible)`; en `catch`, `setExportError('No se pudo generar el archivo de Excel. Intenta de nuevo.')`; en `finally`, libera la ref y `setExporting(false)`.
- Encabezado: dentro de `{isAdmin(role) && …}`, un `Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: 'wrap' }}` con `Button variant="outlined"` **"Exportar a Excel"** y el "Nuevo jugador" actual (sin cambios). El botón queda `disabled` si `visible.length === 0 || exporting`. El texto no cambia mientras genera (las pruebas lo buscan por nombre); el `disabled` es el indicador.
- `exportError` se muestra como `<Alert role="alert" severity="error" sx={{ mt: 2 }}>` bajo el encabezado y se limpia al intentar de nuevo.

## 5. UI y comportamiento

### 5.1 Roles

- **admin:** ve "Exportar a Excel" y "Nuevo jugador".
- **readonly:** no ve ninguno de los dos (ni deshabilitado). La lista y los filtros no cambian.

### 5.2 Estados del botón

| Situación | Botón |
|---|---|
| Cargando la lista (`players` aún `[]`) | deshabilitado |
| Error de carga (`LoadError`) | deshabilitado (`visible` vacío) |
| Filtros sin resultados | deshabilitado |
| Hay al menos un jugador visible | habilitado |
| Generando | deshabilitado; un segundo clic no hace nada |
| Falló la generación | habilitado de nuevo + `Alert` de error |

Los jugadores con estatus `baja` se exportan si están visibles (con filtro "Todos" o "Baja"); el archivo refleja la pantalla, no reglas propias.

### 5.3 Mobile-first

En `xs` el encabezado ya apila en columna (`direction={{ xs: 'column', sm: 'row' }}`); los dos botones van en una fila que hace `wrap`. Sin scroll horizontal a 360 px. En móvil, `<a download>` funciona en Chrome Android y Safari iOS (Safari abre la vista previa con opción de guardar); se verifica en el E2E de escritorio y queda como riesgo para iOS (§9).

## 6. Errores y estados

- **Fallo al cargar el chunk o al generar:** `Alert` de error, botón habilitado para reintentar. No se reintenta solo.
- **Lista vacía:** no se puede exportar (botón deshabilitado); no hay archivo con solo encabezados.
- **Fecha malformada:** texto crudo en la celda (§3.2); no hay error.
- **Etiqueta faltante** (un enum nuevo en la base sin entrada en el mapa): TypeScript lo impide en compilación con `Record<…>`; si el dato llega igual, la celda queda vacía. Mismo supuesto que `PAYMENT_STATE_LABELS` en la lista.

## 7. Seguridad y privacidad

- El archivo contiene **datos personales de menores** (nombre, fecha de nacimiento, CURP) y de sus tutores (WhatsApp, correo, contacto de emergencia). No incluye fotos ni archivos de documentos, solo el conteo.
- Se genera **por completo en el navegador** con los datos que la página ya tiene; no se sube a ningún servicio, no se guarda en Storage, no hay endpoint nuevo.
- **Solo admin** es una restricción de **interfaz**: el usuario readonly ya puede leer esas mismas filas por RLS (`players_with_category` con `security_invoker`) y verlas en pantalla. El objetivo es no facilitar la extracción masiva de datos de menores a cuentas de solo lectura, no crear una barrera de seguridad nueva. Si algún día se requiere que readonly no pueda leer ciertas columnas, eso es RLS/vista, no este botón.
- El archivo descargado queda fuera del control de la app; es responsabilidad de la mesa directiva (igual que hoy con cualquier captura).

## 8. Pruebas (Vitest + Testing Library)

### 8.1 `src/players/playersSheet.test.ts` (sin la librería)

- Encabezados: la fila 0 son exactamente los 16 textos de §3.1, en orden, en negritas.
- Orden: con 3 filas de entrada en un orden arbitrario, las filas de salida conservan ese orden (no reordena).
- Fechas: `'2015-06-10'` → celda con `type: Date`, `format: 'dd/mm/yyyy'` y `value.getTime() === Date.UTC(2015, 5, 10)`; la prueba corre con `TZ: 'America/Monterrey'` (`vite.config.ts`), así que un `new Date(y, m, d)` local fallaría. Un caso de fin de año (`'2026-12-31'`) para cubrir el desfase de día.
- `excelDate`: cadena malformada (`'10/06/2015'`, `''`) → `null`. `dateCell`: `null` → `null`; cadena malformada → la cadena cruda como texto.
- Vacíos: `curp`, `team_name`, `tutor_email`, `emergency_contact_*`, `affiliation_date` en `null` → `null` en su posición (no `''` ni `'null'`).
- Etiquetas: `status: 'baja'` → "Baja"; cada `AffiliationStatus` → su etiqueta; cada `PaymentState` → `PAYMENT_STATE_LABELS`; "Documentos" → `` `2/${DOCUMENT_TOTAL}` ``; categoría fuera de rango → "Fuera de categoría (edad 25)".
- Texto con formato: WhatsApp, teléfono de emergencia y Documentos llevan `format: '@'`.
- `playersExportFileName('2026-10-15')` → `'jugadores-2026-10-15.xlsx'`.
- `players.test.ts`: los mapas tienen una entrada por valor del tipo (comparando contra las listas literales).

### 8.2 `src/players/exportPlayers.test.ts`

`vi.mock('write-excel-file/browser')` con un `default` que devuelve `{ toFile: vi.fn() }`. Verifica que se llama con `buildPlayersSheet(rows)` y `sheet: 'Jugadores'`, que `toFile` recibe `jugadores-<localToday()>.xlsx`, y que un `toFile` que rechaza propaga el rechazo.

### 8.3 `src/players/PlayersPage.test.tsx`

Se mockea `./exportPlayers` (`vi.hoisted` + `vi.mock`, como `fetchPlayers` hoy). Casos nuevos:

- **admin** ve "Exportar a Excel"; **readonly** no (`queryByRole('button', { name: 'Exportar a Excel' })` nulo).
- Deshabilitado mientras carga y cuando un filtro deja la lista vacía (buscar "zzz").
- Con un filtro activo (p. ej. Estatus = Activo, o búsqueda), al hacer clic `exportPlayersToExcel` se llama **una vez** con exactamente las filas visibles, en orden (comparar `id`s).
- **Doble clic:** el mock devuelve una promesa que no resuelve hasta que la prueba la libera; `user.dblClick` → una sola llamada; el botón queda deshabilitado; al resolver, se habilita.
- **Error:** el mock rechaza → aparece `role="alert"` con el mensaje de §4.4 y el botón vuelve a estar habilitado; un nuevo clic exitoso borra el `Alert`.
- Las pruebas existentes no cambian (el botón nuevo no colisiona con textos buscados hoy).

Sin pgTAP (no hay cambios de base de datos).

## 9. Resumen de archivos

| Archivo | Cambio |
|---|---|
| `package.json` / `pnpm-lock.yaml` | `write-excel-file` `4.1.1` exacto en `dependencies`. |
| `src/players/players.ts` | `PLAYER_STATUS_LABELS`, `AFFILIATION_STATUS_LABELS`. |
| `src/players/players.test.ts` | Pruebas de los mapas. |
| `src/players/playersSheet.ts` | Nuevo (§4.2). |
| `src/players/playersSheet.test.ts` | Nuevo (§8.1). |
| `src/players/exportPlayers.ts` | Nuevo (§4.3). |
| `src/players/exportPlayers.test.ts` | Nuevo (§8.2). |
| `src/players/PlayersPage.tsx` | Botón, guarda, `Alert` (§4.4). |
| `src/players/PlayersPage.test.tsx` | Casos de §8.3. |

## 10. Entrega

Una rama: **`feature/players-excel-export`**, PR con `Closes #5`.

Orden dentro de la rama (TDD): (1) dependencia + mapas de etiquetas; (2) `playersSheet.ts` y sus pruebas; (3) `exportPlayers.ts` y sus pruebas; (4) botón en `PlayersPage` y sus pruebas.

Verificación:

- `pnpm exec vitest run`, `tsc -b`, `pnpm lint` en verde;
- `pnpm build`: la salida lista un chunk aparte para la librería, y el chunk de entrada (`dist/assets/index-*.js`) **no** contiene código de `write-excel-file` (p. ej. `grep -L sharedStrings dist/assets/index-*.js`). Registrar el tamaño del chunk nuevo en el PR;
- **E2E en navegador** (el orquestador, con Playwright; el owner pega el magic link):
  - **datos:** se crean jugadores dedicados con prefijo `E2E Export` en el nombre (al menos uno con `curp`, `tutor_email` y `affiliation_date` nulos, uno con equipo y uno en `baja`); **nunca** se exporta ni se inspecciona la lista real completa;
  - como admin, buscar "E2E Export" (y combinar con un filtro de Estatus), clic en "Exportar a Excel", capturar con `page.waitForEvent('download')`, comprobar el nombre `jugadores-<hoy local>.xlsx`;
  - inspeccionar el archivo fuera del repo (scratchpad, p. ej. `read-excel-file/node` o `openpyxl`): encabezados de §3.1, una fila por jugador visible en el mismo orden, fechas como celdas numéricas con formato `dd/mm/yyyy` y el día correcto, nulos vacíos, etiquetas humanas;
  - comprobar que el chunk de la librería se descarga **solo** al hacer clic (pestaña de red / `page.on('request')`);
  - como readonly, el botón no aparece; en 360 px, sin scroll horizontal;
  - **limpieza:** borrar el `.xlsx` descargado y los jugadores por SQL (`delete from players where full_name like 'E2E Export%'`; documentos y pagos caen por `on delete cascade`) y confirmar que no queda ninguno.

## 11. Riesgos abiertos

- **Dependencia nueva.** `write-excel-file` es de un solo mantenedor y cambió de API entre 3.x y 4.x (export `./browser`, `toFile`). Mitigación: versión exacta, uso aislado en `exportPlayers.ts` (un solo punto de llamada) y el mapeo puro sin dependencia en runtime.
- **Web Workers.** La compresión usa `fflate.zip` asíncrono, que puede lanzar workers desde un `blob:`. Hoy no hay Content-Security-Policy (`vercel.json` solo tiene la reescritura SPA); si se agrega una, debe permitir `worker-src blob:` o la exportación fallará (y caerá en el `Alert` de error).
- **Listas grandes.** Todo se genera en memoria en el navegador. Para el tamaño de una liga (cientos de jugadores) es instantáneo; miles siguen siendo pocos MB. No se pagina ni se pone límite.
- **Chunk viejo tras un deploy.** Si la pestaña quedó abierta y el hash del chunk cambió, el `import()` falla; el usuario ve el `Alert` y debe recargar. No se agrega recarga automática.
- **Descarga en iOS.** Safari puede abrir una vista previa en vez de guardar directo. Aceptado; no se prueba en el E2E de escritorio.
- **Locale de Excel.** El formato de fecha es fijo `dd/mm/yyyy` en el archivo (§3.2), así que la visualización no depende del locale; sí lo hace la edición manual posterior.
- **Etiquetas duplicadas.** `PLAYER_STATUS_LABELS`/`AFFILIATION_STATUS_LABELS` duplican los textos de las `<option>` existentes hasta que se unifiquen (§4.1).
- **Admin-only no es control de acceso** (§7).
