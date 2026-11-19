# Barrido de deuda técnica, quinta ola — Diseño

**Fecha:** 2026-11-19
**Estado:** Decisiones del orquestador (el owner pidió "avanza todo lo que puedas"); revisables antes de promover a `main`.
**Contexto:** los dos seguimientos que dejó la revisión adversarial de los planes de la ola 4. Mismas reglas que las olas anteriores. #7 (SMTP) sigue fuera. El lote J (#34, #120) sigue siendo el último del barrido.

## 1. Issues y lotes

| Lote | Rama | Issues | Archivos principales |
|---|---|---|---|
| W | `fix/player-permission-message` | #152 | `src/players/players.ts` (+test) |
| X | `update/b3-sql-0019-note` | #153 | `docs/superpowers/plans/2026-10-16-pre-real-data-checklist.md` |

W y X no comparten archivos y van en paralelo.

## 2. Decisiones del orquestador

- **#152:** `createPlayer` y `updatePlayer` pasan `error.message` por una traducción de permisos: si coincide con la misma expresión de `documents.ts`/`payments.ts` (`row-level security|permission denied|unauthorized|\b403\b`, sin distinguir mayúsculas), devuelven `NO_PERMISSION_MESSAGE`; cualquier otro mensaje (p. ej. validaciones de CHECK como la CURP) se devuelve tal cual. No se usa el mensaje de consentimiento (no aplica a la ficha). La expresión no se duplica una tercera vez: el plan decide cómo compartirla con `documents.ts` sin cambiar el comportamiento de documentos ni pagos. El test existente `createPlayer surfaces an RLS/DB error` cambia a esperar el texto traducido. `fetchPlayer` (lectura, `throw`) queda fuera.
- **#153:** una nota de una línea junto al SQL de la llamada 2 (B3) del plan del 2026-10-16 que diga que desde 0019 (#48, PR #148) esa aserción espera `false` y que el archivo vigente es `supabase/tests/0016_revoke_anon_privileges.test.sql`. El SQL histórico no se cambia.

## 3. Verificación

- W: TDD (rojo real, verde), suite completa, `tsc -b`, `lint`; revisión pre-PR. Sin verificación en navegador: el camino de error no se reproduce en vivo sin quitarse permisos y el camino feliz no cambia.
- X: `grep` rojo/verde; revisión pre-PR.
- Sin cambios de base de datos.
