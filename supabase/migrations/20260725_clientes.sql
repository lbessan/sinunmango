-- ─── Libreta de clientes ─────────────────────────────────────────────────────
-- Clientes del monotributista, para elegirlos al emitir (y que el resumen "por
-- cliente" tenga nombres reales). El nombre se puede autocompletar desde el
-- padrón de AFIP a partir del CUIT (razón social / apellido+nombre).
--
--   doc_tipo/doc_nro: 80 CUIT, 96 DNI, 86 CUIL. NULL si todavía no lo sabemos
--   (ej. clientes sembrados desde facturas viejas, que solo tienen el nombre).

create table if not exists public.clientes (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  nombre     text not null,
  doc_tipo   integer,
  doc_nro    text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, nombre)
);

alter table public.clientes enable row level security;

create policy "clientes propios" on public.clientes
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
