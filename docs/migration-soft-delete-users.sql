-- ─────────────────────────────────────────────────────────────────────────────
-- Soft delete de usuarios con grace period de 30 días.
--
-- Aplicar en Supabase SQL Editor (Production y todos los entornos).
--
-- Cómo funciona el flow:
--   1) User toca "Eliminar mi cuenta" en /configuracion
--   2) Endpoint /api/me/delete marca user_profiles.deleted_at = NOW()
--      y cierra la sesión. La cuenta sigue existiendo en auth.users.
--   3) Durante 30 días el user puede recuperarla:
--      - Login con sus credenciales → middleware detecta deleted_at
--      - Muestra pantalla "Recuperar cuenta" → endpoint /api/me/restore
--      - Pone deleted_at = NULL → vuelve a estar activo
--   4) Cron diario /api/cron/purge-deleted-users:
--      - SELECT user_id WHERE deleted_at < NOW() - INTERVAL '30 days'
--      - Hard delete de todas las tablas relacionadas (cascade por FK
--        a auth.users con ON DELETE CASCADE)
--      - supabase.auth.admin.deleteUser(id) para liberar el email
--      - Email final de confirmación al user
--
-- Compliance: cumple Habeas Data (Ley 25.326 AR), GDPR Art. 17
-- "right to be forgotten", y Google Play User Data Policy (botón
-- explícito de eliminar cuenta, requerido desde abril 2024).
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

-- 1. Columna deleted_at (NULL = activo, NOT NULL = pendiente de purga)
ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ NULL;

COMMENT ON COLUMN public.user_profiles.deleted_at IS
  'Soft delete timestamp. NULL = cuenta activa. NOT NULL = pendiente de purga (cron purge-deleted-users la borra 30 días después).';

-- 2. Index parcial: solo indexa rows con deleted_at NOT NULL (que son las
--    "minoría" — un user activo normal nunca está en este index). El cron
--    de purge usa este index, los queries normales (WHERE user_id = X) no.
CREATE INDEX IF NOT EXISTS idx_user_profiles_deleted_at_pending
  ON public.user_profiles (deleted_at)
  WHERE deleted_at IS NOT NULL;

-- 3. Verificar que el resto de las tablas con user_id tengan ON DELETE
--    CASCADE para que cuando el cron haga DELETE FROM auth.users WHERE id=X,
--    todo se borre solo. Esto debería estar ya configurado (Supabase lo
--    hace por default en migraciones generadas), pero confirmamos algunas
--    tablas core. Si alguna falta, la migration de purge va a fallar.
--
-- Mostrar las FK que existen hacia auth.users con ON DELETE CASCADE
-- (informativo, no modifica nada):
DO $$
DECLARE
  fk_record RECORD;
BEGIN
  FOR fk_record IN
    SELECT
      tc.table_name,
      tc.constraint_name,
      rc.delete_rule
    FROM information_schema.table_constraints tc
    JOIN information_schema.referential_constraints rc
      ON tc.constraint_name = rc.constraint_name
    JOIN information_schema.constraint_column_usage ccu
      ON tc.constraint_name = ccu.constraint_name
    WHERE tc.constraint_type = 'FOREIGN KEY'
      AND ccu.table_schema = 'auth'
      AND ccu.table_name = 'users'
      AND tc.table_schema = 'public'
    ORDER BY tc.table_name
  LOOP
    RAISE NOTICE 'FK to auth.users: table=%, constraint=%, on_delete=%',
      fk_record.table_name, fk_record.constraint_name, fk_record.delete_rule;
  END LOOP;
END$$;

COMMIT;

-- ─────────────────────────────────────────────────────────────────────────────
-- Rollback (si hace falta deshacer):
--
--   BEGIN;
--   DROP INDEX IF EXISTS public.idx_user_profiles_deleted_at_pending;
--   ALTER TABLE public.user_profiles DROP COLUMN IF EXISTS deleted_at;
--   COMMIT;
--
-- Importante: si ya hay rows con deleted_at NOT NULL al momento del rollback,
-- esos users perderían el flag y volverían a estar "activos". Considerar
-- antes de rollback: hacer hard delete manual o setear deleted_at NULL.
-- ─────────────────────────────────────────────────────────────────────────────
