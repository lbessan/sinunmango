-- ═══════════════════════════════════════════════════════════════════════════
-- Diagnóstico + fix: cuotas huérfanas
-- ═══════════════════════════════════════════════════════════════════════════
--
-- PROBLEMA: algunas compras en cuotas tienen la primera cuota mal registrada:
--   - No tiene "(Cuota 1/12)" en el detalle
--   - cuotas_total queda en NULL o 1 (en vez de N)
--   - grupo_cuotas queda en NULL (no se asoció con las otras cuotas)
--
-- Resultado: la analítica no las agrupa con el resto y aparecen como gastos
-- sueltos con monto = una sola cuota.
--
-- Este script:
--   1. (DIAGNÓSTICO) Encuentra movs huérfanos que parecen ser primera cuota
--      de un grupo existente
--   2. (FIX) Les asigna el grupo_cuotas + cuotas_total correctos
--
-- Criterio de match: mismo detalle base (sin sufijo de cuota), misma
-- categoría, misma cuenta, monto dentro del 10% del promedio del grupo,
-- fecha cercana a la primera cuota del grupo (≤ 60 días antes).
-- ═══════════════════════════════════════════════════════════════════════════


-- ─── 1. DIAGNÓSTICO ─────────────────────────────────────────────────────────
-- Corré primero esto para ver qué se va a tocar. NO MODIFICA NADA.

WITH grupos_existentes AS (
  SELECT
    grupo_cuotas,
    user_id,
    regexp_replace(detalle, '\s*\(Cuota\s+\d+(?:/\d+)?\)\s*$', '', 'i') AS detalle_base,
    categoria,
    cuenta_origen,
    cuotas_total,
    COUNT(*)              AS movs_actuales,
    MIN(fecha)            AS primer_fecha,
    AVG(monto)::numeric   AS monto_promedio
  FROM movimientos
  WHERE grupo_cuotas IS NOT NULL
  GROUP BY grupo_cuotas, user_id, detalle_base, categoria, cuenta_origen, cuotas_total
  HAVING COUNT(*) < cuotas_total      -- solo grupos a los que les falta alguna cuota
),
huerfanos_candidatos AS (
  SELECT
    h.id                                        AS huerfano_id,
    h.fecha                                     AS huerfano_fecha,
    h.detalle                                   AS huerfano_detalle,
    h.monto                                     AS huerfano_monto,
    g.grupo_cuotas                              AS grupo_sugerido,
    g.cuotas_total                              AS cuotas_total_sugerido,
    g.movs_actuales,
    g.detalle_base,
    g.primer_fecha                              AS grupo_primer_fecha,
    g.monto_promedio
  FROM movimientos h
  JOIN grupos_existentes g
    ON g.user_id     = h.user_id
   AND g.categoria   = h.categoria
   AND g.cuenta_origen IS NOT DISTINCT FROM h.cuenta_origen
   AND regexp_replace(h.detalle, '\s*\(Cuota\s+\d+(?:/\d+)?\)\s*$', '', 'i') = g.detalle_base
   AND ABS(h.monto - g.monto_promedio) / NULLIF(g.monto_promedio, 0) < 0.10
   AND h.fecha BETWEEN g.primer_fecha - INTERVAL '60 days' AND g.primer_fecha + INTERVAL '5 days'
  WHERE h.grupo_cuotas IS NULL
)
SELECT
  huerfano_id,
  huerfano_fecha,
  huerfano_detalle,
  huerfano_monto,
  grupo_sugerido,
  cuotas_total_sugerido,
  detalle_base,
  grupo_primer_fecha,
  ROUND(monto_promedio, 2) AS grupo_monto_promedio
FROM huerfanos_candidatos
ORDER BY huerfano_fecha DESC;


-- ─── 2. FIX ─────────────────────────────────────────────────────────────────
-- Una vez que revisaste el output del diagnóstico y querés aplicar los cambios,
-- DESCOMENTÁ el bloque de abajo y corrélo.
--
-- Nota: si una huérfana matchea con MÚLTIPLES grupos, no la toca (juicio
-- manual). El diagnóstico arriba va a mostrarlas duplicadas — en ese caso
-- corregilas a mano desde la app.

/*
WITH grupos_existentes AS (
  SELECT
    grupo_cuotas,
    user_id,
    regexp_replace(detalle, '\s*\(Cuota\s+\d+(?:/\d+)?\)\s*$', '', 'i') AS detalle_base,
    categoria,
    cuenta_origen,
    cuotas_total,
    COUNT(*) AS movs_actuales,
    MIN(fecha) AS primer_fecha,
    AVG(monto)::numeric AS monto_promedio
  FROM movimientos
  WHERE grupo_cuotas IS NOT NULL
  GROUP BY grupo_cuotas, user_id, detalle_base, categoria, cuenta_origen, cuotas_total
  HAVING COUNT(*) < cuotas_total
),
matches AS (
  SELECT
    h.id              AS huerfano_id,
    g.grupo_cuotas    AS grupo_sugerido,
    g.cuotas_total    AS cuotas_total_sugerido,
    -- Si la huérfana matchea con varios grupos, descartar (ambigua)
    COUNT(*) OVER (PARTITION BY h.id) AS n_matches
  FROM movimientos h
  JOIN grupos_existentes g
    ON g.user_id     = h.user_id
   AND g.categoria   = h.categoria
   AND g.cuenta_origen IS NOT DISTINCT FROM h.cuenta_origen
   AND regexp_replace(h.detalle, '\s*\(Cuota\s+\d+(?:/\d+)?\)\s*$', '', 'i') = g.detalle_base
   AND ABS(h.monto - g.monto_promedio) / NULLIF(g.monto_promedio, 0) < 0.10
   AND h.fecha BETWEEN g.primer_fecha - INTERVAL '60 days' AND g.primer_fecha + INTERVAL '5 days'
  WHERE h.grupo_cuotas IS NULL
)
UPDATE movimientos m
SET
  grupo_cuotas = ma.grupo_sugerido,
  cuotas_total = ma.cuotas_total_sugerido
FROM matches ma
WHERE m.id = ma.huerfano_id
  AND ma.n_matches = 1;
*/
