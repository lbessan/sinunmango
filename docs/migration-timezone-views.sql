-- ═══════════════════════════════════════════════════════════════════════════
-- Migration: views con timezone Argentina
-- ═══════════════════════════════════════════════════════════════════════════
--
-- PROBLEMA: las vistas dashboard_resumen y saldo_actual_cuentas usaban
-- CURRENT_DATE que se evalúa en UTC. Después de las 21h hora AR (= 00h UTC),
-- CURRENT_DATE ya marca el día siguiente — los ingresos de "mañana" aparecían
-- como del "hoy" en el saldo disponible.
--
-- FIX: helper today_ar() devuelve la fecha actual en AR. Reescribimos las
-- vistas para usarlo en vez de CURRENT_DATE.
--
-- Idempotente: CREATE OR REPLACE en todo.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── Helper: fecha de hoy en zona Argentina ────────────────────────────────
CREATE OR REPLACE FUNCTION today_ar() RETURNS date AS $$
  SELECT (now() AT TIME ZONE 'America/Argentina/Buenos_Aires')::date
$$ LANGUAGE sql STABLE;

-- ─── Vista: saldo_actual_cuentas ───────────────────────────────────────────
CREATE OR REPLACE VIEW saldo_actual_cuentas
WITH (security_invoker = true) AS
SELECT
  id,
  nombre_cuenta,
  tipo_cuenta,
  moneda,
  activa,
  fecha_cierre_tarjeta,
  fecha_vencimiento_tarjeta,
  saldo_inicial,
  saldo_inicial
    + COALESCE((
        SELECT sum(monto_estimado(m.monto, m.moneda, m.conciliado, m.cotizacion))
        FROM movimientos m
        WHERE m.cuenta_origen = c.id
          AND m.tipo_movimiento = 'Ingreso'
          AND (c.tipo_cuenta = 'Tarjeta Credito' OR m.fecha <= today_ar())
      ), 0::numeric)
    - COALESCE((
        SELECT sum(monto_estimado(m.monto, m.moneda, m.conciliado, m.cotizacion))
        FROM movimientos m
        WHERE m.cuenta_origen = c.id
          AND m.tipo_movimiento = 'Gasto'
          AND (c.tipo_cuenta = 'Tarjeta Credito' OR m.fecha <= today_ar())
      ), 0::numeric)
    + COALESCE((
        SELECT sum(monto_estimado(m.monto, m.moneda, m.conciliado, m.cotizacion))
        FROM movimientos m
        WHERE m.cuenta_destino = c.id
          AND m.tipo_movimiento = 'Transferencia'
          AND m.fecha <= today_ar()
      ), 0::numeric)
    - COALESCE((
        SELECT sum(monto_estimado(m.monto, m.moneda, m.conciliado, m.cotizacion))
        FROM movimientos m
        WHERE m.cuenta_origen = c.id
          AND m.tipo_movimiento = 'Transferencia'
          AND m.fecha <= today_ar()
      ), 0::numeric)
    AS saldo_actual,
  user_id
FROM cuentas c;

-- ─── Vista: dashboard_resumen ──────────────────────────────────────────────
CREATE OR REPLACE VIEW dashboard_resumen
WITH (security_invoker = true) AS
WITH hoy AS (
  SELECT
    today_ar() AS today,
    date_trunc('month', today_ar()::timestamptz)::date AS inicio_mes,
    date_trunc('month', (today_ar() + interval '1 month')::timestamptz)::date AS inicio_mes_sig
),
usuarios AS (
  SELECT DISTINCT cuentas.user_id
  FROM cuentas
  WHERE cuentas.user_id IS NOT NULL
)
SELECT
  user_id,
  COALESCE((
    SELECT sum(monto_estimado(m.monto, m.moneda, m.conciliado, m.cotizacion))
    FROM movimientos m, hoy
    WHERE m.user_id = u.user_id
      AND m.tipo_movimiento = 'Ingreso'
      AND m.periodo_tarjeta >= hoy.inicio_mes
      AND m.periodo_tarjeta <  hoy.inicio_mes_sig
      AND m.fecha           <= hoy.today
  ), 0::numeric) AS ingresos_actuales,

  COALESCE((
    SELECT sum(monto_estimado(m.monto, m.moneda, m.conciliado, m.cotizacion))
    FROM movimientos m, hoy
    WHERE m.user_id = u.user_id
      AND m.tipo_movimiento = 'Gasto'
      AND m.fecha >= hoy.inicio_mes
      AND m.fecha <= hoy.today
  ), 0::numeric) AS gastos_actuales,

  COALESCE((
    SELECT sum(sac.saldo_actual)
    FROM saldo_actual_cuentas sac
    WHERE sac.user_id = u.user_id
      AND sac.tipo_cuenta <> 'Tarjeta Credito'
      AND sac.activa = true
  ), 0::numeric) AS disponible_real,

  COALESCE((
    SELECT sum(monto_estimado(m.monto, m.moneda, m.conciliado, m.cotizacion))
    FROM movimientos m
      JOIN cuentas c ON c.id = m.cuenta_origen,
      hoy
    WHERE m.user_id = u.user_id
      AND m.tipo_movimiento = 'Gasto'
      AND c.tipo_cuenta = 'Tarjeta Credito'
      AND m.periodo_tarjeta >= hoy.inicio_mes
      AND m.periodo_tarjeta <  hoy.inicio_mes_sig
  ), 0::numeric) AS deuda_tarjetas_periodo,

  COALESCE((
    SELECT sum(monto_estimado(m.monto, m.moneda, m.conciliado, m.cotizacion))
    FROM movimientos m
      JOIN cuentas c ON c.id = m.cuenta_destino,
      hoy
    WHERE m.user_id = u.user_id
      AND m.tipo_movimiento = 'Transferencia'
      AND c.tipo_cuenta = 'Tarjeta Credito'
      AND m.fecha >= hoy.inicio_mes
      AND m.fecha <= hoy.today
  ), 0::numeric) AS pagos_tarjeta_mes,

  COALESCE((
    SELECT sum(monto_estimado(m.monto, m.moneda, m.conciliado, m.cotizacion))
    FROM movimientos m, hoy
    WHERE m.user_id = u.user_id
      AND m.tipo_movimiento = 'Ingreso'
      AND m.periodo_tarjeta >= hoy.inicio_mes
      AND m.periodo_tarjeta <  hoy.inicio_mes_sig
      AND m.fecha           >  hoy.today
  ), 0::numeric) AS ingresos_futuros_mes,

  COALESCE((
    SELECT sum(
      CASE
        WHEN gf.moneda = 'USD' THEN gf.monto_estimado * COALESCE((
          SELECT p.valor FROM parametros p
          WHERE p.id = 'Dolar_Tarjeta_BNA' AND p.user_id = u.user_id LIMIT 1
        ), 1410::numeric)
        ELSE gf.monto_estimado
      END
    )
    FROM gastos_fijos gf
      JOIN cuentas c ON c.id = gf.cuenta_pago_default
      CROSS JOIN (SELECT EXTRACT(day FROM today_ar()) AS hoy_dia) d
    WHERE gf.user_id = u.user_id
      AND gf.activo = true
      AND gf.dia_vencimiento::numeric >= d.hoy_dia
      AND c.tipo_cuenta <> 'Tarjeta Credito'
  ), 0::numeric) AS gastos_fijos_pendientes,

  to_char(date_trunc('month', today_ar()::timestamptz), 'MM/YYYY') AS periodo_actual
FROM usuarios u;
