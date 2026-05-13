-- ═══════════════════════════════════════════════════════════════════════════
-- Migration: usage_monthly — tracking de uso de features Pro en Free tier
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Para users que no son Pro, tenemos límites mensuales en endpoints IA:
--   - asistente:     5 mensajes/mes
--   - ticket:        3 fotos/mes
--   - resumen:       1 PDF resumen/mes
--   - mail_tarjeta:  1 mail parseado/mes
--
-- Esta tabla trackea el conteo por user, año, mes y feature.
-- Se resetea naturalmente al cambiar de mes (porque la PK incluye year+month).
--
-- Helpers expuestos:
--   - increment_usage(feature TEXT) → INTEGER (devuelve count nuevo)
--   - get_usage(feature TEXT)       → INTEGER (devuelve count actual o 0)
--
-- RLS: el user solo ve su propio uso. Las RPCs son SECURITY DEFINER y usan
-- auth.uid() internamente — no hace falta pasarle el user_id.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.usage_monthly (
  user_id    UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  year       INTEGER     NOT NULL,
  month      INTEGER     NOT NULL,  -- 1-12
  feature    TEXT        NOT NULL,  -- 'asistente' | 'ticket' | 'resumen' | 'mail_tarjeta'
  count      INTEGER     NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, year, month, feature)
);

CREATE INDEX IF NOT EXISTS idx_usage_monthly_user_period
  ON public.usage_monthly (user_id, year, month);

-- ── RLS ──────────────────────────────────────────────────────────────────────
ALTER TABLE public.usage_monthly ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users_read_own_usage" ON public.usage_monthly;
CREATE POLICY "users_read_own_usage" ON public.usage_monthly
  FOR SELECT USING (auth.uid() = user_id);

-- Sin INSERT/UPDATE policy: solo las RPCs (SECURITY DEFINER) escriben.
-- Esto previene que un user manipule su contador directamente.

-- ── RPC: increment_usage ─────────────────────────────────────────────────────
-- Incrementa atómicamente el contador del feature para el user actual en
-- el mes actual (AR timezone) y devuelve el nuevo valor.
CREATE OR REPLACE FUNCTION public.increment_usage(p_feature TEXT)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID    := auth.uid();
  v_year    INTEGER := EXTRACT(YEAR  FROM today_ar())::INTEGER;
  v_month   INTEGER := EXTRACT(MONTH FROM today_ar())::INTEGER;
  v_count   INTEGER;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  INSERT INTO public.usage_monthly (user_id, year, month, feature, count)
  VALUES (v_user_id, v_year, v_month, p_feature, 1)
  ON CONFLICT (user_id, year, month, feature)
  DO UPDATE SET
    count      = public.usage_monthly.count + 1,
    updated_at = NOW()
  RETURNING count INTO v_count;

  RETURN v_count;
END;
$$;

-- ── RPC: get_usage ───────────────────────────────────────────────────────────
-- Devuelve el contador actual sin incrementar. Útil para mostrar
-- "Te quedan X de Y" en la UI antes de que el user haga la acción.
CREATE OR REPLACE FUNCTION public.get_usage(p_feature TEXT)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID    := auth.uid();
  v_year    INTEGER := EXTRACT(YEAR  FROM today_ar())::INTEGER;
  v_month   INTEGER := EXTRACT(MONTH FROM today_ar())::INTEGER;
  v_count   INTEGER;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT count INTO v_count
    FROM public.usage_monthly
   WHERE user_id = v_user_id
     AND year    = v_year
     AND month   = v_month
     AND feature = p_feature;

  RETURN COALESCE(v_count, 0);
END;
$$;

-- ── RPC: get_all_usage ───────────────────────────────────────────────────────
-- Devuelve todos los contadores del mes actual para el user.
-- Útil para pintar de una sola llamada los counters en la UI.
CREATE OR REPLACE FUNCTION public.get_all_usage()
RETURNS TABLE (feature TEXT, count INTEGER)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID    := auth.uid();
  v_year    INTEGER := EXTRACT(YEAR  FROM today_ar())::INTEGER;
  v_month   INTEGER := EXTRACT(MONTH FROM today_ar())::INTEGER;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  RETURN QUERY
    SELECT um.feature, um.count
      FROM public.usage_monthly um
     WHERE um.user_id = v_user_id
       AND um.year    = v_year
       AND um.month   = v_month;
END;
$$;

-- Grants (acceso desde el cliente autenticado)
GRANT EXECUTE ON FUNCTION public.increment_usage(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_usage(TEXT)       TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_all_usage()       TO authenticated;
