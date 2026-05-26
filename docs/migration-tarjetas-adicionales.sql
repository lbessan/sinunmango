-- ─── Migration: tarjetas adicionales ───────────────────────────────────────
--
-- Modela las tarjetas adicionales como cuentas "hijas" de una principal.
-- Cada adicional es su propia fila en `cuentas` (con sus propios movs y
-- saldo), pero apunta a la principal y hereda de ella:
--   - fecha de cierre del resumen
--   - fecha de vencimiento del pago
--   - password del PDF
--   - moneda
--
-- nombre_titular es lo que figura en el PDF del resumen (ej: "Celeste
-- Cerono"). Lo usamos al procesar el resumen para dispatchar cada
-- consumo a la cuenta correcta (matching case-insensitive + trim contra
-- nombre_titular).
--
-- Depth máxima = 1 (una adicional NO puede tener su propia adicional).
-- Esto NO lo enforza la DB — lo valida el endpoint POST/PATCH. La razón
-- es que un CHECK con subquery no es estable en Postgres; un trigger
-- sería más prolijo pero el endpoint cubre el 99% de los casos.

ALTER TABLE public.cuentas
  ADD COLUMN IF NOT EXISTS tarjeta_principal_id TEXT NULL
    REFERENCES public.cuentas(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS nombre_titular TEXT NULL;

COMMENT ON COLUMN public.cuentas.tarjeta_principal_id IS
  'Si esta cuenta es una tarjeta ADICIONAL, apunta a la cuenta de la '
  'tarjeta principal de la que depende. Hereda fechas + password + '
  'moneda. Depth máx = 1 (validado en endpoint). ON DELETE SET NULL: si '
  'borran la principal, la adicional queda huérfana pero no se borra '
  '(el user decide qué hacer con ella).';

COMMENT ON COLUMN public.cuentas.nombre_titular IS
  'Nombre del titular de la tarjeta tal cual aparece en el PDF del '
  'resumen (ej: "Celeste Cerono"). Se usa para dispatchar consumos del '
  'resumen a la cuenta correcta cuando hay tarjetas adicionales. '
  'Matching es case-insensitive + trim.';

-- Index para queries de "dame las adicionales de esta principal"
CREATE INDEX IF NOT EXISTS idx_cuentas_tarjeta_principal_id
  ON public.cuentas(tarjeta_principal_id)
  WHERE tarjeta_principal_id IS NOT NULL;

-- Index para el lookup por titular (matching del resumen)
CREATE INDEX IF NOT EXISTS idx_cuentas_user_titular
  ON public.cuentas(user_id, lower(nombre_titular))
  WHERE nombre_titular IS NOT NULL;
