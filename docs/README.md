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

## Reglas

- **Cada migración es idempotente.** Si la corrés de nuevo, no rompe nada (usa `IF NOT EXISTS`, `DROP POLICY IF EXISTS`, etc).
- **No borrar archivos aplicados.** Son el historial de cómo se construyó la DB. Si querés un cleanup más agresivo, primero verificá que el contenido esté capturado en otro lugar (ej. dumps).
- **Nuevas migraciones:** seguir el patrón `migration-<descripcion>.sql`, agregar entrada acá al README.

## Archivos eliminados (referencia histórica)

- `rls.sql` y `migration-multiuser.sql` — versiones viejas del setup de RLS y modelo multiuser. Quedaron obsoletas tras refactorizar a las policies "own" y sacar el allowlist (`authorized`). Reemplazadas por `migration-rls-policies.sql`.
- `security-fixes.sql` — cambiaba views a `security_invoker`. Redundante: ya está en `migration-rls-policies.sql`.
