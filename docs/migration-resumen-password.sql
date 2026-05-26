-- ─── Migration: password encriptada de resúmenes de tarjeta ────────────────
--
-- Algunos bancos mandan los resúmenes en PDF protegidos por una password
-- (típicamente DNI o variante). Para que la app pueda descifrar el PDF
-- automáticamente al subirlo en /conciliaciones, guardamos la password
-- por tarjeta — ENCRIPTADA at-rest con AES-256-GCM usando una key del
-- env var RESUMEN_PASSWORD_KEY que NO está en la DB.
--
-- Importante:
--   - El cipher es opaco. La DB sola no expone el plaintext.
--   - El plaintext nunca se devuelve al cliente. Solo el server-side
--     code (parsear-resumen + endpoint que la setea) la maneja.
--   - El cliente solo recibe un boolean has_resumen_password.
--   - Si pierdo RESUMEN_PASSWORD_KEY, las passwords guardadas son
--     irrecuperables. El user puede re-ingresarlas.

ALTER TABLE public.cuentas
  ADD COLUMN IF NOT EXISTS resumen_password_cipher TEXT NULL;

COMMENT ON COLUMN public.cuentas.resumen_password_cipher IS
  'Password del PDF del resumen, encriptada AES-256-GCM. Solo legible '
  'desde server con la env var RESUMEN_PASSWORD_KEY. Nunca devolver al cliente.';
