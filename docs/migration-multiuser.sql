-- ═══════════════════════════════════════════════════════════
-- MIGRACIÓN MULTIUSUARIO — sinunmango
-- Correr en Supabase → SQL Editor
-- ═══════════════════════════════════════════════════════════

-- 1. Tabla de perfiles / autorización
CREATE TABLE IF NOT EXISTS user_profiles (
  user_id   UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email     TEXT NOT NULL,
  authorized BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Agregar user_id a todas las tablas
ALTER TABLE cuentas        ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id);
ALTER TABLE movimientos    ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id);
ALTER TABLE categorias     ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id);
ALTER TABLE subcategorias  ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id);
ALTER TABLE gastos_fijos   ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id);
ALTER TABLE parametros     ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id);
ALTER TABLE presupuestos   ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id);

-- 3. Poblar datos existentes con tu user_id y autorizarte
DO $$
DECLARE
  lucho_id UUID;
BEGIN
  -- Usar := en vez de SELECT INTO para evitar ambigüedad con CREATE TABLE ... AS SELECT
  lucho_id := (SELECT id FROM auth.users WHERE email = 'luchobessan@gmail.com' LIMIT 1);

  IF lucho_id IS NULL THEN
    RAISE EXCEPTION 'No se encontró el usuario luchobessan@gmail.com en auth.users';
  END IF;

  UPDATE cuentas       SET user_id = lucho_id WHERE user_id IS NULL;
  UPDATE movimientos   SET user_id = lucho_id WHERE user_id IS NULL;
  UPDATE categorias    SET user_id = lucho_id WHERE user_id IS NULL;
  UPDATE subcategorias SET user_id = lucho_id WHERE user_id IS NULL;
  UPDATE gastos_fijos  SET user_id = lucho_id WHERE user_id IS NULL;
  UPDATE parametros    SET user_id = lucho_id WHERE user_id IS NULL;
  UPDATE presupuestos  SET user_id = lucho_id WHERE user_id IS NULL;

  INSERT INTO user_profiles (user_id, email, authorized)
  VALUES (lucho_id, 'luchobessan@gmail.com', true)
  ON CONFLICT (user_id) DO UPDATE SET authorized = true;
END $$;

-- 4. Habilitar RLS en todas las tablas
ALTER TABLE cuentas        ENABLE ROW LEVEL SECURITY;
ALTER TABLE movimientos    ENABLE ROW LEVEL SECURITY;
ALTER TABLE categorias     ENABLE ROW LEVEL SECURITY;
ALTER TABLE subcategorias  ENABLE ROW LEVEL SECURITY;
ALTER TABLE gastos_fijos   ENABLE ROW LEVEL SECURITY;
ALTER TABLE parametros     ENABLE ROW LEVEL SECURITY;
ALTER TABLE presupuestos   ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_profiles  ENABLE ROW LEVEL SECURITY;

-- 5. Eliminar políticas viejas genéricas
DROP POLICY IF EXISTS "solo autenticados" ON movimientos;
DROP POLICY IF EXISTS "solo autenticados" ON cuentas;
DROP POLICY IF EXISTS "solo autenticados" ON categorias;

-- 6. Crear políticas: cada usuario solo ve sus datos
CREATE POLICY "own_data" ON cuentas        FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own_data" ON movimientos    FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own_data" ON categorias     FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own_data" ON subcategorias  FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own_data" ON gastos_fijos   FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own_data" ON parametros     FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own_data" ON presupuestos   FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "read_own" ON user_profiles  FOR SELECT TO authenticated USING (auth.uid() = user_id);

-- 7. Política service_role: acceso total para el backend (adminClient)
CREATE POLICY "service_role_all" ON cuentas       FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all" ON movimientos   FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all" ON categorias    FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all" ON subcategorias FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all" ON gastos_fijos  FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all" ON parametros    FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all" ON presupuestos  FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all" ON user_profiles FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 8. Recrear vistas para incluir user_id
-- IMPORTANTE: Correr esto DESPUÉS de que las tablas ya tienen user_id (pasos 2-3)
-- Verificar primero la definición actual con:
--   SELECT pg_get_viewdef('movimientos_completos', true);
--   SELECT pg_get_viewdef('saldo_actual_cuentas', true);
-- Luego recrear con CREATE OR REPLACE VIEW incluyendo user_id en el SELECT.

-- Si la vista movimientos_completos usa un JOIN entre movimientos y otras tablas,
-- agregar m.user_id al SELECT. Ejemplo genérico (ajustar según definición real):
-- CREATE OR REPLACE VIEW movimientos_completos AS
--   SELECT m.*, c.nombre_cuenta AS cuenta_origen_nombre, ...
--          m.user_id  -- asegurarse que está incluido
--   FROM movimientos m
--   LEFT JOIN cuentas c ON c.id = m.cuenta_origen
--   ...;

-- Si la vista saldo_actual_cuentas usa un GROUP BY sobre movimientos+cuentas,
-- agregar c.user_id al SELECT y al GROUP BY. Ejemplo genérico:
-- CREATE OR REPLACE VIEW saldo_actual_cuentas AS
--   SELECT c.*, ..., c.user_id
--   FROM cuentas c
--   ...
--   GROUP BY c.id, c.user_id, ...;

-- Nota: también habilitar RLS en las vistas si Supabase lo requiere
-- (generalmente las vistas heredan la seguridad de las tablas base).

-- ═══════════════════════════════════════════════════════════
-- Para AUTORIZAR a un usuario nuevo en el futuro:
--   UPDATE user_profiles SET authorized = true WHERE email = 'otro@email.com';
-- Para VER usuarios pendientes:
--   SELECT * FROM user_profiles WHERE authorized = false;
-- ═══════════════════════════════════════════════════════════
