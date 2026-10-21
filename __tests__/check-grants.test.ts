// ─── Guardia de los permisos de las tablas nuevas de public (2026-10-20) ─────
//
// Desde el 2026-10-30 Supabase no les da permisos de la API, solos, a las
// tablas y vistas nuevas de `public`, y en este repo nada lo mostraría antes
// de PROD (las migraciones se aplican a mano). Se prueba la lógica pura sobre
// migraciones de juguete, la guardia entera sobre un repo de juguete, y que el
// repo de hoy pasa.

import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, describe, expect, it } from 'vitest'
import {
  faltanGrants,
  grantsEnPublic,
  numeroDeMigracion,
  objetosCreadosEnPublic,
  revisarMigraciones,
} from '../scripts/lib/grants-migracion.mjs'

const GUARDIA = fileURLToPath(new URL('../scripts/check-grants.mjs', import.meta.url))

/** Corre la guardia como en el CI de un push (sin la rama de destino de un PR), o hacia `baseRef`. */
function correrGuardia(raiz?: string, baseRef?: string) {
  const env = { ...process.env }
  delete env.GITHUB_BASE_REF
  delete env.GITHUB_ACTIONS
  if (baseRef) env.GITHUB_BASE_REF = baseRef
  return spawnSync(process.execPath, raiz ? [GUARDIA, raiz] : [GUARDIA], { encoding: 'utf8', env })
}

describe('lo que una migración crea en public', () => {
  it('tablas y vistas, con o sin schema y con «if not exists»; lo temporal, lo comentado y lo de otros schemas, no', () => {
    const sql = `
      create table if not exists public.avisos (id uuid primary key);
      CREATE TABLE "public"."Notas" (id int);
      CREATE TABLE IF NOT EXISTS sueltas (id int);
      CREATE OR REPLACE VIEW resumen
      WITH (security_invoker = true) AS select 1;
      create materialized view public.totales as select 1;
      create temp table borrador (x int);
      create table storage.otra (id int);
      -- create table public.comentada (id int);
      /* create table public.en_bloque (id int); */
    `
    expect(objetosCreadosEnPublic(sql).map((o) => `${o.tipo} ${o.nombre}`)).toEqual([
      'table avisos',
      'table notas',
      'table sueltas',
      'view resumen',
      'materialized view totales',
    ])
  })

  it('un «/*» dentro de un «--» (un camino como scripts/*.mjs) no abre un comentario: la tabla de abajo se ve', () => {
    const sql = '-- ver scripts/*.mjs\ncreate table public.x (id int);\n/* nota */'
    expect(objetosCreadosEnPublic(sql).map((o) => o.nombre)).toEqual(['x'])
  })

  it('«--» y «/*» dentro de un texto entre comillas no son comentarios: la tabla de abajo se ve', () => {
    const sql = "comment on table public.y is 'a -- b /* c';\ncreate table public.z (id int);"
    expect(objetosCreadosEnPublic(sql).map((o) => o.nombre)).toEqual(['z'])
  })

  it('un comentario de bloque anidado (como en Postgres) tapa todo lo de adentro, un create table incluido', () => {
    const sql = '/* afuera /* adentro */ create table public.oculta (id int); */\ncreate table public.visible (id int);'
    expect(objetosCreadosEnPublic(sql).map((o) => o.nombre)).toEqual(['visible'])
  })

  it('los grants: por tabla, varias juntas, «on all tables in schema public»; los de secuencias y funciones no cuentan', () => {
    const { porTabla, todas } = grantsEnPublic(`
      grant select, insert, update, delete on public.a, public.b to authenticated, service_role;
      grant select on table public.c to service_role;
      grant usage, select on sequence public.a_id_seq to authenticated;
      GRANT  EXECUTE ON FUNCTION public.f(UUID, TEXT) TO service_role;
      grant select on all tables in schema public to anon;
    `)
    expect([...porTabla.get('a')!].sort()).toEqual(['authenticated', 'service_role'])
    expect([...porTabla.get('b')!].sort()).toEqual(['authenticated', 'service_role'])
    expect([...porTabla.get('c')!]).toEqual(['service_role'])
    expect(porTabla.has('a_id_seq')).toBe(false)
    expect(porTabla.has('f')).toBe(false)
    expect([...todas]).toEqual(['anon'])
  })
})

describe('lo que le falta a cada tabla nueva', () => {
  it('sin grants, le faltan los dos roles; con los dos, nada', () => {
    expect(faltanGrants('create table public.x (id int);')).toEqual([
      { nombre: 'x', tipo: 'table', faltan: ['authenticated', 'service_role'] },
    ])
    expect(faltanGrants('create table public.x (id int);\ngrant select, insert on public.x to authenticated, service_role;')).toEqual([])
  })

  it('con uno solo, falta el otro; «on all tables in schema public» y «to public» cuentan', () => {
    expect(faltanGrants('create table public.x (id int); grant all on public.x to service_role;')).toEqual([
      { nombre: 'x', tipo: 'table', faltan: ['authenticated'] },
    ])
    expect(faltanGrants('create table public.x (id int); grant all on all tables in schema public to authenticated, service_role;')).toEqual([])
    expect(faltanGrants('create table public.x (id int); grant select on public.x to public;')).toEqual([])
  })

  it('la que sólo usa el servidor, con service_role le alcanza', () => {
    const sql = 'create table public.log_x (id int); grant all on public.log_x to service_role;'
    expect(faltanGrants(sql, new Set(['log_x']))).toEqual([])
    expect(faltanGrants('create table public.log_x (id int);', new Set(['log_x']))).toEqual([
      { nombre: 'log_x', tipo: 'table', faltan: ['service_role'] },
    ])
  })

  it('lo comentado no cuenta como grant', () => {
    expect(faltanGrants('create table public.x (id int);\n-- grant all on public.x to authenticated, service_role;')).toHaveLength(1)
  })
})

describe('qué migraciones mira y cuándo frena', () => {
  const sinGrant = 'create table public.x (id int);'
  const conGrant = `${sinGrant}\ngrant select, insert, update, delete on public.x to authenticated, service_role;`
  const opciones = {
    desde: 20261021,
    sueltosDeAntes: new Set(['docs/migration-vieja.sql']),
    pendientesDeProd: new Set(['supabase/migrations/20261001_pendiente.sql']),
  }

  it('el número sale de la fecha del nombre; un .sql suelto no tiene', () => {
    expect(numeroDeMigracion('supabase/migrations/20261021_algo.sql')).toBe(20261021)
    expect(numeroDeMigracion('20260904_factura_plantillas.sql')).toBe(20260904)
    expect(numeroDeMigracion('docs/migration-algo.sql')).toBeNaN()
  })

  it('las de antes de la 20261021 y los sueltos de antes no las mira; las nuevas, los sueltos nuevos y las pendientes, sí', () => {
    const r = revisarMigraciones(
      [
        { nombre: 'supabase/migrations/20260904_vieja.sql', sql: sinGrant },
        { nombre: 'docs/migration-vieja.sql', sql: sinGrant },
        { nombre: 'supabase/migrations/20261001_pendiente.sql', sql: conGrant },
        { nombre: 'supabase/migrations/20261021_nueva.sql', sql: conGrant },
        { nombre: 'docs/migration-nueva.sql', sql: conGrant },
      ],
      opciones
    )
    expect(r).toEqual({ problemas: [], avisos: [], miradas: 3 })
  })

  it('una nueva sin grant frena siempre, numerada o suelta', () => {
    const r = revisarMigraciones(
      [
        { nombre: 'supabase/migrations/20261021_nueva.sql', sql: sinGrant },
        { nombre: 'sql/otra_nueva.sql', sql: sinGrant },
      ],
      opciones
    )
    expect(r.problemas.map((p) => p.archivo)).toEqual(['supabase/migrations/20261021_nueva.sql', 'sql/otra_nueva.sql'])
    expect(r.avisos).toEqual([])
  })

  it('una pendiente de PROD sin grant: en un push avisa, en el PR a main frena', () => {
    const migraciones = [{ nombre: 'supabase/migrations/20261001_pendiente.sql', sql: sinGrant }]
    const enPush = revisarMigraciones(migraciones, opciones)
    expect(enPush.problemas).toEqual([])
    expect(enPush.avisos).toEqual([
      { archivo: 'supabase/migrations/20261001_pendiente.sql', nombre: 'x', tipo: 'table', faltan: ['authenticated', 'service_role'] },
    ])
    const haciaMain = revisarMigraciones(migraciones, { ...opciones, haciaProd: true })
    expect(haciaMain.problemas.map((p) => p.archivo)).toEqual(['supabase/migrations/20261001_pendiente.sql'])
    expect(haciaMain.avisos).toEqual([])
  })
})

describe('la guardia entera, sobre un repo de juguete', () => {
  const raices: string[] = []
  afterAll(() => {
    for (const r of raices) rmSync(r, { recursive: true, force: true })
  })

  /** Un repo con esos archivos: { 'supabase/migrations/2026…_x.sql': 'sql…' }. */
  function repoDeJuguete(archivos: Record<string, string>) {
    const raiz = mkdtempSync(join(tmpdir(), 'check-grants-'))
    raices.push(raiz)
    for (const [ruta, sql] of Object.entries(archivos)) {
      mkdirSync(dirname(join(raiz, ruta)), { recursive: true })
      writeFileSync(join(raiz, ruta), sql)
    }
    return raiz
  }

  it('una migración nueva con su tabla sin grant frena y dice cuál y cómo arreglarlo', () => {
    const r = correrGuardia(repoDeJuguete({ 'supabase/migrations/20261101_notas.sql': 'create table public.notas (id uuid primary key);' }))
    expect(r.status).toBe(1)
    expect(r.stderr).toContain('supabase/migrations/20261101_notas.sql: table public.notas — le falta grant a authenticated y service_role')
    expect(r.stderr).toContain('grant select, insert, update, delete on public.<tabla> to authenticated, service_role;')
  })

  it('un .sql suelto nuevo en docs/ también se mira', () => {
    const r = correrGuardia(repoDeJuguete({ 'docs/migration-notas.sql': 'create table notas (id uuid primary key);' }))
    expect(r.status).toBe(1)
    expect(r.stderr).toContain('docs/migration-notas.sql: table public.notas')
  })

  it('con el grant pasa; y una de antes de la 20261021 sin grant no se mira', () => {
    const r = correrGuardia(
      repoDeJuguete({
        'supabase/migrations/20260904_vieja.sql': 'create table public.vieja (id int);',
        'supabase/migrations/20261101_notas.sql':
          'create table public.notas (id int);\ngrant select, insert, update, delete on public.notas to authenticated, service_role;',
      })
    )
    expect(r.status, r.stderr).toBe(0)
    expect(r.stdout).toMatch(/^check-grants: limpio \(1 migracion mirada/)
  })
})

describe('el repo de hoy', () => {
  it('pasa la guardia, en un push y en el PR a main', () => {
    for (const baseRef of [undefined, 'main']) {
      const r = correrGuardia(undefined, baseRef)
      expect(r.status, r.stderr).toBe(0)
      expect(r.stdout).toMatch(/^check-grants: limpio/)
    }
  })
})
