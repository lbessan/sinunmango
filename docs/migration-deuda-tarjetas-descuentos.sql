-- ═══════════════════════════════════════════════════════════════════════════
-- Migration: deuda_tarjetas_periodo descontando Ingresos (reintegros/cashback)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- BUG: `deuda_tarjetas_periodo` solo sumaba tipo_movimiento='Gasto'. Eso
--      ignoraba reintegros, cashback y descuentos que aparecen como
--      tipo_movimiento='Ingreso' con cuenta_origen=tarjeta, inflando el total.
--
-- FIX: incluir Ingresos con signo negativo, igual que /conciliaciones.
--
-- Validación: el total debería coincidir exactamente con
--             SUM(monto) FROM movimientos WHERE tarjeta y periodo, con
--             ingresos restando, en la página /conciliaciones.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE VIEW dashboard_resumen
WITH (security_invoker = true) AS
 WITH hoy AS (
         SELECT today_ar() AS today,
            date_trunc('month'::text, today_ar()::timestamp with time zone)::date AS inicio_mes,
            date_trunc('month'::text, (today_ar() + '1 mon'::interval)::timestamp with time zone)::date AS inicio_mes_sig
        ),
   usuarios AS (
         SELECT DISTINCT cuentas.user_id
           FROM cuentas
          WHERE cuentas.user_id IS NOT NULL
        )
 SELECT user_id,

    -- ── Ingresos del mes (sin cambio) ──
    COALESCE(( SELECT sum(monto_estimado(m.monto, m.moneda, m.conciliado, m.cotizacion))
               FROM movimientos m, hoy
              WHERE m.user_id = u.user_id
                AND m.tipo_movimiento = 'Ingreso'
                AND m.periodo_tarjeta >= hoy.inicio_mes
                AND m.periodo_tarjeta <  hoy.inicio_mes_sig
                AND m.fecha           <= hoy.today
           ), 0::numeric) AS ingresos_actuales,

    -- ── Gastos del mes (CASH FLOW REAL, sin cambio) ──
    COALESCE(( SELECT sum(monto_estimado(m.monto, m.moneda, m.conciliado, m.cotizacion))
               FROM movimientos m
                 JOIN cuentas c ON c.id = m.cuenta_origen,
                 hoy
              WHERE m.user_id = u.user_id
                AND m.tipo_movimiento = 'Gasto'
                AND c.tipo_cuenta    != 'Tarjeta Credito'
                AND m.fecha          >= hoy.inicio_mes
                AND m.fecha          <= hoy.today
           ), 0::numeric)
    +
    COALESCE(( SELECT sum(monto_estimado(m.monto, m.moneda, m.conciliado, m.cotizacion))
               FROM movimientos m
                 JOIN cuentas c ON c.id = m.cuenta_destino,
                 hoy
              WHERE m.user_id = u.user_id
                AND m.tipo_movimiento = 'Transferencia'
                AND c.tipo_cuenta     = 'Tarjeta Credito'
                AND m.fecha          >= hoy.inicio_mes
                AND m.fecha          <= hoy.today
           ), 0::numeric) AS gastos_actuales,

    -- ── Disponible real (sin cambio) ──
    COALESCE(( SELECT sum(sac.saldo_actual)
               FROM saldo_actual_cuentas sac
              WHERE sac.user_id = u.user_id
                AND sac.tipo_cuenta <> 'Tarjeta Credito'
                AND sac.activa = true
           ), 0::numeric) AS disponible_real,

    -- ── Deuda tarjetas del período (FIX: resta Ingresos como reintegros) ──
    -- Antes: sólo sumaba Gastos. Ahora: Gastos - Ingresos (descuentos/cashback).
    (
      COALESCE(( SELECT sum(monto_estimado(m.monto, m.moneda, m.conciliado, m.cotizacion))
                 FROM movimientos m
                   JOIN cuentas c ON c.id = m.cuenta_origen,
                   hoy
                WHERE m.user_id = u.user_id
                  AND m.tipo_movimiento = 'Gasto'
                  AND c.tipo_cuenta = 'Tarjeta Credito'
                  AND m.periodo_tarjeta >= hoy.inicio_mes
                  AND m.periodo_tarjeta <  hoy.inicio_mes_sig
             ), 0::numeric)
      -
      COALESCE(( SELECT sum(monto_estimado(m.monto, m.moneda, m.conciliado, m.cotizacion))
                 FROM movimientos m
                   JOIN cuentas c ON c.id = m.cuenta_origen,
                   hoy
                WHERE m.user_id = u.user_id
                  AND m.tipo_movimiento = 'Ingreso'
                  AND c.tipo_cuenta = 'Tarjeta Credito'
                  AND m.periodo_tarjeta >= hoy.inicio_mes
                  AND m.periodo_tarjeta <  hoy.inicio_mes_sig
             ), 0::numeric)
    ) AS deuda_tarjetas_periodo,

    -- ── Pagos tarjeta del mes (sin cambio) ──
    COALESCE(( SELECT sum(monto_estimado(m.monto, m.moneda, m.conciliado, m.cotizacion))
               FROM movimientos m
                 JOIN cuentas c ON c.id = m.cuenta_destino,
                 hoy
              WHERE m.user_id = u.user_id
                AND m.tipo_movimiento = 'Transferencia'
                AND c.tipo_cuenta = 'Tarjeta Credito'
                AND m.fecha >= hoy.inicio_mes
                AND m.fecha <= hoy.today
           ), 0::numeric) AS pagos_tarjeta_mes,

    -- ── Ingresos futuros del mes (sin cambio) ──
    COALESCE(( SELECT sum(monto_estimado(m.monto, m.moneda, m.conciliado, m.cotizacion))
               FROM movimientos m, hoy
              WHERE m.user_id = u.user_id
                AND m.tipo_movimiento = 'Ingreso'
                AND m.periodo_tarjeta >= hoy.inicio_mes
                AND m.periodo_tarjeta <  hoy.inicio_mes_sig
                AND m.fecha           >  hoy.today
           ), 0::numeric) AS ingresos_futuros_mes,

    -- ── Gastos fijos pendientes (sin cambio) ──
    COALESCE(( SELECT sum(
                CASE
                    WHEN gf.moneda = 'USD' THEN gf.monto_estimado * COALESCE(( SELECT p.valor
                       FROM parametros p
                      WHERE p.id = 'Dolar_Tarjeta_BNA' AND p.user_id = u.user_id
                     LIMIT 1), 1410::numeric)
                    ELSE gf.monto_estimado
                END)
               FROM gastos_fijos gf
                 JOIN cuentas c ON c.id = gf.cuenta_pago_default
                 CROSS JOIN ( SELECT EXTRACT(day FROM today_ar()) AS hoy_dia) d
              WHERE gf.user_id = u.user_id
                AND gf.activo = true
                AND gf.dia_vencimiento::numeric >= d.hoy_dia
                AND c.tipo_cuenta <> 'Tarjeta Credito'
           ), 0::numeric) AS gastos_fijos_pendientes,

    to_char(date_trunc('month'::text, today_ar()::timestamp with time zone), 'MM/YYYY'::text) AS periodo_actual
   FROM usuarios u;
