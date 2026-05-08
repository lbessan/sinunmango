-- ═══════════════════════════════════════════════════════════
-- MIGRACIÓN SUSCRIPCIONES — sinunmango
-- Correr en Supabase → SQL Editor
-- ═══════════════════════════════════════════════════════════

-- 1. Agregar columnas de suscripción a user_profiles
-- ─────────────────────────────────────────────────────────
ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS plan                  TEXT        NOT NULL DEFAULT 'free',
  ADD COLUMN IF NOT EXISTS plan_expires_at       TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS google_purchase_token TEXT,
  ADD COLUMN IF NOT EXISTS google_subscription_id TEXT,
  ADD COLUMN IF NOT EXISTS plan_updated_at       TIMESTAMPTZ DEFAULT now();

-- Constraint para valores válidos de plan
ALTER TABLE user_profiles
  DROP CONSTRAINT IF EXISTS user_profiles_plan_check;
ALTER TABLE user_profiles
  ADD CONSTRAINT user_profiles_plan_check
  CHECK (plan IN ('free', 'pro', 'grandfathered'));

-- Comentarios explicativos
COMMENT ON COLUMN user_profiles.plan IS
  'free = plan gratuito | pro = suscripción activa de pago | grandfathered = usuario previo a la monetización, acceso full permanente';
COMMENT ON COLUMN user_profiles.plan_expires_at IS
  'Fecha de vencimiento de la suscripción pro. NULL = sin vencimiento (free o grandfathered).';
COMMENT ON COLUMN user_profiles.google_purchase_token IS
  'Último purchase token recibido de Google Play. Usado para verificar/cancelar con la API de Google.';
COMMENT ON COLUMN user_profiles.google_subscription_id IS
  'ID del producto de suscripción en Google Play (ej: sinunmango_pro_monthly).';

-- 2. Grandfathear a todos los usuarios existentes
-- ─────────────────────────────────────────────────────────
-- Todos los que ya tenían cuenta antes de la monetización
-- quedan con plan = 'grandfathered': acceso full permanente,
-- sin fecha de vencimiento, sin necesidad de suscribirse.
UPDATE user_profiles
SET
  plan            = 'grandfathered',
  plan_expires_at = NULL,
  plan_updated_at = now()
WHERE plan = 'free';

-- 3. Trigger: actualizar plan_updated_at automáticamente
-- ─────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION update_plan_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.plan IS DISTINCT FROM OLD.plan
  OR NEW.plan_expires_at IS DISTINCT FROM OLD.plan_expires_at THEN
    NEW.plan_updated_at = now();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_plan_updated_at ON user_profiles;
CREATE TRIGGER set_plan_updated_at
  BEFORE UPDATE ON user_profiles
  FOR EACH ROW EXECUTE FUNCTION update_plan_updated_at();

-- 4. Función helper: ¿el usuario tiene acceso pro?
-- ─────────────────────────────────────────────────────────
-- Retorna TRUE si el usuario es grandfathered, o si tiene
-- plan 'pro' y la suscripción todavía no venció.
CREATE OR REPLACE FUNCTION user_has_pro_access(p_user_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM user_profiles
    WHERE user_id = p_user_id
      AND (
        plan = 'grandfathered'
        OR (plan = 'pro' AND (plan_expires_at IS NULL OR plan_expires_at > now()))
      )
  );
$$;

-- 5. Verificación final
-- ─────────────────────────────────────────────────────────
SELECT
  plan,
  COUNT(*) AS usuarios,
  MIN(created_at)::date AS primer_registro,
  MAX(created_at)::date AS ultimo_registro
FROM user_profiles
GROUP BY plan
ORDER BY plan;
