# docs

Documentos del proyecto. Mayoritariamente migraciones SQL que se corren manualmente en Supabase → SQL Editor.

## Migraciones SQL (en orden cronológico de aplicación)

| Archivo | Qué hace | Estado |
|---|---|---|
| `user-preferences-migration.sql` | Crea la tabla `user_preferences` (notificaciones, tema, token email-inbound). | ✅ Aplicada |
| `subscription-migration.sql` | Agrega columnas de plan/suscripción a `user_profiles` para Google Play. | ✅ Aplicada |
| `migration-billetera-banco-split.sql` | Migra cuentas viejas con `tipo_cuenta = 'Billetera/Banco'` a los tipos nuevos (`Banco CA`/`Banco CC`/`Billetera`). | ✅ Aplicada |
| `migration-rls-policies.sql` | Crea las policies RLS `<tabla>_<op>_own` basadas en `auth.uid() = user_id` para todas las tablas. | ✅ Aplicada |
| `migration-grupo-cuotas.sql` | Agrega columna `grupo_cuotas UUID` a `movimientos` para linkear cuotas hermanas, con backfill por regex del detalle. | ✅ Aplicada |
| `migration-usage-admin-atomic.sql` | RPC `increment_usage_admin(user_id, feature, limit)` con check+commit atómico para webhooks (service_role). Elimina race condition que tenía el SELECT+UPSERT desde JS. | ✅ Aplicada |
| `supabase/migrations/20261020_grants_explicitos.sql` | Deja escritos los permisos de la API de todo lo que ya existe en `public` (`authenticated` y `service_role`; a `anon`, nada) para lo que se arme desde cero. Ver «Permisos de la API» abajo. | No hace falta en PROD: no cambia nada (correrla es inocuo) |

## Reglas

- **Cada migración es idempotente.** Si la corrés de nuevo, no rompe nada (usa `IF NOT EXISTS`, `DROP POLICY IF EXISTS`, etc).
- **No borrar archivos aplicados.** Son el historial de cómo se construyó la DB. Si querés un cleanup más agresivo, primero verificá que el contenido esté capturado en otro lugar (ej. dumps).
- **Nuevas migraciones:** seguir el patrón `migration-<descripcion>.sql`, agregar entrada acá al README.
- **Desde el 2026-10-30, toda tabla o vista nueva de `public` lleva sus grants en su propia migración:** `grant select, insert, update, delete on public.<tabla> to authenticated, service_role;` (a `anon`, sólo si la app la lee sin sesión, y con su policy). Supabase ya no los da solos; `scripts/check-grants.mjs` lo frena en el CI.

## Permisos de la API en `public` (2026-10-20)

**El aviso.** Supabase (mail del 2026-10-20, «new tables in "public" need grants from October 30»): desde el **2026-10-30** deja de darles permisos de la API (PostgREST / supabase-js), solos, a las tablas y vistas **nuevas** de `public`, y un proyecto armado de cero no le da permisos a nada. Las que ya existen conservan los suyos: el 30/10 no se rompe nada de lo que hay.

**Lo que nos tocaba.** Todas las tablas dependían de esos permisos automáticos: en el repo no había ni un `grant` de tabla. Sin la regla, una tabla nueva daría «permission denied» en PROD, también al servidor (service_role saltea la RLS, no los grants), y como las migraciones se aplican a mano, nada lo mostraría antes.

**Cómo quedó.**
- **La regla** (ver Reglas): cada tabla o vista nueva trae sus grants. No se reponen los permisos automáticos (`alter default privileges`): la idea del cambio es que lo nuevo no quede expuesto solo.
- **`anon` no recibe nada:** la app no lee ni escribe ninguna tabla sin sesión. El navegador usa la clave pública sólo para el login, y la página de invitación lee con el servidor.
- **La guardia** `scripts/check-grants.mjs` (lógica en `scripts/lib/grants-migracion.mjs`, test en `__tests__/check-grants.test.ts`), en el paso «Guardia de los permisos de las tablas nuevas» de `.github/workflows/test.yml`: frena si una migración de `supabase/migrations/` desde la `20261021`, o un `.sql` suelto nuevo de `docs/` o `sql/`, crea una tabla o vista en `public` sin grant a `authenticated` y a `service_role`. Lo de antes no lo mira: se creó con los permisos automáticos, que PROD conserva. Una tabla que sólo usa el servidor va a `SOLO_SERVIDOR`, con su porqué.
- **`supabase/migrations/20261020_grants_explicitos.sql`:** deja escritos los permisos de lo que ya existe, para lo que se arme desde cero (ver el paso 5 de recuperación en `schema-snapshot.sql`). En PROD no hace falta.

## Archivos eliminados (referencia histórica)

- `rls.sql` y `migration-multiuser.sql` — versiones viejas del setup de RLS y modelo multiuser. Quedaron obsoletas tras refactorizar a las policies "own" y sacar el allowlist (`authorized`). Reemplazadas por `migration-rls-policies.sql`.
- `security-fixes.sql` — cambiaba views a `security_invoker`. Redundante: ya está en `migration-rls-policies.sql`.
