-- ─── Tabla inversiones ────────────────────────────────────────────────────────
-- Soporta: plazo_fijo | plazo_fijo_uva | fci | cedear | accion | bono | on | crypto | dolar | otro
-- Campos comunes como columnas top-level; campos específicos por tipo en JSONB.

CREATE TABLE IF NOT EXISTS inversiones (
  id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id              UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Clasificación
  tipo                 TEXT        NOT NULL,      -- 'plazo_fijo' | 'plazo_fijo_uva' | 'fci' | 'cedear' | 'accion' | 'bono' | 'on' | 'crypto' | 'dolar' | 'otro'
  nombre               TEXT,                      -- Label libre: "PF Galicia junio", "AAPL x50"

  -- Fechas
  fecha_inicio         DATE        NOT NULL DEFAULT CURRENT_DATE,
  fecha_vencimiento    DATE,

  -- Dinero
  moneda               TEXT        NOT NULL DEFAULT 'ARS', -- 'ARS' | 'USD'
  capital_inicial      NUMERIC     NOT NULL DEFAULT 0,     -- Lo que se invirtió
  valor_actual         NUMERIC,                            -- Se actualiza manualmente

  -- Estado
  estado               TEXT        NOT NULL DEFAULT 'activo', -- 'activo' | 'vencido' | 'liquidado'

  -- Campos específicos por tipo (JSONB)
  -- Plazo fijo:      { banco, tna, plazo_dias, tipo_pf: 'tradicional'|'uva', valor_uva_inicio, tna_spread }
  -- FCI:             { nombre_fondo, administradora, tipo_fci, cuotapartes, precio_compra, precio_actual }
  -- Dólar físico:    { cotizacion_compra, tipo_cotizacion: 'blue'|'mep'|'oficial'|'ccl', ubicacion }
  -- CEDEARs:         { ticker, ratio, cantidad, precio_compra_ars, broker, dividendos_cobrados }
  -- Crypto:          { moneda_cripto, exchange, cantidad, precio_compra_usd, cotizacion_compra_ars, tipo_crypto, yield_anual_pct }
  -- Acciones Merval: { ticker, cantidad, precio_compra_ars, broker, dividendos_cobrados }
  -- Bonos/ONs:       { ticker, emisor, cantidad_vn, precio_compra_pct, tir_compra, cupones_cobrados_usd, legislacion }
  datos                JSONB       NOT NULL DEFAULT '{}',

  -- Link al movimiento de salida de efectivo (auto-generado al crear)
  movimiento_origen_id TEXT        REFERENCES movimientos(id) ON DELETE SET NULL,

  notas                TEXT,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Índices
CREATE INDEX IF NOT EXISTS inversiones_user_id_idx    ON inversiones(user_id);
CREATE INDEX IF NOT EXISTS inversiones_estado_idx     ON inversiones(user_id, estado);
CREATE INDEX IF NOT EXISTS inversiones_vencimiento_idx ON inversiones(fecha_vencimiento) WHERE fecha_vencimiento IS NOT NULL;

-- Trigger updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS inversiones_updated_at ON inversiones;
CREATE TRIGGER inversiones_updated_at
  BEFORE UPDATE ON inversiones
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- RLS
ALTER TABLE inversiones ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "inversiones_own_data" ON inversiones;
CREATE POLICY "inversiones_own_data" ON inversiones
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "inversiones_service_role" ON inversiones;
CREATE POLICY "inversiones_service_role" ON inversiones
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);
