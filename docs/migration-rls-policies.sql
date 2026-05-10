-- ─── Migración: políticas RLS para todas las tablas con user_id ─────────────
-- Correr en Supabase → SQL Editor ANTES de pushear el refactor de adminClient.
-- Es idempotente: si las policies ya existen, las recrea sin romper datos.
--
-- Por qué importa: a partir del refactor, las API routes usan el cliente del
-- usuario (no service role) para queries. Si RLS no tiene policies correctas,
-- las queries devuelven 0 filas y la app se rompe silenciosamente.
--
-- Tablas cubiertas:
--   cuentas, movimientos, categorias, subcategorias, gastos_fijos,
--   inversiones, bancos_custom, parametros, user_preferences, user_profiles
--
-- Para cada tabla creamos cuatro policies (SELECT/INSERT/UPDATE/DELETE) basadas
-- en `auth.uid() = user_id`. El service role bypasea RLS por diseño, así que
-- los webhooks y crons que usan adminClient siguen funcionando sin cambios.

-- ============================================================================
-- HELPER: una función para crear las 4 policies estándar de una tabla.
-- DROP IF EXISTS hace la migración idempotente.
-- ============================================================================

-- Aplicá este bloque para cada tabla con user_id. Reemplazá `<tabla>` por el
-- nombre real. Está abajo expandido para todas las tablas conocidas.

-- ─── 1. cuentas ──────────────────────────────────────────────────────────────
ALTER TABLE cuentas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "cuentas_select_own" ON cuentas;
DROP POLICY IF EXISTS "cuentas_insert_own" ON cuentas;
DROP POLICY IF EXISTS "cuentas_update_own" ON cuentas;
DROP POLICY IF EXISTS "cuentas_delete_own" ON cuentas;

CREATE POLICY "cuentas_select_own" ON cuentas FOR SELECT
  USING (auth.uid() = user_id);
CREATE POLICY "cuentas_insert_own" ON cuentas FOR INSERT
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "cuentas_update_own" ON cuentas FOR UPDATE
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "cuentas_delete_own" ON cuentas FOR DELETE
  USING (auth.uid() = user_id);

-- ─── 2. movimientos ──────────────────────────────────────────────────────────
ALTER TABLE movimientos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "movimientos_select_own" ON movimientos;
DROP POLICY IF EXISTS "movimientos_insert_own" ON movimientos;
DROP POLICY IF EXISTS "movimientos_update_own" ON movimientos;
DROP POLICY IF EXISTS "movimientos_delete_own" ON movimientos;

CREATE POLICY "movimientos_select_own" ON movimientos FOR SELECT
  USING (auth.uid() = user_id);
CREATE POLICY "movimientos_insert_own" ON movimientos FOR INSERT
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "movimientos_update_own" ON movimientos FOR UPDATE
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "movimientos_delete_own" ON movimientos FOR DELETE
  USING (auth.uid() = user_id);

-- ─── 3. categorias ───────────────────────────────────────────────────────────
ALTER TABLE categorias ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "categorias_select_own" ON categorias;
DROP POLICY IF EXISTS "categorias_insert_own" ON categorias;
DROP POLICY IF EXISTS "categorias_update_own" ON categorias;
DROP POLICY IF EXISTS "categorias_delete_own" ON categorias;

CREATE POLICY "categorias_select_own" ON categorias FOR SELECT
  USING (auth.uid() = user_id);
CREATE POLICY "categorias_insert_own" ON categorias FOR INSERT
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "categorias_update_own" ON categorias FOR UPDATE
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "categorias_delete_own" ON categorias FOR DELETE
  USING (auth.uid() = user_id);

-- ─── 4. subcategorias ────────────────────────────────────────────────────────
ALTER TABLE subcategorias ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "subcategorias_select_own" ON subcategorias;
DROP POLICY IF EXISTS "subcategorias_insert_own" ON subcategorias;
DROP POLICY IF EXISTS "subcategorias_update_own" ON subcategorias;
DROP POLICY IF EXISTS "subcategorias_delete_own" ON subcategorias;

CREATE POLICY "subcategorias_select_own" ON subcategorias FOR SELECT
  USING (auth.uid() = user_id);
CREATE POLICY "subcategorias_insert_own" ON subcategorias FOR INSERT
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "subcategorias_update_own" ON subcategorias FOR UPDATE
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "subcategorias_delete_own" ON subcategorias FOR DELETE
  USING (auth.uid() = user_id);

-- ─── 5. gastos_fijos ─────────────────────────────────────────────────────────
ALTER TABLE gastos_fijos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "gastos_fijos_select_own" ON gastos_fijos;
DROP POLICY IF EXISTS "gastos_fijos_insert_own" ON gastos_fijos;
DROP POLICY IF EXISTS "gastos_fijos_update_own" ON gastos_fijos;
DROP POLICY IF EXISTS "gastos_fijos_delete_own" ON gastos_fijos;

CREATE POLICY "gastos_fijos_select_own" ON gastos_fijos FOR SELECT
  USING (auth.uid() = user_id);
CREATE POLICY "gastos_fijos_insert_own" ON gastos_fijos FOR INSERT
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "gastos_fijos_update_own" ON gastos_fijos FOR UPDATE
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "gastos_fijos_delete_own" ON gastos_fijos FOR DELETE
  USING (auth.uid() = user_id);

-- ─── 6. inversiones ──────────────────────────────────────────────────────────
ALTER TABLE inversiones ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "inversiones_select_own" ON inversiones;
DROP POLICY IF EXISTS "inversiones_insert_own" ON inversiones;
DROP POLICY IF EXISTS "inversiones_update_own" ON inversiones;
DROP POLICY IF EXISTS "inversiones_delete_own" ON inversiones;

CREATE POLICY "inversiones_select_own" ON inversiones FOR SELECT
  USING (auth.uid() = user_id);
CREATE POLICY "inversiones_insert_own" ON inversiones FOR INSERT
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "inversiones_update_own" ON inversiones FOR UPDATE
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "inversiones_delete_own" ON inversiones FOR DELETE
  USING (auth.uid() = user_id);

-- ─── 7. bancos_custom ────────────────────────────────────────────────────────
ALTER TABLE bancos_custom ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "bancos_custom_select_own" ON bancos_custom;
DROP POLICY IF EXISTS "bancos_custom_insert_own" ON bancos_custom;
DROP POLICY IF EXISTS "bancos_custom_update_own" ON bancos_custom;
DROP POLICY IF EXISTS "bancos_custom_delete_own" ON bancos_custom;

CREATE POLICY "bancos_custom_select_own" ON bancos_custom FOR SELECT
  USING (auth.uid() = user_id);
CREATE POLICY "bancos_custom_insert_own" ON bancos_custom FOR INSERT
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "bancos_custom_update_own" ON bancos_custom FOR UPDATE
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "bancos_custom_delete_own" ON bancos_custom FOR DELETE
  USING (auth.uid() = user_id);

-- ─── 8. parametros ───────────────────────────────────────────────────────────
ALTER TABLE parametros ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "parametros_select_own" ON parametros;
DROP POLICY IF EXISTS "parametros_insert_own" ON parametros;
DROP POLICY IF EXISTS "parametros_update_own" ON parametros;
DROP POLICY IF EXISTS "parametros_delete_own" ON parametros;

CREATE POLICY "parametros_select_own" ON parametros FOR SELECT
  USING (auth.uid() = user_id);
CREATE POLICY "parametros_insert_own" ON parametros FOR INSERT
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "parametros_update_own" ON parametros FOR UPDATE
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "parametros_delete_own" ON parametros FOR DELETE
  USING (auth.uid() = user_id);

-- ─── 9. user_preferences ─────────────────────────────────────────────────────
ALTER TABLE user_preferences ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "user_preferences_select_own" ON user_preferences;
DROP POLICY IF EXISTS "user_preferences_insert_own" ON user_preferences;
DROP POLICY IF EXISTS "user_preferences_update_own" ON user_preferences;
DROP POLICY IF EXISTS "user_preferences_delete_own" ON user_preferences;

CREATE POLICY "user_preferences_select_own" ON user_preferences FOR SELECT
  USING (auth.uid() = user_id);
CREATE POLICY "user_preferences_insert_own" ON user_preferences FOR INSERT
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "user_preferences_update_own" ON user_preferences FOR UPDATE
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "user_preferences_delete_own" ON user_preferences FOR DELETE
  USING (auth.uid() = user_id);

-- ─── 10. user_profiles ───────────────────────────────────────────────────────
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "user_profiles_select_own" ON user_profiles;
DROP POLICY IF EXISTS "user_profiles_insert_own" ON user_profiles;
DROP POLICY IF EXISTS "user_profiles_update_own" ON user_profiles;

CREATE POLICY "user_profiles_select_own" ON user_profiles FOR SELECT
  USING (auth.uid() = user_id);
-- INSERT y UPDATE solo via service role (auth/callback + webhooks). No exponemos
-- esas operaciones al user porque el plan lo maneja Google Play, no el cliente.

-- ============================================================================
-- VIEWS — atención: requieren `security_invoker = true` para respetar RLS
-- ============================================================================
-- Por defecto las views se crean con `security_invoker = false`, lo que hace
-- que ejecuten con los permisos del CREADOR (postgres → bypasea RLS). Si tus
-- views fueron creadas así, después del refactor cualquier usuario va a ver
-- 0 filas (porque postgres no tiene auth.uid()).
--
-- Hay que recrearlas con security_invoker. Buscá la definición original de cada
-- view y agregale `WITH (security_invoker = true)` al CREATE OR REPLACE.
-- Ejemplo:
--
--   CREATE OR REPLACE VIEW saldo_actual_cuentas
--   WITH (security_invoker = true)
--   AS SELECT ... FROM cuentas WHERE ...;
--
-- Views afectadas en este proyecto (revisalas):
--   - saldo_actual_cuentas
--   - dashboard_resumen
--   - movimientos_completos
--
-- Para chequear el modo actual de las views:
--
--   SELECT n.nspname AS schema, c.relname AS view_name,
--          (CASE WHEN c.reloptions::text LIKE '%security_invoker=true%'
--                THEN 'invoker' ELSE 'definer (BYPASS RLS!)' END) AS security_mode
--   FROM pg_class c
--   JOIN pg_namespace n ON n.oid = c.relnamespace
--   WHERE c.relkind = 'v' AND n.nspname = 'public'
--   ORDER BY c.relname;
--
-- Si dice "definer (BYPASS RLS!)", recrealas con security_invoker.

-- ============================================================================
-- VERIFICACIÓN FINAL
-- ============================================================================
-- Listá las policies de las tablas migradas para confirmar que quedaron bien:

SELECT schemaname, tablename, policyname, cmd
FROM pg_policies
WHERE tablename IN (
  'cuentas','movimientos','categorias','subcategorias','gastos_fijos',
  'inversiones','bancos_custom','parametros','user_preferences','user_profiles'
)
ORDER BY tablename, cmd;
-- → debería listar 4 policies por tabla (3 para user_profiles).
