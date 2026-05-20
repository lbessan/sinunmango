-- ─────────────────────────────────────────────────────────────────────────────
-- bancos_custom.tipo — clasificación del banco custom (banco/billetera/crypto)
--
-- Aplicar en Supabase SQL Editor.
--
-- Motivación:
--   El catálogo de bancos de fábrica (`constants/banks.ts`) tiene un campo
--   `tipo: 'banco' | 'billetera' | 'crypto'` que la UI usa para agruparlos
--   en /configuracion/bancos. Los `bancos_custom` no tenían el campo, así
--   que todos quedaban en una sola sección "Personalizados" sin manera de
--   decir si Brubank era banco/billetera/crypto. El form tampoco lo pedía.
--
-- Con esta migration:
--   - Nueva columna `tipo TEXT NOT NULL DEFAULT 'banco'` con CHECK constraint
--     que limita a los 3 valores permitidos.
--   - Backfill: los existentes se quedan con 'banco' (el default). Si tenés
--     algunos que sabés que son billetera o crypto, podés actualizarlos
--     manualmente después.
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

ALTER TABLE public.bancos_custom
  ADD COLUMN IF NOT EXISTS tipo TEXT NOT NULL DEFAULT 'banco';

-- CHECK constraint para evitar valores inválidos. IF NOT EXISTS no aplica a
-- constraints — usamos un DO block para evitar error si re-corremos.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'bancos_custom_tipo_check'
  ) THEN
    ALTER TABLE public.bancos_custom
      ADD CONSTRAINT bancos_custom_tipo_check
        CHECK (tipo IN ('banco', 'billetera', 'crypto'));
  END IF;
END$$;

COMMENT ON COLUMN public.bancos_custom.tipo IS
  'Clasificación del banco/billetera para agruparlo en /configuracion/bancos. Valores válidos: banco | billetera | crypto.';

COMMIT;

-- ─────────────────────────────────────────────────────────────────────────────
-- Rollback:
--   ALTER TABLE public.bancos_custom DROP CONSTRAINT IF EXISTS bancos_custom_tipo_check;
--   ALTER TABLE public.bancos_custom DROP COLUMN IF EXISTS tipo;
-- ─────────────────────────────────────────────────────────────────────────────
