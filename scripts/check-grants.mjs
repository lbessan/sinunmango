// ─── Guardia de los permisos de las tablas nuevas de `public` (2026-10-20) ───
//
// LA REGLA: una migración que crea una tabla o una vista en `public` le da sus
// permisos de la API ahí mismo, además de la RLS de siempre:
//
//   grant select, insert, update, delete on public.mi_tabla to authenticated, service_role;
//
// (a una vista le alcanza con `select`). `anon` no se da: la app lee y escribe
// con la sesión del usuario o con el servidor (service role); la clave pública
// sin sesión sólo hace el login. Si algún día una tabla se lee SIN sesión,
// lleva además `grant select on public.mi_tabla to anon;` y su policy para anon.
//
// POR QUÉ: desde el 2026-10-30 Supabase deja de darles permisos solos a las
// tablas y vistas nuevas de `public`. Hasta hoy, TODAS las tablas de esta app
// dependían de esos permisos automáticos: una tabla nueva sin grant da
// «permission denied» en PROD, hasta para el servidor (service_role saltea la
// RLS, no los grants). Las migraciones se aplican a mano en el SQL Editor y no
// hay ninguna base de prueba que lo muestre antes: esto lo frena en el CI.
//
// Qué mira:
//   - supabase/migrations/AAAAMMDD_descripcion.sql, desde la DESDE en adelante
//     (hasta la 20261020 todo se creó con los permisos automáticos, que PROD
//     conserva; la 20261020 los deja escritos para lo que se arme desde cero);
//   - los .sql sueltos de docs/ y sql/ (la convención vieja, docs/README.md)
//     que no estaban el 2026-10-20: uno nuevo se mira siempre;
//   - PENDIENTES_DE_PROD: las de antes que todavía no están en PROD (frenan en
//     el PR a main; en las otras corridas sólo avisan).
// Una tabla que sólo usa el servidor va a SOLO_SERVIDOR, con su porqué.
//
// Uso: node scripts/check-grants.mjs [raíz del repo]   (sin argumento, este repo)
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { revisarMigraciones, ROLES_NECESARIOS } from './lib/grants-migracion.mjs'

/** Desde qué migración rige: la primera que se escriba después del aviso de Supabase (se numeran por fecha). */
const DESDE = 20261021

/** La cadena de hoy: un archivo por cambio, numerado por la fecha en que se escribió. */
const DIR_MIGRACIONES = 'supabase/migrations'

/** Donde vivían las migraciones antes (y algunos scripts): un .sql nuevo acá también se mira. */
const DIRS_SUELTOS = ['docs', 'sql']

/** Los .sql sueltos que ya estaban el 2026-10-20: se aplicaron con los permisos automáticos, que PROD conserva. */
const SUELTOS_DE_ANTES = new Set([
  'docs/fix-cuotas-huerfanas.sql',
  'docs/migration-account-shares.sql',
  'docs/migration-bancos-custom-tipo.sql',
  'docs/migration-billetera-banco-split.sql',
  'docs/migration-deuda-tarjetas-descuentos.sql',
  'docs/migration-drop-google-billing-columns.sql',
  'docs/migration-fix-user-fk-cascade.sql',
  'docs/migration-gastos-cashflow.sql',
  'docs/migration-grupo-cuotas-en-vista.sql',
  'docs/migration-grupo-cuotas.sql',
  'docs/migration-mercadopago-billing.sql',
  'docs/migration-onboarding-completed.sql',
  'docs/migration-rate-limit.sql',
  'docs/migration-resumen-password.sql',
  'docs/migration-rls-policies.sql',
  'docs/migration-seed-categorias-en-trigger.sql',
  'docs/migration-shares-v2.sql',
  'docs/migration-soft-delete-users.sql',
  'docs/migration-tarjetas-adicionales.sql',
  'docs/migration-timezone-views.sql',
  'docs/migration-usage-admin-atomic.sql',
  'docs/migration-usage-monthly.sql',
  'docs/schema-snapshot.sql',
  'docs/subscription-migration.sql',
  'docs/user-preferences-migration.sql',
  'sql/add_email_inbound_token.sql',
])

/**
 * Migraciones de antes de la DESDE que al 2026-10-20 NO están en PROD. Ninguna:
 * no hay ramas sin mergear con migraciones que main no tenga. Si alguna queda
 * escrita sin aplicar y va a PROD después del 30/10, sumarla acá (y sacarla
 * cuando esté en PROD).
 */
const PENDIENTES_DE_PROD = new Set([])

/** Tablas o vistas que sólo usa el servidor (service role): { 'tabla': 'por qué' }. */
const SOLO_SERVIDOR = new Map([
  // ['mi_tabla', 'la escribe y la lee sólo el cron X con adminClient'],
])

/** El PR a la rama de producción (main): ahí lo pendiente también frena. */
const HACIA_PROD = process.env.GITHUB_BASE_REF === 'main'

const RAIZ = process.argv[2] ? resolve(process.argv[2]) : fileURLToPath(new URL('..', import.meta.url))

/** Los .sql de una carpeta del repo (sin subcarpetas), como { nombre: 'carpeta/archivo.sql', sql }. */
function leerSql(dir) {
  const ruta = join(RAIZ, dir)
  if (!existsSync(ruta)) return []
  return readdirSync(ruta, { withFileTypes: true })
    .filter((e) => e.isFile() && e.name.endsWith('.sql'))
    .map((e) => e.name)
    .sort()
    .map((f) => ({ nombre: `${dir}/${f}`, sql: readFileSync(join(ruta, f), 'utf8') }))
}

const migraciones = [DIR_MIGRACIONES, ...DIRS_SUELTOS].flatMap(leerSql)

const { problemas, avisos, miradas } = revisarMigraciones(migraciones, {
  desde: DESDE,
  sueltosDeAntes: SUELTOS_DE_ANTES,
  pendientesDeProd: PENDIENTES_DE_PROD,
  soloServidor: new Set(SOLO_SERVIDOR.keys()),
  haciaProd: HACIA_PROD,
})

const renglon = (p) => `${p.archivo}: ${p.tipo} public.${p.nombre} — le falta grant a ${p.faltan.join(' y ')}`
const comoArreglarlo = [
  'Agregá en la misma migración (a una vista le alcanza con select):',
  `  grant select, insert, update, delete on public.<tabla> to ${ROLES_NECESARIOS.join(', ')};`,
  'Si la app la lee SIN sesión (con la clave pública, sin login), además: grant select on public.<tabla> to anon; y su policy para anon.',
  'Si sólo la usa el servidor (service role), sumala a SOLO_SERVIDOR en scripts/check-grants.mjs con su porqué.',
].join('\n')

for (const p of avisos) {
  const texto = `${renglon(p)} (todavía no está en PROD: cuando vaya, va a ser después del 30/10; en el PR a main frena)`
  // En el CI, como anotación de GitHub: se ve en la corrida sin dejarla roja.
  console.error(process.env.GITHUB_ACTIONS === 'true' ? `::warning title=check-grants::${texto}` : `aviso: ${texto}`)
}

if (problemas.length) {
  console.error('check-grants: tablas o vistas nuevas en public sin sus permisos (desde el 30/10 Supabase no los da solos):\n')
  for (const p of problemas) console.error(`  ${renglon(p)}`)
  console.error(`\n${comoArreglarlo}`)
  process.exit(1)
}

const cuantas = `${miradas} migracion${miradas === 1 ? '' : 'es'} mirada${miradas === 1 ? '' : 's'}: las de ${DIR_MIGRACIONES} desde la ${DESDE}, los .sql sueltos nuevos y las que faltan en PROD`
console.log(
  avisos.length
    ? `check-grants: limpio, con ${avisos.length} aviso${avisos.length === 1 ? '' : 's'} (${cuantas}).`
    : `check-grants: limpio (${cuantas}).`
)
