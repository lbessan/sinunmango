-- ═══════════════════════════════════════════════════════════════════════════
-- Schema snapshot — sinunmango (Supabase project: zlxoqzyabbzwfmpngusk)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Dump de los objetos de schema `public`: views, functions, triggers, indexes.
-- Las tablas NO están aca — su estructura vive en `lib/database.types.ts`
-- (autogenerado por Supabase CLI), y los CREATE TABLE/ALTER TABLE estan en
-- las migraciones individuales (migration-*.sql).
--
-- Para regenerar este archivo: correr en Supabase Studio > SQL Editor las
-- queries de los 4 bloques de docs/README.md (Views / Functions / Triggers /
-- Indexes) y pegar los outputs aca.
--
-- Disaster recovery: si Supabase explota, recrear la DB requiere:
--   1. Crear tablas desde las migraciones individuales (orden cronologico)
--   2. Aplicar este archivo (views, functions, triggers, indexes)
--   3. Aplicar migration-rls-policies.sql
--   4. Restaurar datos desde el ultimo backup automatico de Supabase
-- ═══════════════════════════════════════════════════════════════════════════


-- ═══════════════════════════════════════════════════════════════════════════
-- FUNCTIONS
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── FUNCTION: monto_estimado ─────────────────────────────────────────────
-- Calcula el monto en ARS de un movimiento, manejando conversion USD->ARS.
-- Si moneda='USD' y conciliado=true con cotizacion definida, usa esa.
-- Si no, busca Dolar_Tarjeta_BNA en parametros (default 1410).
CREATE OR REPLACE FUNCTION public.monto_estimado(p_monto numeric, p_moneda text, p_conciliado boolean, p_cotizacion numeric)
 RETURNS numeric
 LANGUAGE plpgsql
 STABLE
AS $function$
declare
  v_dolar_bna numeric;
begin
  if p_moneda = 'USD' then
    if p_conciliado and p_cotizacion is not null then
      return p_monto * p_cotizacion;
    else
      select valor into v_dolar_bna
      from parametros
      where id = 'Dolar_Tarjeta_BNA'
      limit 1;
      return p_monto * coalesce(v_dolar_bna, 1410);
    end if;
  else
    return p_monto;
  end if;
end;
$function$;

-- ─── FUNCTION: today_ar ───────────────────────────────────────────────────
-- Fecha de hoy en zona Argentina (ver migration-timezone-views.sql).
CREATE OR REPLACE FUNCTION public.today_ar()
 RETURNS date
 LANGUAGE sql
 STABLE
AS $function$
  SELECT (now() AT TIME ZONE 'America/Argentina/Buenos_Aires')::date
$function$;

-- ─── FUNCTION: calcular_periodo_tarjeta ──────────────────────────────────
-- Dado fecha de compra, dia de cierre y vencimiento, retorna el primer dia
-- del mes en que vence el pago. Equivalente JS: lib/tarjeta-periodo.ts
CREATE OR REPLACE FUNCTION public.calcular_periodo_tarjeta(p_fecha date, p_tipo_cuenta text, p_fecha_cierre date, p_fecha_vencimiento date)
 RETURNS date
 LANGUAGE plpgsql
 IMMUTABLE
AS $function$
begin
  if p_tipo_cuenta = 'Tarjeta Credito'
     and p_fecha_cierre is not null
     and p_fecha_vencimiento is not null
  then
    if p_fecha <= p_fecha_cierre then
      return date_trunc('month', p_fecha_vencimiento)::date;
    else
      return (date_trunc('month', p_fecha_vencimiento) + interval '1 month')::date;
    end if;
  else
    return date_trunc('month', p_fecha)::date;
  end if;
end;
$function$;

-- ─── FUNCTION: is_authorized ──────────────────────────────────────────────
-- Devuelve true si el user esta autorizado (user_profiles.authorized).
-- Hoy todos los usuarios estan autorizados (sacamos la allowlist),
-- pero queda la funcion por si se reactiva.
CREATE OR REPLACE FUNCTION public.is_authorized(uid uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
AS $function$
  SELECT COALESCE(
    (SELECT authorized FROM public.user_profiles WHERE user_id = uid LIMIT 1),
    false
  );
$function$;

-- ─── FUNCTION: user_has_pro_access ────────────────────────────────────────
-- Devuelve true si el user tiene plan grandfathered o pro vigente.
CREATE OR REPLACE FUNCTION public.user_has_pro_access(p_user_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM user_profiles
    WHERE user_id = p_user_id
      AND (
        plan = 'grandfathered'
        OR (plan = 'pro' AND (plan_expires_at IS NULL OR plan_expires_at > now()))
      )
  );
$function$;

-- ─── FUNCTION: check_rate_limit ──────────────────────────────────────────
-- Ver docs/migration-rate-limit.sql para detalles.
CREATE OR REPLACE FUNCTION public.check_rate_limit(p_user_id uuid, p_endpoint text, p_max integer, p_window_seconds integer)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_count integer;
BEGIN
  DELETE FROM rate_limit_log WHERE at < now() - interval '1 day';

  SELECT COUNT(*) INTO v_count
  FROM rate_limit_log
  WHERE user_id  = p_user_id
    AND endpoint = p_endpoint
    AND at       > now() - (p_window_seconds || ' seconds')::interval;

  IF v_count >= p_max THEN
    RETURN false;
  END IF;

  INSERT INTO rate_limit_log (user_id, endpoint) VALUES (p_user_id, p_endpoint);
  RETURN true;
END;
$function$;

-- ─── FUNCTION: handle_new_user ────────────────────────────────────────────
-- Trigger function: cuando se crea un user en auth.users, le crea su perfil.
CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.user_profiles (user_id, email, authorized)
  VALUES (NEW.id, NEW.email, true)
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$function$;

-- ─── FUNCTION: update_plan_updated_at ────────────────────────────────────
-- Trigger function: actualiza plan_updated_at cuando cambia el plan.
CREATE OR REPLACE FUNCTION public.update_plan_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  IF NEW.plan IS DISTINCT FROM OLD.plan
  OR NEW.plan_expires_at IS DISTINCT FROM OLD.plan_expires_at THEN
    NEW.plan_updated_at = now();
  END IF;
  RETURN NEW;
END;
$function$;

-- ─── FUNCTION: update_updated_at_column ──────────────────────────────────
-- Trigger function: setea updated_at = now() en cualquier UPDATE.
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$;


-- ═══════════════════════════════════════════════════════════════════════════
-- VIEWS
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── VIEW: movimientos_completos ─────────────────────────────────────────
-- View denormalizado de movimientos con nombres de categoria/cuenta.
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
    m.user_id
   FROM movimientos m
     LEFT JOIN categorias c ON c.id = m.categoria
     LEFT JOIN cuentas co ON co.id = m.cuenta_origen
     LEFT JOIN cuentas cd ON cd.id = m.cuenta_destino;

-- ─── VIEW: saldo_actual_cuentas ──────────────────────────────────────────
-- Ver definicion completa con timezone fix en docs/migration-timezone-views.sql
CREATE OR REPLACE VIEW saldo_actual_cuentas
WITH (security_invoker = true) AS
 SELECT id,
    nombre_cuenta,
    tipo_cuenta,
    moneda,
    activa,
    fecha_cierre_tarjeta,
    fecha_vencimiento_tarjeta,
    saldo_inicial,
    saldo_inicial + COALESCE(( SELECT sum(monto_estimado(m.monto, m.moneda, m.conciliado, m.cotizacion)) AS sum
           FROM movimientos m
          WHERE m.cuenta_origen = c.id AND m.tipo_movimiento = 'Ingreso'::text AND (c.tipo_cuenta = 'Tarjeta Credito'::text OR m.fecha <= today_ar())), 0::numeric)
        - COALESCE(( SELECT sum(monto_estimado(m.monto, m.moneda, m.conciliado, m.cotizacion)) AS sum
           FROM movimientos m
          WHERE m.cuenta_origen = c.id AND m.tipo_movimiento = 'Gasto'::text AND (c.tipo_cuenta = 'Tarjeta Credito'::text OR m.fecha <= today_ar())), 0::numeric)
        + COALESCE(( SELECT sum(monto_estimado(m.monto, m.moneda, m.conciliado, m.cotizacion)) AS sum
           FROM movimientos m
          WHERE m.cuenta_destino = c.id AND m.tipo_movimiento = 'Transferencia'::text AND m.fecha <= today_ar()), 0::numeric)
        - COALESCE(( SELECT sum(monto_estimado(m.monto, m.moneda, m.conciliado, m.cotizacion)) AS sum
           FROM movimientos m
          WHERE m.cuenta_origen = c.id AND m.tipo_movimiento = 'Transferencia'::text AND m.fecha <= today_ar()), 0::numeric) AS saldo_actual,
    user_id
   FROM cuentas c;

-- ─── VIEW: dashboard_resumen ─────────────────────────────────────────────
-- Ver definicion completa con timezone fix en docs/migration-timezone-views.sql
CREATE OR REPLACE VIEW dashboard_resumen
WITH (security_invoker = true) AS
 WITH hoy AS (
         SELECT today_ar() AS today,
            date_trunc('month'::text, today_ar()::timestamp with time zone)::date AS inicio_mes,
            date_trunc('month'::text, (today_ar() + '1 mon'::interval)::timestamp with time zone)::date AS inicio_mes_sig
        ), usuarios AS (
         SELECT DISTINCT cuentas.user_id
           FROM cuentas
          WHERE cuentas.user_id IS NOT NULL
        )
 SELECT user_id,
    COALESCE(( SELECT sum(monto_estimado(m.monto, m.moneda, m.conciliado, m.cotizacion)) AS sum
           FROM movimientos m, hoy
          WHERE m.user_id = u.user_id AND m.tipo_movimiento = 'Ingreso'::text AND m.periodo_tarjeta >= hoy.inicio_mes AND m.periodo_tarjeta < hoy.inicio_mes_sig AND m.fecha <= hoy.today), 0::numeric) AS ingresos_actuales,
    COALESCE(( SELECT sum(monto_estimado(m.monto, m.moneda, m.conciliado, m.cotizacion)) AS sum
           FROM movimientos m, hoy
          WHERE m.user_id = u.user_id AND m.tipo_movimiento = 'Gasto'::text AND m.fecha >= hoy.inicio_mes AND m.fecha <= hoy.today), 0::numeric) AS gastos_actuales,
    COALESCE(( SELECT sum(sac.saldo_actual) AS sum
           FROM saldo_actual_cuentas sac
          WHERE sac.user_id = u.user_id AND sac.tipo_cuenta <> 'Tarjeta Credito'::text AND sac.activa = true), 0::numeric) AS disponible_real,
    COALESCE(( SELECT sum(monto_estimado(m.monto, m.moneda, m.conciliado, m.cotizacion)) AS sum
           FROM movimientos m JOIN cuentas c ON c.id = m.cuenta_origen, hoy
          WHERE m.user_id = u.user_id AND m.tipo_movimiento = 'Gasto'::text AND c.tipo_cuenta = 'Tarjeta Credito'::text AND m.periodo_tarjeta >= hoy.inicio_mes AND m.periodo_tarjeta < hoy.inicio_mes_sig), 0::numeric) AS deuda_tarjetas_periodo,
    COALESCE(( SELECT sum(monto_estimado(m.monto, m.moneda, m.conciliado, m.cotizacion)) AS sum
           FROM movimientos m JOIN cuentas c ON c.id = m.cuenta_destino, hoy
          WHERE m.user_id = u.user_id AND m.tipo_movimiento = 'Transferencia'::text AND c.tipo_cuenta = 'Tarjeta Credito'::text AND m.fecha >= hoy.inicio_mes AND m.fecha <= hoy.today), 0::numeric) AS pagos_tarjeta_mes,
    COALESCE(( SELECT sum(monto_estimado(m.monto, m.moneda, m.conciliado, m.cotizacion)) AS sum
           FROM movimientos m, hoy
          WHERE m.user_id = u.user_id AND m.tipo_movimiento = 'Ingreso'::text AND m.periodo_tarjeta >= hoy.inicio_mes AND m.periodo_tarjeta < hoy.inicio_mes_sig AND m.fecha > hoy.today), 0::numeric) AS ingresos_futuros_mes,
    COALESCE(( SELECT sum(
                CASE
                    WHEN gf.moneda = 'USD'::text THEN gf.monto_estimado * COALESCE(( SELECT p.valor
                       FROM parametros p
                      WHERE p.id = 'Dolar_Tarjeta_BNA'::text AND p.user_id = u.user_id
                     LIMIT 1), 1410::numeric)
                    ELSE gf.monto_estimado
                END) AS sum
           FROM gastos_fijos gf
             JOIN cuentas c ON c.id = gf.cuenta_pago_default
             CROSS JOIN ( SELECT EXTRACT(day FROM today_ar()) AS hoy_dia) d
          WHERE gf.user_id = u.user_id AND gf.activo = true AND gf.dia_vencimiento::numeric >= d.hoy_dia AND c.tipo_cuenta <> 'Tarjeta Credito'::text), 0::numeric) AS gastos_fijos_pendientes,
    to_char(date_trunc('month'::text, today_ar()::timestamp with time zone), 'MM/YYYY'::text) AS periodo_actual
   FROM usuarios u;


-- ═══════════════════════════════════════════════════════════════════════════
-- TRIGGERS
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TRIGGER set_user_preferences_updated_at BEFORE UPDATE ON public.user_preferences
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER inversiones_updated_at BEFORE UPDATE ON public.inversiones
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER set_plan_updated_at BEFORE UPDATE ON public.user_profiles
  FOR EACH ROW EXECUTE FUNCTION update_plan_updated_at();

-- Nota: el trigger on_auth_user_created en auth.users (que dispara
-- handle_new_user) no aparece en esta query porque vive en schema `auth`.
-- Se documenta aparte si hace falta.


-- ═══════════════════════════════════════════════════════════════════════════
-- INDEXES (no primary keys)
-- ═══════════════════════════════════════════════════════════════════════════

-- movimientos
CREATE INDEX IF NOT EXISTS idx_mov_fecha            ON public.movimientos USING btree (fecha);
CREATE INDEX IF NOT EXISTS idx_mov_periodo          ON public.movimientos USING btree (periodo_tarjeta);
CREATE INDEX IF NOT EXISTS idx_mov_tipo             ON public.movimientos USING btree (tipo_movimiento);
CREATE INDEX IF NOT EXISTS idx_mov_cuenta_ori       ON public.movimientos USING btree (cuenta_origen);
CREATE INDEX IF NOT EXISTS idx_mov_cuenta_dest      ON public.movimientos USING btree (cuenta_destino);
CREATE INDEX IF NOT EXISTS idx_mov_conciliado       ON public.movimientos USING btree (conciliado);
CREATE INDEX IF NOT EXISTS idx_mov_periodo_tipo     ON public.movimientos USING btree (periodo_tarjeta, tipo_movimiento);
CREATE INDEX IF NOT EXISTS idx_movimientos_grupo_cuotas ON public.movimientos USING btree (grupo_cuotas) WHERE (grupo_cuotas IS NOT NULL);

-- inversiones
CREATE INDEX IF NOT EXISTS inversiones_user_id_idx     ON public.inversiones USING btree (user_id);
CREATE INDEX IF NOT EXISTS inversiones_estado_idx      ON public.inversiones USING btree (user_id, estado);
CREATE INDEX IF NOT EXISTS inversiones_vencimiento_idx ON public.inversiones USING btree (fecha_vencimiento) WHERE (fecha_vencimiento IS NOT NULL);

-- user_preferences
CREATE UNIQUE INDEX IF NOT EXISTS user_preferences_user_id_key             ON public.user_preferences USING btree (user_id);
CREATE UNIQUE INDEX IF NOT EXISTS user_preferences_email_inbound_token_key ON public.user_preferences USING btree (email_inbound_token);
CREATE UNIQUE INDEX IF NOT EXISTS user_preferences_email_inbound_token_idx ON public.user_preferences USING btree (email_inbound_token) WHERE (email_inbound_token IS NOT NULL);

-- rate_limit_log
CREATE INDEX IF NOT EXISTS rate_limit_log_lookup_idx ON public.rate_limit_log USING btree (user_id, endpoint, at DESC);
