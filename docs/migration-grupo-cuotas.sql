-- ─── Migración: agregar grupo_cuotas para linkear cuotas relacionadas ──────
-- Correr en Supabase → SQL Editor.
-- Idempotente: usa IF NOT EXISTS y solo backfilla filas sin grupo.
--
-- Motivo: hoy las cuotas de una misma compra se relacionan implícitamente
-- (mismo detalle base + cuenta + cuotas_total + fechas separadas por meses).
-- Esto es frágil — si el user cambia el detalle de UNA cuota, ya no matchea.
-- Agregamos grupo_cuotas (UUID) para tener identificador explícito.

-- ── 1. Columna ──────────────────────────────────────────────────────────────
ALTER TABLE movimientos
  ADD COLUMN IF NOT EXISTS grupo_cuotas UUID;

-- ── 2. Índice para queries por grupo ────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_movimientos_grupo_cuotas
  ON movimientos (grupo_cuotas)
  WHERE grupo_cuotas IS NOT NULL;

-- ── 3. Backfill: agrupar las cuotas existentes ──────────────────────────────
-- Heurística: cuotas hermanas tienen mismo user_id + cuenta_origen + cuotas_total
-- y el detalle base (sin sufijo "(Cuota N/T)") idéntico.
--
-- Solo afecta filas con cuotas_total > 1 y grupo_cuotas IS NULL.

WITH cuotas_a_agrupar AS (
  SELECT
    user_id,
    cuenta_origen,
    cuotas_total,
    REGEXP_REPLACE(detalle, ' \(Cuota \d+/\d+\)$', '') AS detalle_base
  FROM movimientos
  WHERE cuotas_total > 1
    AND grupo_cuotas IS NULL
    AND detalle IS NOT NULL
  GROUP BY user_id, cuenta_origen, cuotas_total,
           REGEXP_REPLACE(detalle, ' \(Cuota \d+/\d+\)$', '')
  HAVING COUNT(*) > 1   -- solo grupos con 2+ filas
),
grupos_asignados AS (
  SELECT *, gen_random_uuid() AS nuevo_grupo
  FROM cuotas_a_agrupar
)
UPDATE movimientos m
SET grupo_cuotas = g.nuevo_grupo
FROM grupos_asignados g
WHERE m.user_id        = g.user_id
  AND m.cuenta_origen  = g.cuenta_origen
  AND m.cuotas_total   = g.cuotas_total
  AND REGEXP_REPLACE(m.detalle, ' \(Cuota \d+/\d+\)$', '') = g.detalle_base
  AND m.grupo_cuotas IS NULL;

-- ── 4. Verificación ─────────────────────────────────────────────────────────
-- Cuántos grupos quedaron y cuántas filas tienen grupo asignado:
SELECT
  COUNT(DISTINCT grupo_cuotas) AS total_grupos,
  COUNT(*) FILTER (WHERE grupo_cuotas IS NOT NULL) AS filas_con_grupo,
  COUNT(*) FILTER (WHERE cuotas_total > 1 AND grupo_cuotas IS NULL) AS filas_cuotas_sin_grupo
FROM movimientos;
-- → "filas_cuotas_sin_grupo" debería ser 0 o muy bajo (solo casos con detalle
--   irreconocible). Si queda alguno, podés agruparlos manualmente o ignorar
--   (no rompe nada, solo no se podrán linkear desde la UI).
