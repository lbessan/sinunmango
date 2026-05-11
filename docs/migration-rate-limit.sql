-- ═══════════════════════════════════════════════════════════════════════════
-- Migration: rate limiting via Postgres
-- ═══════════════════════════════════════════════════════════════════════════
--
-- PROBLEMA: endpoints que llaman a la API de Claude (asistente, leer-ticket)
-- pueden ser disparados en loop por accidente — un bug en el cliente o un
-- retry agresivo se traduce en facturas directas en Anthropic.
--
-- FIX: una función SECURITY DEFINER que cuenta requests por (user, endpoint)
-- en una ventana de tiempo y devuelve si se permite o no. Vercel es stateless
-- entre invocaciones, así que el estado vive en Postgres.
--
-- Idempotente.
-- ═══════════════════════════════════════════════════════════════════════════

-- Tabla con los timestamps de cada request
CREATE TABLE IF NOT EXISTS rate_limit_log (
  user_id  uuid        NOT NULL,
  endpoint text        NOT NULL,
  at       timestamptz NOT NULL DEFAULT now()
);

-- Índice optimizado para el lookup por usuario+endpoint en ventana de tiempo
CREATE INDEX IF NOT EXISTS rate_limit_log_lookup_idx
  ON rate_limit_log (user_id, endpoint, at DESC);

-- ─── Función de chequeo ────────────────────────────────────────────────────
-- Cuenta requests del usuario al endpoint en los últimos `window_seconds`.
-- Si excede `max`, devuelve false (rechaza). Si no, loguea el request y
-- devuelve true (permite).
--
-- SECURITY DEFINER: corre con permisos del owner, ignora RLS de la tabla.
-- Por eso la tabla NO tiene policies — el acceso es sólo vía esta función.
CREATE OR REPLACE FUNCTION check_rate_limit(
  p_user_id        uuid,
  p_endpoint       text,
  p_max            integer,
  p_window_seconds integer
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer;
BEGIN
  -- Housekeeping: borrar logs viejos (> 1 día) cada vez que se invoca.
  -- A escala de 1 usuario es trivial; si crece, mover a un cron.
  DELETE FROM rate_limit_log WHERE at < now() - interval '1 day';

  -- Contar requests en la ventana
  SELECT COUNT(*) INTO v_count
  FROM rate_limit_log
  WHERE user_id  = p_user_id
    AND endpoint = p_endpoint
    AND at       > now() - (p_window_seconds || ' seconds')::interval;

  IF v_count >= p_max THEN
    RETURN false;
  END IF;

  -- Loguear y permitir
  INSERT INTO rate_limit_log (user_id, endpoint) VALUES (p_user_id, p_endpoint);
  RETURN true;
END;
$$;

-- Tabla sin policies — sólo accesible vía check_rate_limit().
-- (Por las dudas, habilitamos RLS para que ningún cliente con anon/auth role
--  pueda leer/insertar directamente.)
ALTER TABLE rate_limit_log ENABLE ROW LEVEL SECURITY;
