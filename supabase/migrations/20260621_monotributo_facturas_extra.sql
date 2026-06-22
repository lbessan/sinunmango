-- ─── Monotributo: campos extra en facturas_emitidas ──────────────────────────
-- Suma datos que extraemos del PDF de la factura (Factura A/B/C de AFIP):
--   - cae + cae_vencimiento: el CAE es el identificador único que AFIP asigna
--     a cada comprobante. Lo usamos para DEDUP — no cargar la misma factura
--     dos veces aunque la importes de nuevo.
--   - cliente_cuit: CUIT del cliente facturado
--   - periodo_desde/hasta: período de servicio facturado (distinto de la fecha
--     de emisión — una factura de junio puede facturar servicios de mayo)
--   - punto_venta: el PV de AFIP (ej. "00001"), separado del número
--
-- Todos nullable: las facturas cargadas a mano (sin PDF) no los necesitan.

ALTER TABLE facturas_emitidas
  ADD COLUMN IF NOT EXISTS cae             TEXT,
  ADD COLUMN IF NOT EXISTS cae_vencimiento DATE,
  ADD COLUMN IF NOT EXISTS cliente_cuit    TEXT,
  ADD COLUMN IF NOT EXISTS periodo_desde   DATE,
  ADD COLUMN IF NOT EXISTS periodo_hasta   DATE,
  ADD COLUMN IF NOT EXISTS punto_venta     TEXT;

-- Dedup por CAE: dos facturas del mismo user no pueden compartir CAE.
-- Partial index (WHERE cae IS NOT NULL) para no chocar entre las cargadas
-- a mano que tienen cae = null.
CREATE UNIQUE INDEX IF NOT EXISTS idx_facturas_user_cae
  ON facturas_emitidas (user_id, cae)
  WHERE cae IS NOT NULL;
