-- ─── Monotributo (Argentina) ─────────────────────────────────────────────────
-- Módulo personal para llevar control del régimen monotributo:
--   - Cargar facturas emitidas (manual, no integramos ARCA por ahora)
--   - Trackear facturación acumulada vs límite de categoría
--   - Costo mensual esperado (ajuste manual semestral)
--
-- Diseño minimalista a propósito: el user actualiza la categoría/costos
-- a mano cada semestre cuando ARCA actualiza valores. No hardcodeamos
-- categorías en el schema porque eso pisaría el valor manual.
--
-- gasto_fijo_id: link opcional al gasto fijo que representa el pago mensual
-- del monotributo (que el user ya tiene cargado en gastos_fijos). Permite
-- mostrar info del próximo vencimiento en la página del monotributo.

-- ─── 1) Config personal (1 fila por user) ────────────────────────────────────
CREATE TABLE IF NOT EXISTS monotributo_config (
  user_id                     UUID         PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Régimen actual
  categoria                   TEXT         NOT NULL,                       -- 'A' | 'B' | 'C' | ...
  actividad                   TEXT         NOT NULL DEFAULT 'servicios',   -- 'servicios' | 'venta_bienes'
  limite_facturacion_anual    NUMERIC      NOT NULL,                       -- $ techo anual de la categoría
  costo_mensual               NUMERIC      NOT NULL,                       -- impuesto + jubilación + obra social
  vigente_desde               DATE         NOT NULL DEFAULT CURRENT_DATE,  -- inicio del semestre activo

  -- Link opcional al gasto fijo del monotributo (para mostrar próximo venc.).
  -- gastos_fijos.id es text en esta DB (legacy), no uuid — por eso text acá.
  gasto_fijo_id               TEXT         REFERENCES gastos_fijos(id) ON DELETE SET NULL,

  -- Notas libres del user (ej. "Cambié a cat C en julio 2026")
  notas                       TEXT,

  created_at                  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at                  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- ─── 2) Facturas emitidas ────────────────────────────────────────────────────
-- Carga manual. Las facturas no se vinculan automáticamente a movimientos
-- (decisión explícita para mantener Fase 1 simple) — viven en paralelo.
CREATE TABLE IF NOT EXISTS facturas_emitidas (
  id                  UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID         NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  fecha               DATE         NOT NULL,
  cliente             TEXT         NOT NULL,
  concepto            TEXT,
  monto               NUMERIC      NOT NULL CHECK (monto > 0),
  numero_comprobante  TEXT,                                        -- ej. "00001-00000123"
  tipo_comprobante    TEXT         DEFAULT 'C',                    -- 'C' (monotributo) | 'A' | 'B' | otro
  notas               TEXT,

  created_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_facturas_user_fecha
  ON facturas_emitidas (user_id, fecha DESC);

-- ─── 3) Trigger updated_at en config ────────────────────────────────────────
CREATE TRIGGER set_monotributo_config_updated_at
  BEFORE UPDATE ON monotributo_config
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ─── 4) RLS ──────────────────────────────────────────────────────────────────
ALTER TABLE monotributo_config  ENABLE ROW LEVEL SECURITY;
ALTER TABLE facturas_emitidas   ENABLE ROW LEVEL SECURITY;

CREATE POLICY "monotributo_config_owner_all"
  ON monotributo_config
  FOR ALL
  USING      (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "facturas_emitidas_owner_all"
  ON facturas_emitidas
  FOR ALL
  USING      (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
