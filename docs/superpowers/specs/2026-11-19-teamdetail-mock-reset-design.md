# Aislamiento de mocks en los tests de TeamDetailPage (#166) — Diseño corto

**Fecha:** 2026-11-19
**Estado:** Aprobado por el owner ("haz el #166 y luego promueve a main").

## Qué y por qué

Bajo sobrecarga, un test de `src/teams/TeamDetailPage.test.tsx` que se pasa de tiempo deja en cola un `mockRejectedValueOnce` de `fetchRoster` sin consumir. `vi.clearAllMocks()` en `beforeEach` (l.49) no vacía las colas `*Once`, así que el test siguiente recibe el rechazo y muestra el error de carga en vez de "Equipo no encontrado". Es un problema de aislamiento de tests, no del producto.

## Enfoques

- **A (elegido):** en `beforeEach`, reiniciar los mocks del módulo con `mockReset()` (vacía las colas `*Once` y la implementación) antes de volver a poner los valores por defecto que ya pone el `beforeEach`. Es el mismo arreglo que se usó para `fetchPlayer` en los tests de `PlayerFormPage` (lote N).
- **B:** cambiar `vi.clearAllMocks()` por `vi.resetAllMocks()`. Descartado como opción por defecto porque también reinicia mocks de otros módulos del archivo que no vuelve a configurar el `beforeEach`; el plan puede elegirlo solo si comprueba que el `beforeEach` reconfigura todos.
- **C:** mover los `mockRejectedValueOnce` para que se consuman siempre. Descartado: no protege contra el siguiente caso igual.

## Alcance y verificación

- Solo `src/teams/TeamDetailPage.test.tsx`. Sin cambios de producto.
- Rojo real: un test que deja en cola un `*Once` sin consumir y comprueba que el test siguiente no lo recibe (o un experimento equivalente documentado en el plan que falle hoy y pase después).
- `pnpm exec vitest run`, `tsc -b`, `lint` en verde; revisión pre-PR.
