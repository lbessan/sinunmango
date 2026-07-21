-- ─── AFIP: sincronización por clave fiscal (automation monotributo-info) ──────
--
-- Complementa afip_conexion (diseñada para el certificado) con el camino de
-- CLAVE FISCAL vía Afip SDK: se loguea en ARCA con CUIT + clave y trae en una
-- sola consulta categoría, facturación acumulada, tope de la categoría y cuota.
-- Reemplaza la carga manual del monotributo.
--
--   metodo       = 'certificado' (viejo, WSAA) | 'clave_fiscal' (automation)
--   clave_cipher = clave fiscal encriptada (AES-256-GCM, lib/crypto.ts). Solo
--                  se guarda si el usuario opta por sync automática; nunca sale
--                  al cliente. NULL = no la recordamos (sync manual cada vez).
--   sync_job_id  = id del job de Afip SDK en curso (para pollear el resultado)
--   sync_data    = último snapshot normalizado { categoria, facturado, ... }
--   sync_error   = mensaje del último error de sync (NULL si ok)

alter table public.afip_conexion
  add column if not exists metodo       text not null default 'certificado';

do $$ begin
  alter table public.afip_conexion
    add constraint afip_conexion_metodo_check check (metodo in ('certificado','clave_fiscal'));
exception when duplicate_object then null; end $$;

alter table public.afip_conexion add column if not exists clave_cipher text;
alter table public.afip_conexion add column if not exists sync_job_id  text;
alter table public.afip_conexion add column if not exists sync_data    jsonb;
alter table public.afip_conexion add column if not exists sync_error   text;
