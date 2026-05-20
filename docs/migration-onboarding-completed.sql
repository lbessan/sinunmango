-- ─────────────────────────────────────────────────────────────────────────────
-- onboarding_completed_at en user_profiles.
--
-- Aplicar en Supabase SQL Editor (todos los entornos).
--
-- Motivación:
--   El onboarding actual deja al user subir un PDF de resumen de tarjeta en
--   el step 2 para auto-detectar consumos. Como ese endpoint consume cupo
--   mensual ('resumen', límite 1/mes en Free), el user llega al dashboard
--   con 1/1 ya gastado sin haber usado la app "de verdad" todavía.
--
--   Con este flag, los endpoints `/api/parsear-tarjeta-pdf` y
--   `/api/parsear-resumen` saltean check + commit del usage mientras
--   `onboarding_completed_at IS NULL`. Cuando el user termina el último step
--   del onboarding, el client hace POST /api/me/complete-onboarding que
--   setea el flag con NOW(), y desde ahí en adelante los contadores corren
--   normal.
--
-- Side effects:
--   - Queda registro útil para analytics ("¿cuándo terminó el onboarding?").
--   - Para users que ya existen en la DB y que ya completaron onboarding
--     hace rato, la migration setea onboarding_completed_at = created_at
--     (heurística: si tienen al menos 1 cuenta, asumimos que terminaron).
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

-- 1. Columna nueva
ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS onboarding_completed_at TIMESTAMPTZ NULL;

COMMENT ON COLUMN public.user_profiles.onboarding_completed_at IS
  'Timestamp cuando el user terminó el onboarding. NULL = todavía está onboarding. Endpoints sensibles al cupo (parsear PDF/resumen) usan esto para no consumir cupo durante onboarding.';

-- 2. Backfill: users que ya existen y ya tienen al menos 1 cuenta activa →
--    asumimos que terminaron el onboarding hace rato. Usamos created_at del
--    profile como aproximación del momento en que terminaron (no es exacto
--    pero alcanza para que no queden en limbo "todavía en onboarding").
UPDATE public.user_profiles up
   SET onboarding_completed_at = COALESCE(up.created_at, NOW())
 WHERE up.onboarding_completed_at IS NULL
   AND EXISTS (
         SELECT 1 FROM public.cuentas c
          WHERE c.user_id = up.user_id
            AND c.activa  = TRUE
       );

COMMIT;

-- ─────────────────────────────────────────────────────────────────────────────
-- Rollback:
--   ALTER TABLE public.user_profiles DROP COLUMN IF EXISTS onboarding_completed_at;
-- ─────────────────────────────────────────────────────────────────────────────
