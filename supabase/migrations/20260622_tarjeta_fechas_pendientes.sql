-- ─── Tarjetas: fechas de cierre/vencimiento pendientes ───────────────────────
-- Resuelve el bug de "actualizar las fechas antes de tiempo".
--
-- Problema: al conciliar el resumen (que llega apenas cierra el ciclo), si se
-- avanzaban las fechas al PRÓXIMO ciclo, el día de cierre cambiaba (ej. 25→23)
-- y las compras del 24-25 se reclasificaban al ciclo siguiente. Además la
-- alerta de vencimiento saltaba al próximo, perdiendo el aviso del actual.
--
-- Solución: cuando el ciclo actual todavía no venció, las fechas del próximo
-- ciclo se guardan en estas columnas "pendientes" en vez de pisar las activas.
-- El cron auto-conciliar las rota a las columnas reales recién cuando pasa el
-- vencimiento del ciclo actual.

ALTER TABLE cuentas
  ADD COLUMN IF NOT EXISTS fecha_cierre_pendiente      DATE,
  ADD COLUMN IF NOT EXISTS fecha_vencimiento_pendiente DATE;
