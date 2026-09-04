-- ─── Plantillas de factura ───────────────────────────────────────────────────
-- Las facturas que se repiten todos los meses: mismo cliente, mismos conceptos,
-- cambian los importes (y a veces sobra o falta un ítem). En vez de re-tipear
-- todo, se guarda la plantilla y al emitir se aplica con un click.
--
-- Lo que NO se guarda es lo que cambia solo: el período facturado y el
-- vencimiento de pago se recalculan en cada emisión a partir de `periodo_modo`
-- y `dias_vto_pago` (ver lib/monotributo-plantillas.ts).
--
-- En las descripciones se pueden usar {mes} y {anio}: se reemplazan por el mes
-- y año del período facturado, así "Servicio de Desarrollo {mes} {anio}" sale
-- "Servicio de Desarrollo Agosto 2026" sin tocar la plantilla cada mes.

create table if not exists public.factura_plantillas (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users(id) on delete cascade,
  nombre         text not null,
  -- Cliente: guardamos la referencia y también los datos, para que la plantilla
  -- siga sirviendo aunque se borre el cliente de la libreta.
  cliente_id     uuid references public.clientes(id) on delete set null,
  cliente_nombre text,
  doc_tipo       integer,
  doc_nro        text,
  condicion_iva  integer,
  concepto       smallint not null default 2,           -- 1 productos, 2 servicios, 3 ambos
  pto_vta        integer,
  items          jsonb   not null default '[]'::jsonb,  -- [{descripcion, cantidad, precio}]
  periodo_modo   text    not null default 'mes_actual', -- mes_actual | mes_anterior | dia_emision
  dias_vto_pago  integer not null default 7,
  orden          integer not null default 0,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (user_id, nombre),
  constraint factura_plantillas_periodo_modo_check
    check (periodo_modo in ('mes_actual', 'mes_anterior', 'dia_emision')),
  constraint factura_plantillas_concepto_check check (concepto in (1, 2, 3)),
  constraint factura_plantillas_items_array check (jsonb_typeof(items) = 'array')
);

alter table public.factura_plantillas enable row level security;

drop policy if exists "plantillas propias" on public.factura_plantillas;
create policy "plantillas propias" on public.factura_plantillas
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create index if not exists factura_plantillas_user_orden_idx
  on public.factura_plantillas (user_id, orden, created_at);


-- ── Semilla: las 3 facturas que Lucho emite todos los meses ──────────────────
-- Sale de sus comprobantes reales 00001-00000114/115/116. Los importes son los
-- del último mes: al aplicar la plantilla se editan.
-- Acotado por CUIT, así que no toca a ningún otro usuario. Si no querés las
-- plantillas sembradas, borrá este bloque antes de correr la migración.
insert into public.factura_plantillas
  (user_id, nombre, cliente_nombre, doc_tipo, doc_nro, condicion_iva, concepto, items, periodo_modo, dias_vto_pago, orden)
select
  c.user_id, v.nombre, v.cliente_nombre, 80, v.doc_nro, 1, 2,
  v.items::jsonb, v.periodo_modo, v.dias_vto_pago, v.orden
from public.afip_conexion c
cross join (values
  (
    'Nómina Sueldos — mensual', 'NOMINA SUELDOS NET S.A', '30717901262',
    '[{"descripcion":"Honorario profesionales","cantidad":1,"precio":1728000},
      {"descripcion":"Honorario especiales","cantidad":1,"precio":1896000},
      {"descripcion":"Tiempo Libre","cantidad":1,"precio":192000}]',
    'mes_actual', 7, 1
  ),
  (
    'Nómina Sueldos — reintegro impuestos', 'NOMINA SUELDOS NET S.A', '30717901262',
    '[{"descripcion":"Impuestos Reintegro","cantidad":1,"precio":378601}]',
    'dia_emision', 4, 2
  ),
  (
    'Albor Agtech — desarrollo', 'ALBOR AGTECH S. A.', '30708825472',
    '[{"descripcion":"Servicio de Desarrollo {mes} {anio}","cantidad":1,"precio":2526566.68},
      {"descripcion":"Servicio de Desarrollo {mes} {anio}","cantidad":1,"precio":220497.19},
      {"descripcion":"Servicio de Desarrollo {mes} {anio}","cantidad":1,"precio":350858.27}]',
    'mes_anterior', 7, 3
  )
) as v(nombre, cliente_nombre, doc_nro, items, periodo_modo, dias_vto_pago, orden)
where c.cuit = '20302960497'
on conflict (user_id, nombre) do nothing;
