-- ─── Conexión AFIP/ARCA por usuario ─────────────────────────────────────────
-- Guarda el certificado digital del usuario (encriptado) para consultar sus
-- datos de monotributo (categoría, facturación) por web services, sin manejar
-- nunca su clave fiscal.
--
--   key_cipher  = clave privada (PEM) encriptada (AES-256-GCM, lib/crypto.ts)
--   cert_cipher = certificado (PEM) que devuelve AFIP, encriptado
--   estado      = pendiente (generó CSR) → conectado (subió el cert) / error

create table if not exists public.afip_conexion (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users(id) on delete cascade,
  cuit           text not null,
  alias          text,
  ambiente       text not null default 'produccion'  check (ambiente in ('produccion','homologacion')),
  estado         text not null default 'pendiente'   check (estado   in ('pendiente','conectado','error')),
  key_cipher     text,
  cert_cipher    text,
  cert_not_after timestamptz,
  ultima_sync    timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (user_id)
);

alter table public.afip_conexion enable row level security;

create policy "afip_conexion propia - select" on public.afip_conexion
  for select using (auth.uid() = user_id);
create policy "afip_conexion propia - insert" on public.afip_conexion
  for insert with check (auth.uid() = user_id);
create policy "afip_conexion propia - update" on public.afip_conexion
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "afip_conexion propia - delete" on public.afip_conexion
  for delete using (auth.uid() = user_id);
