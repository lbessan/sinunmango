-- ═══════════════════════════════════════════════════════════════════════════
-- Migration: exponer grupo_cuotas en la vista movimientos_completos
-- ═══════════════════════════════════════════════════════════════════════════
--
-- PROBLEMA: la analítica necesita agrupar las cuotas de una compra como una
-- sola transacción ("Compra Colchon en 12 cuotas = una compra de $1.6M"),
-- pero la vista no expone `grupo_cuotas` (la columna que identifica el grupo
-- de cuotas de una misma compra).
--
-- FIX: recreamos la vista incluyendo `grupo_cuotas`. Postgres no permite
-- cambiar el orden de columnas en CREATE OR REPLACE, así que la nueva
-- columna va al FINAL del SELECT.
--
-- Idempotente: CREATE OR REPLACE.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE VIEW movimientos_completos
WITH (security_invoker = true) AS
 SELECT m.id,
    m.fecha,
    m.detalle,
    m.categoria,
    m.subcategoria,
    m.monto,
    m.moneda,
    m.tipo_movimiento,
    m.cuenta_origen,
    m.cuenta_destino,
    m.cotizacion,
    m.periodo_tarjeta,
    m.conciliado,
    m.notas,
    m.cuotas_total,
    m.cuota_actual,
    m.ciclo_actual,
    m.foto_comprobante,
    m.created_at,
    monto_estimado(m.monto, m.moneda, m.conciliado, m.cotizacion) AS monto_estimado,
    c.nombre_categoria AS categoria_nombre,
    c.icono AS categoria_icono,
    c.tipo_default AS tipo_movimiento_calculado,
    co.nombre_cuenta AS cuenta_origen_nombre,
    co.tipo_cuenta AS cuenta_origen_tipo,
    cd.nombre_cuenta AS cuenta_destino_nombre,
    m.user_id,
    m.grupo_cuotas                               -- nueva columna al final
   FROM movimientos m
     LEFT JOIN categorias c ON c.id = m.categoria
     LEFT JOIN cuentas co ON co.id = m.cuenta_origen
     LEFT JOIN cuentas cd ON cd.id = m.cuenta_destino;
