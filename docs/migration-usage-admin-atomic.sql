-- ═══════════════════════════════════════════════════════════════════════════
-- Migration: increment_usage_admin — check + commit atómico para webhooks
-- ═══════════════════════════════════════════════════════════════════════════
--
-- El `increment_usage` original usa auth.uid() y sirve para llamadas con
-- sesión de user. Los webhooks (email-inbound, RTDN, etc.) corren con
-- service_role y no tienen sesión, así que en `enforceMonthlyLimitAsAdmin`
-- veníamos haciendo SELECT + UPSERT desde TypeScript — patrón con race
-- condition: dos invocaciones concurrentes pueden leer el mismo count y
-- ambas escribir count+1, perdiendo un incremento (o, peor, ambas pasar el
-- check de límite incluso si solo una debería).
--
-- Esta RPC encapsula check + commit en una sola transacción atómica usando
-- INSERT ON CONFLICT DO NOTHING + SELECT FOR UPDATE + UPDATE.
--
-- Retorna JSONB: { allowed: bool, used: int }
--   - allowed: true si el incremento se aplicó (o si limit < 0 → Pro)
--   - used:    contador final (post-incremento si allowed, sin tocar si no)
--
-- Idempotente: usa CREATE OR REPLACE.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.increment_usage_admin(
  p_user_id UUID,
  p_feature TEXT,
  p_limit   INTEGER   -- -1 = sin límite (user Pro)
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_year    INTEGER := EXTRACT(YEAR  FROM today_ar())::INTEGER;
  v_month   INTEGER := EXTRACT(MONTH FROM today_ar())::INTEGER;
  v_current INTEGER;
  v_new     INTEGER;
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'p_user_id required';
  END IF;
  IF p_feature IS NULL OR p_feature = '' THEN
    RAISE EXCEPTION 'p_feature required';
  END IF;

  -- ── Pro (sin límite): incrementar y salir ──
  IF p_limit < 0 THEN
    INSERT INTO public.usage_monthly (user_id, year, month, feature, count)
    VALUES (p_user_id, v_year, v_month, p_feature, 1)
    ON CONFLICT (user_id, year, month, feature)
    DO UPDATE SET
      count      = public.usage_monthly.count + 1,
      updated_at = NOW()
    RETURNING count INTO v_new;
    RETURN jsonb_build_object('allowed', TRUE, 'used', v_new);
  END IF;

  -- ── Free tier: check + commit atómico ──
  -- 1) Garantizar que la fila existe (con count=0 si recién creada).
  INSERT INTO public.usage_monthly (user_id, year, month, feature, count)
  VALUES (p_user_id, v_year, v_month, p_feature, 0)
  ON CONFLICT (user_id, year, month, feature) DO NOTHING;

  -- 2) Bloquear la fila. Llamadas concurrentes para el mismo
  --    (user, feature, mes) se serializan acá hasta nuestro commit.
  SELECT count INTO v_current
    FROM public.usage_monthly
   WHERE user_id = p_user_id
     AND year    = v_year
     AND month   = v_month
     AND feature = p_feature
   FOR UPDATE;

  -- 3) Chequear contra el límite.
  IF v_current >= p_limit THEN
    RETURN jsonb_build_object('allowed', FALSE, 'used', v_current);
  END IF;

  -- 4) Incrementar.
  v_new := v_current + 1;
  UPDATE public.usage_monthly
     SET count = v_new, updated_at = NOW()
   WHERE user_id = p_user_id
     AND year    = v_year
     AND month   = v_month
     AND feature = p_feature;

  RETURN jsonb_build_object('allowed', TRUE, 'used', v_new);
END;
$$;

-- ── Grants ───────────────────────────────────────────────────────────────────
-- Solo service_role puede llamar esta RPC. PUBLIC y authenticated NO — un user
-- autenticado podría pasarse p_user_id de otro y manipular su contador.
REVOKE EXECUTE ON FUNCTION public.increment_usage_admin(UUID, TEXT, INTEGER) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.increment_usage_admin(UUID, TEXT, INTEGER) FROM authenticated;
GRANT  EXECUTE ON FUNCTION public.increment_usage_admin(UUID, TEXT, INTEGER) TO service_role;
