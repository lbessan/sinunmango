-- ─── Facturación: detalle de ítems + condición IVA del receptor ──────────────
--
-- wsfe autoriza el TOTAL, no los ítems: guardamos el detalle acá para el PDF y
-- el registro. AFIP exige (desde 2024) la condición frente al IVA del receptor.
--
--   items         = [{ descripcion, cantidad, precio, subtotal }]
--   iva_receptor  = condición IVA del receptor (1 RI, 4 Exento, 5 CF, 6 Monotributo)
--   periodo_*/vto = período facturado y vto de pago (para servicios)

alter table public.facturas_emitidas add column if not exists items         jsonb;
alter table public.facturas_emitidas add column if not exists iva_receptor  integer;
alter table public.facturas_emitidas add column if not exists periodo_desde date;
alter table public.facturas_emitidas add column if not exists periodo_hasta date;
alter table public.facturas_emitidas add column if not exists vto_pago      date;

-- Condición frente al IVA del cliente (para autocompletar al facturar).
alter table public.clientes add column if not exists condicion_iva integer;
