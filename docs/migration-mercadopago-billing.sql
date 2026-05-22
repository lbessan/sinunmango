-- ─────────────────────────────────────────────────────────────────────────────
-- Mercado Pago billing — schema para suscripciones recurrentes.
--
-- Reemplaza el modelo Google Play que estaba con `google_subscription_id` y
-- `google_purchase_token` en user_profiles. Esos campos se dejan por ahora
-- (para no romper la app móvil hasta que esté archivada), una migration
-- posterior los va a dropear.
--
-- Modelo MP:
--   - Preapproval: el user autoriza una vez y MP cobra recurrente.
--   - start_date: permite "trial" gratuito hasta esa fecha (sin cobrar).
--   - Webhook: MP nos avisa de cada evento (autorización, cobro, cancelación).
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

-- ─── 1. Campos MP en user_profiles ──────────────────────────────────────────
ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS mp_preapproval_id        TEXT,
  ADD COLUMN IF NOT EXISTS mp_payer_id              TEXT,
  ADD COLUMN IF NOT EXISTS mp_status                TEXT,
  ADD COLUMN IF NOT EXISTS plan_period              TEXT,
  ADD COLUMN IF NOT EXISTS plan_renews_at           TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS plan_amount              NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS early_access             BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS early_access_expires_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS subscribed_at            TIMESTAMPTZ;

-- mp_status acepta solo los estados que devuelve MP en el webhook
-- (pendiente | autorizada | pausada | cancelada).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'user_profiles_mp_status_check') THEN
    ALTER TABLE public.user_profiles
      ADD CONSTRAINT user_profiles_mp_status_check
        CHECK (mp_status IS NULL OR mp_status IN ('pending', 'authorized', 'paused', 'cancelled'));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'user_profiles_plan_period_check') THEN
    ALTER TABLE public.user_profiles
      ADD CONSTRAINT user_profiles_plan_period_check
        CHECK (plan_period IS NULL OR plan_period IN ('monthly', 'yearly'));
  END IF;
END$$;

COMMENT ON COLUMN public.user_profiles.mp_preapproval_id IS
  'ID del preapproval activo en Mercado Pago. Persistente hasta que el user cancele.';

COMMENT ON COLUMN public.user_profiles.mp_status IS
  'Estado del preapproval en MP: pending (sin autorizar) | authorized (activo) | paused (cancelado por user/MP) | cancelled (finalizado).';

COMMENT ON COLUMN public.user_profiles.plan_period IS
  'Periodicidad del plan actual. Forward-compat para anual.';

COMMENT ON COLUMN public.user_profiles.plan_renews_at IS
  'Próxima fecha en la que MP va a intentar cobrar. Después de cancelar, el user sigue Pro hasta esta fecha y después degrada.';

COMMENT ON COLUMN public.user_profiles.plan_amount IS
  'Monto del plan en ARS que MP cobra cada ciclo (mismo amount durante toda la vida del preapproval).';

COMMENT ON COLUMN public.user_profiles.early_access IS
  'TRUE si el user está dentro del programa early access (primeros 100 suscriptores). Su preapproval es a precio reducido durante 12 meses.';

COMMENT ON COLUMN public.user_profiles.early_access_expires_at IS
  'Fin del descuento early access (= subscribed_at + 12 meses). Después de esto, el preapproval se cancela y el user re-suscribe a precio normal.';

COMMENT ON COLUMN public.user_profiles.subscribed_at IS
  'Fecha de creación del preapproval (NO la fecha del primer cobro, que es 7 días después por el trial).';

-- ─── 2. Tabla payments — historial / auditoría ──────────────────────────────
CREATE TABLE IF NOT EXISTS public.payments (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  mp_payment_id   TEXT NOT NULL UNIQUE,
  mp_preapproval_id TEXT,
  amount          NUMERIC(10,2) NOT NULL,
  currency        TEXT NOT NULL DEFAULT 'ARS',
  status          TEXT NOT NULL,
  status_detail   TEXT,
  period_start    DATE,
  period_end      DATE,
  raw_event       JSONB,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- status admite los valores que devuelve MP. El listado no es 100% exhaustivo
-- pero los más comunes son: approved, rejected, in_process, refunded, cancelled.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'payments_status_check') THEN
    ALTER TABLE public.payments
      ADD CONSTRAINT payments_status_check
        CHECK (status IN ('approved', 'rejected', 'in_process', 'refunded', 'cancelled', 'pending', 'authorized'));
  END IF;
END$$;

CREATE INDEX IF NOT EXISTS payments_user_id_idx     ON public.payments(user_id);
CREATE INDEX IF NOT EXISTS payments_created_at_idx  ON public.payments(created_at DESC);
CREATE INDEX IF NOT EXISTS payments_preapproval_idx ON public.payments(mp_preapproval_id) WHERE mp_preapproval_id IS NOT NULL;

COMMENT ON TABLE public.payments IS
  'Historial de cobros + intentos de cobro de Mercado Pago. mp_payment_id es UNIQUE para idempotencia del webhook. raw_event guarda el payload completo de MP por si hay que debuggear.';

-- ─── 3. RLS: el user lee solo sus payments. Service-role escribe todo. ──────
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS payments_select_own ON public.payments;
CREATE POLICY payments_select_own ON public.payments
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- ─── 4. Backfill informativo ────────────────────────────────────────────────
-- Si tenés users que ya estaban en Pro vía Google Play, podés mapear a MP así:
--   UPDATE user_profiles
--     SET mp_status = 'authorized', plan_period = 'monthly', plan_amount = 6999
--   WHERE plan = 'pro' AND google_subscription_id IS NOT NULL;
-- Hoy no hay users Pro reales así que lo dejamos sin ejecutar.

COMMIT;

-- ─────────────────────────────────────────────────────────────────────────────
-- Rollback:
--
-- BEGIN;
-- ALTER TABLE public.user_profiles
--   DROP CONSTRAINT IF EXISTS user_profiles_mp_status_check,
--   DROP CONSTRAINT IF EXISTS user_profiles_plan_period_check,
--   DROP COLUMN IF EXISTS mp_preapproval_id,
--   DROP COLUMN IF EXISTS mp_payer_id,
--   DROP COLUMN IF EXISTS mp_status,
--   DROP COLUMN IF EXISTS plan_period,
--   DROP COLUMN IF EXISTS plan_renews_at,
--   DROP COLUMN IF EXISTS plan_amount,
--   DROP COLUMN IF EXISTS early_access,
--   DROP COLUMN IF EXISTS early_access_expires_at,
--   DROP COLUMN IF EXISTS subscribed_at;
-- DROP TABLE IF EXISTS public.payments;
-- COMMIT;
-- ─────────────────────────────────────────────────────────────────────────────
