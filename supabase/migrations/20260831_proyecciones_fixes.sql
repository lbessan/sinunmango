-- ─── Proyecciones: fixes de fondo ────────────────────────────────────────────
--
-- 1) movimientos.gasto_fijo_id — link persistente "este movimiento ES el pago
--    de este gasto fijo". Con esto las proyecciones restan un gasto fijo de
--    tarjeta SOLO si su consumo todavía no entró como movimiento en ese
--    período (antes se restaban los dos: doble conteo).
-- 2) Backfill de periodo_tarjeta NULL (ingresos-bulk no lo seteaba → esos
--    movimientos eran invisibles para toda proyección).
-- 3) Dedup + candado de cuotas: elimina duplicados exactos dentro de un mismo
--    grupo de cuotas y agrega unique index para que no vuelvan a entrar.
-- 4) movimientos_completos expone gasto_fijo_id.
-- 5) dashboard_resumen: ingresos_futuros_mes excluye reintegros de tarjeta
--    (ya restan en deuda_tarjetas_periodo — sumarlos acá era doble beneficio).

-- ── 1) Link movimiento → gasto fijo ──────────────────────────────────────────
alter table public.movimientos
  add column if not exists gasto_fijo_id text references public.gastos_fijos(id) on delete set null;

create index if not exists idx_movimientos_gasto_fijo
  on public.movimientos (user_id, gasto_fijo_id, periodo_tarjeta)
  where gasto_fijo_id is not null;

-- ── 2) Backfill: movimientos sin período → mes de su fecha ───────────────────
-- (regla de calcularPeriodoCuenta para cuentas sin diferimiento; los únicos
-- NULL que existen vienen de ingresos-bulk, que siempre es cuenta banco)
update public.movimientos
   set periodo_tarjeta = date_trunc('month', fecha)::date
 where periodo_tarjeta is null;

-- ── 3) Cuotas duplicadas dentro del mismo grupo (doble insert) ───────────────
delete from public.movimientos a
 using public.movimientos b
 where a.grupo_cuotas is not null
   and a.grupo_cuotas = b.grupo_cuotas
   and a.cuota_actual = b.cuota_actual
   and a.user_id      = b.user_id
   and a.ctid > b.ctid;

create unique index if not exists idx_movimientos_grupo_cuota_unica
  on public.movimientos (user_id, grupo_cuotas, cuota_actual)
  where grupo_cuotas is not null;

-- ── 3b) Backstop: nunca más un movimiento con período NULL ──────────────────
-- Un periodo_tarjeta NULL hace al movimiento invisible para dashboard, cuenta
-- y proyecciones (los filtros por período nunca matchean NULL). El server lo
-- deriva bien (con diferimiento de tarjeta); este trigger es la red para
-- cualquier cliente que inserte/actualice sin período: mes de la fecha.
create or replace function public.movimientos_default_periodo()
returns trigger language plpgsql as $$
begin
  if new.periodo_tarjeta is null and new.fecha is not null then
    new.periodo_tarjeta := date_trunc('month', new.fecha)::date;
  end if;
  return new;
end $$;

drop trigger if exists trg_movimientos_default_periodo on public.movimientos;
create trigger trg_movimientos_default_periodo
  before insert or update on public.movimientos
  for each row execute function public.movimientos_default_periodo();

-- ── 4) movimientos_completos con gasto_fijo_id ───────────────────────────────
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
    m.grupo_cuotas,
    m.gasto_fijo_id                              -- link al gasto fijo que este mov paga
   FROM movimientos m
     LEFT JOIN categorias c ON c.id = m.categoria
     LEFT JOIN cuentas co ON co.id = m.cuenta_origen
     LEFT JOIN cuentas cd ON cd.id = m.cuenta_destino;

-- ── 5) dashboard_resumen: ingresos_futuros_mes sin reintegros de tarjeta ────
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

    -- ── Ingresos futuros del mes (FIX: excluye reintegros de tarjeta) ──
    -- Un Ingreso con cuenta_origen = tarjeta es un reintegro/descuento: ya
    -- resta en deuda_tarjetas_periodo. Sumarlo también acá era doble beneficio.
    COALESCE(( SELECT sum(monto_estimado(m.monto, m.moneda, m.conciliado, m.cotizacion))
               FROM movimientos m
                 LEFT JOIN cuentas co ON co.id = m.cuenta_origen,
                 hoy
              WHERE m.user_id = u.user_id
                AND m.tipo_movimiento = 'Ingreso'
                AND (co.tipo_cuenta IS NULL OR co.tipo_cuenta <> 'Tarjeta Credito')
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
