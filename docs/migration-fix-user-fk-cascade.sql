-- ─── Fix FKs hacia auth.users: agregar ON DELETE CASCADE ──────────────────────
--
-- Contexto:
--   7 tablas tenían FK a auth.users con ON DELETE NO ACTION, lo que impedía
--   borrar un user (DELETE FROM auth.users) o ejecutar
--   supabase.auth.admin.deleteUser() — y el cron de purga
--   (/api/cron/purge-deleted-users) depende de esa última llamada para hacer
--   hard delete después del grace period de 30 días.
--
-- Verificación previa (devolvía NO ACTION en estas 7 tablas):
--   SELECT conrelid::regclass, pg_get_constraintdef(oid)
--   FROM pg_constraint
--   WHERE contype = 'f' AND confrelid = 'auth.users'::regclass;
--
-- Tablas afectadas:
--   categorias, cuentas, gastos_fijos, movimientos, parametros,
--   subcategorias, user_preferences
--
-- Las demás (user_profiles, inversiones, usage_monthly, bancos_custom, etc.)
-- ya tenían CASCADE — no requieren cambios.

BEGIN;

ALTER TABLE categorias
  DROP CONSTRAINT categorias_user_id_fkey,
  ADD  CONSTRAINT categorias_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE cuentas
  DROP CONSTRAINT cuentas_user_id_fkey,
  ADD  CONSTRAINT cuentas_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE gastos_fijos
  DROP CONSTRAINT gastos_fijos_user_id_fkey,
  ADD  CONSTRAINT gastos_fijos_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE movimientos
  DROP CONSTRAINT movimientos_user_id_fkey,
  ADD  CONSTRAINT movimientos_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE parametros
  DROP CONSTRAINT parametros_user_id_fkey,
  ADD  CONSTRAINT parametros_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE subcategorias
  DROP CONSTRAINT subcategorias_user_id_fkey,
  ADD  CONSTRAINT subcategorias_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE user_preferences
  DROP CONSTRAINT user_preferences_user_id_fkey,
  ADD  CONSTRAINT user_preferences_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

COMMIT;

-- ─── Rollback ─────────────────────────────────────────────────────────────────
-- Para revertir (volver a NO ACTION), correr lo mismo cambiando
--   ON DELETE CASCADE → (omitir la cláusula, default es NO ACTION)
-- en cada uno de los 7 ADD CONSTRAINT.
