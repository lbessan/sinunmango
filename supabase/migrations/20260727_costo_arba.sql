-- ─── Monotributo: costo real = escala + adherentes de obra social + ARBA ─────
--
-- costo_mensual (escala de AFIP) es solo el monotributo nacional del titular.
-- El costo real suma: adherentes de obra social (la escala trae solo el titular)
-- + Ingresos Brutos de ARBA (para los de Provincia de Buenos Aires).
--
--   obra_social_unit       = aporte de obra social por persona (de la escala AFIP)
--   obra_social_adherentes = adherentes EXTRA (además del titular). Lo pone el user.
--   arba_mensual           = cuota fija de IIBB de ARBA. Lo pone el user (ARBA no
--                            publica la tabla vigente de forma parseable).

alter table public.monotributo_config add column if not exists obra_social_unit       numeric  not null default 0;
alter table public.monotributo_config add column if not exists obra_social_adherentes integer  not null default 0;
alter table public.monotributo_config add column if not exists arba_mensual           numeric  not null default 0;
