-- ─── AFIP: cache del Ticket de Acceso (TA) de WSAA ───────────────────────────
--
-- El login WSAA devuelve un TA (token+sign) válido ~12h, y AFIP NO re-emite
-- mientras siga vigente. Lo cacheamos por servicio para no re-loguear en cada
-- consulta. token/sign van encriptados (AES-256-GCM, lib/crypto.ts).
--
-- Forma: { "<servicio>": { "t": "<token cifrado>", "s": "<sign cifrado>", "expira": "<iso>" } }

alter table public.afip_conexion add column if not exists ta_cache jsonb;
