-- ═══════════════════════════════════════════════════════════════════
-- RLS — Row Level Security  (sinunmango)
-- Ejecutar en Supabase → SQL Editor
-- Si ya corriste migration-multiuser.sql, solo corrés la sección que
-- dice "NUEVO" — el resto ya está aplicado.
-- ═══════════════════════════════════════════════════════════════════

-- ── 1. RLS habilitado en todas las tablas ────────────────────────────
ALTER TABLE cuentas        ENABLE ROW LEVEL SECURITY;
ALTER TABLE movimientos    ENABLE ROW LEVEL SECURITY;
ALTER TABLE categorias     ENABLE ROW LEVEL SECURITY;
ALTER TABLE subcategorias  ENABLE ROW LEVEL SECURITY;
ALTER TABLE gastos_fijos   ENABLE ROW LEVEL SECURITY;
ALTER TABLE parametros     ENABLE ROW LEVEL SECURITY;
ALTER TABLE presupuestos   ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_profiles  ENABLE ROW LEVEL SECURITY;

-- ── 2. Limpiar políticas viejas (idempotente) ────────────────────────
DO $$
DECLARE
  tbl TEXT;
BEGIN
  FOREACH tbl IN ARRAY ARRAY['cuentas','movimientos','categorias','subcategorias',
                               'gastos_fijos','parametros','presupuestos','user_profiles']
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS "own_data" ON %I', tbl);
    EXECUTE format('DROP POLICY IF EXISTS "service_role_all" ON %I', tbl);
    EXECUTE format('DROP POLICY IF EXISTS "read_own" ON %I', tbl);
  END LOOP;
END $$;

-- ── 3. Políticas de usuario: cada uno solo ve y modifica sus datos ───
CREATE POLICY "own_data" ON cuentas
  FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "own_data" ON movimientos
  FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "own_data" ON categorias
  FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "own_data" ON subcategorias
  FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "own_data" ON gastos_fijos
  FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "own_data" ON parametros
  FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "own_data" ON presupuestos
  FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "read_own" ON user_profiles
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "insert_own" ON user_profiles
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

-- ── 4. Políticas service_role: acceso total para el backend ─────────
-- El adminClient (service role) bypasea RLS y necesita estas políticas
-- para operar correctamente (crons, email-inbound, etc.).
CREATE POLICY "service_role_all" ON cuentas
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "service_role_all" ON movimientos
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "service_role_all" ON categorias
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "service_role_all" ON subcategorias
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "service_role_all" ON gastos_fijos
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "service_role_all" ON parametros
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "service_role_all" ON presupuestos
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "service_role_all" ON user_profiles
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ── 5. [NUEVO] Trigger: crear perfil automáticamente al registrarse ──
-- Cuando un usuario se registra con Google (o cualquier proveedor),
-- Supabase crea la entrada en auth.users y este trigger crea su perfil.
-- Por defecto todos los usuarios nuevos quedan authorized = true.
-- Cambiar a false si querés aprobar manualmente.

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.user_profiles (user_id, email, authorized)
  VALUES (NEW.id, NEW.email, true)
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ── 6. [NUEVO] Función para verificar si el usuario está autorizado ──
-- Usada desde el middleware de Next.js (o desde API routes).
CREATE OR REPLACE FUNCTION public.is_authorized(uid UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT COALESCE(
    (SELECT authorized FROM public.user_profiles WHERE user_id = uid LIMIT 1),
    false
  );
$$;

-- ═══════════════════════════════════════════════════════════════════
-- GESTIÓN DE USUARIOS (comandos útiles)
-- ─────────────────────────────────────────────────────────────────
-- Ver todos los usuarios:
--   SELECT u.email, p.authorized, p.created_at
--   FROM auth.users u
--   LEFT JOIN user_profiles p ON p.user_id = u.id
--   ORDER BY p.created_at DESC;
--
-- Autorizar un usuario nuevo:
--   UPDATE user_profiles SET authorized = true  WHERE email = 'nuevo@email.com';
--
-- Bloquear un usuario:
--   UPDATE user_profiles SET authorized = false WHERE email = 'otro@email.com';
--
-- Abrir registro libre (autoriza a todos los pendientes):
--   UPDATE user_profiles SET authorized = true WHERE authorized = false;
-- ═══════════════════════════════════════════════════════════════════
