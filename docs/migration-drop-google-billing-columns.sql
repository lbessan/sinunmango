-- ─────────────────────────────────────────────────────────────────────────────
-- Drop columns de billing de Google Play.
--
-- Después de migrar a Mercado Pago, estas columnas ya no se usan:
--   - google_subscription_id
--   - google_purchase_token
--
-- Verificación previa (debe devolver 0 antes de correr esto):
--   SELECT COUNT(*) FROM user_profiles
--   WHERE google_subscription_id IS NOT NULL
--      OR google_purchase_token  IS NOT NULL;
--
-- Aplicar en Supabase SQL Editor.
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

ALTER TABLE public.user_profiles
  DROP COLUMN IF EXISTS google_subscription_id,
  DROP COLUMN IF EXISTS google_purchase_token;

COMMIT;

-- ─────────────────────────────────────────────────────────────────────────────
-- Rollback (si por algún motivo querés revertir):
--
--   ALTER TABLE public.user_profiles
--     ADD COLUMN google_subscription_id TEXT,
--     ADD COLUMN google_purchase_token  TEXT;
--
-- Importante: el rollback NO recupera los datos que tenían las columnas antes
-- (el DROP los pierde para siempre). Solo agrega la columna vacía de nuevo.
-- ─────────────────────────────────────────────────────────────────────────────
