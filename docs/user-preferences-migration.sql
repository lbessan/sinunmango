-- ─── user_preferences ──────────────────────────────────────────────────────
-- Preferencias de notificaciones y configuración por usuario.
-- Ejecutar en Supabase → SQL Editor.

create table if not exists user_preferences (
  id            uuid default gen_random_uuid() primary key,
  user_id       uuid references auth.users not null unique,

  -- Alertas de vencimientos de gastos fijos
  alerta_vencimientos_activa  boolean  default true,
  -- Array de días de anticipación: 0=día del vencimiento, 1=1 día antes, 3=3 días antes
  alerta_vencimientos_dias    int[]    default array[0, 1, 3],

  -- Resumen semanal (se envía los lunes)
  alerta_resumen_semanal      boolean  default false,

  -- Resumen mensual (se envía el 1° de cada mes)
  alerta_resumen_mensual      boolean  default false,

  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

-- Trigger para updated_at automático
create or replace function update_updated_at_column()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_user_preferences_updated_at on user_preferences;
create trigger set_user_preferences_updated_at
  before update on user_preferences
  for each row execute function update_updated_at_column();

-- RLS
alter table user_preferences enable row level security;

drop policy if exists "user_preferences: select own" on user_preferences;
create policy "user_preferences: select own" on user_preferences
  for select using (auth.uid() = user_id);

drop policy if exists "user_preferences: insert own" on user_preferences;
create policy "user_preferences: insert own" on user_preferences
  for insert with check (auth.uid() = user_id);

drop policy if exists "user_preferences: update own" on user_preferences;
create policy "user_preferences: update own" on user_preferences
  for update using (auth.uid() = user_id);

-- Service role (para el cron) puede leer todas las preferencias
drop policy if exists "user_preferences: service role select all" on user_preferences;
create policy "user_preferences: service role select all" on user_preferences
  for select using (true);
