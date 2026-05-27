import { NextRequest, NextResponse } from 'next/server'
import { createClientForRequest } from '@/lib/supabase/route'
import { validateEnum, validateId, type Validated } from '@/lib/validators'

// ─── /api/shares/[id] ────────────────────────────────────────────────────────
//
// DELETE: owner revoca el share (set revoked_at).
// PATCH:  owner edita resources / role.
//   Body: { role?, resources?: { cuentas, gastos_fijos, inversiones } }
//   Si se manda resources, REEMPLAZA toda la lista (delete + insert).

const ROLES = ['viewer', 'editor'] as const

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { supabase, user } = await createClientForRequest(req)
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const { id } = await params

  // El owner puede revocar (cortar el acceso del invitee) y el invitee
  // puede "dejar el workspace" (cortar su propio acceso). Ambos terminan
  // en la misma acción: setear revoked_at. RLS expone la fila al owner
  // (vía owner_user_id) y al invitee (vía invitee_user_id). Filtramos
  // por OR de los dos para que el update aplique solo a shares donde el
  // user actual es una de las dos partes.
  const { data: updated, error } = await supabase
    .from('shares')
    .update({ revoked_at: new Date().toISOString() })
    .eq('id', id)
    .or(`owner_user_id.eq.${user.id},invitee_user_id.eq.${user.id}`)
    .select('id, revoked_at')

  if (error) {
    console.error('[shares/delete] error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  if (!updated || updated.length === 0) {
    return NextResponse.json({ error: 'Share no encontrado' }, { status: 404 })
  }
  return NextResponse.json({ ok: true, revoked_at: updated[0].revoked_at })
}

type PatchBody = {
  role?:      typeof ROLES[number]
  resources?: {
    cuentas:      string[]
    gastos_fijos: string[]
    inversiones:  string[]
  }
}

function validatePatchBody(raw: unknown): Validated<PatchBody> {
  if (typeof raw !== 'object' || raw === null) return { ok: false, error: 'Body inválido' }
  const b = raw as Record<string, unknown>
  const out: PatchBody = {}

  if (b.role !== undefined) {
    const r = validateEnum(b.role, ROLES, 'role')
    if (!r.ok) return r
    out.role = r.data
  }

  if (b.resources !== undefined) {
    if (typeof b.resources !== 'object' || b.resources === null) {
      return { ok: false, error: 'resources debe ser objeto' }
    }
    const r = b.resources as Record<string, unknown>
    function vList(v: unknown, field: string): Validated<string[]> {
      if (v === undefined) return { ok: true, data: [] }
      if (!Array.isArray(v)) return { ok: false, error: `${field} debe ser array` }
      const list: string[] = []
      for (let i = 0; i < v.length; i++) {
        const id = validateId(v[i], `${field}[${i}]`)
        if (!id.ok) return id
        list.push(id.data)
      }
      return { ok: true, data: list }
    }
    const c = vList(r.cuentas, 'cuentas')
    if (!c.ok) return c
    const g = vList(r.gastos_fijos, 'gastos_fijos')
    if (!g.ok) return g
    const i = vList(r.inversiones, 'inversiones')
    if (!i.ok) return i

    if (c.data.length === 0 && g.data.length === 0 && i.data.length === 0) {
      return { ok: false, error: 'Al menos un recurso es requerido' }
    }

    out.resources = { cuentas: c.data, gastos_fijos: g.data, inversiones: i.data }
  }

  if (out.role === undefined && out.resources === undefined) {
    return { ok: false, error: 'Sin campos para actualizar' }
  }
  return { ok: true, data: out }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { supabase, user } = await createClientForRequest(req)
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const { id } = await params

  let body: unknown
  try { body = await req.json() } catch { return NextResponse.json({ error: 'JSON inválido' }, { status: 400 }) }

  const v = validatePatchBody(body)
  if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 })

  // Validar que el share es del owner
  const { data: existing } = await supabase
    .from('shares')
    .select('id, revoked_at')
    .eq('id', id)
    .eq('owner_user_id', user.id)
    .maybeSingle()

  if (!existing) {
    return NextResponse.json({ error: 'Share no encontrado' }, { status: 404 })
  }
  if (existing.revoked_at) {
    return NextResponse.json({ error: 'No podés editar un share revocado' }, { status: 400 })
  }

  // Update role si se mandó
  if (v.data.role) {
    const { error: roleErr } = await supabase
      .from('shares')
      .update({ role: v.data.role })
      .eq('id', id)
    if (roleErr) {
      console.error('[shares/patch] role update error:', roleErr)
      return NextResponse.json({ error: roleErr.message }, { status: 500 })
    }
  }

  // Reemplazar resources si se mandó
  if (v.data.resources) {
    // Validar ownership de TODOS los recursos
    const allChecks = await Promise.all([
      v.data.resources.cuentas.length === 0 ? null : supabase
        .from('cuentas').select('id').in('id', v.data.resources.cuentas).eq('user_id', user.id),
      v.data.resources.gastos_fijos.length === 0 ? null : supabase
        .from('gastos_fijos').select('id').in('id', v.data.resources.gastos_fijos).eq('user_id', user.id),
      v.data.resources.inversiones.length === 0 ? null : supabase
        .from('inversiones').select('id').in('id', v.data.resources.inversiones).eq('user_id', user.id),
    ])
    const [cuentasC, gfC, invC] = allChecks
    if (cuentasC && cuentasC.data && cuentasC.data.length !== v.data.resources.cuentas.length) {
      return NextResponse.json({ error: 'Alguna cuenta no es tuya' }, { status: 400 })
    }
    if (gfC && gfC.data && gfC.data.length !== v.data.resources.gastos_fijos.length) {
      return NextResponse.json({ error: 'Algún gasto fijo no es tuyo' }, { status: 400 })
    }
    if (invC && invC.data && invC.data.length !== v.data.resources.inversiones.length) {
      return NextResponse.json({ error: 'Alguna inversión no es tuya' }, { status: 400 })
    }

    // Delete all current + insert new
    await supabase.from('share_resources').delete().eq('share_id', id)

    const newRows: Array<{ share_id: string; resource_type: string; resource_id: string }> = []
    for (const cId of v.data.resources.cuentas)      newRows.push({ share_id: id, resource_type: 'cuenta',     resource_id: cId })
    for (const cId of v.data.resources.gastos_fijos) newRows.push({ share_id: id, resource_type: 'gasto_fijo', resource_id: cId })
    for (const cId of v.data.resources.inversiones)  newRows.push({ share_id: id, resource_type: 'inversion',  resource_id: cId })

    if (newRows.length > 0) {
      const { error: insErr } = await supabase.from('share_resources').insert(newRows)
      if (insErr) {
        console.error('[shares/patch] resources insert error:', insErr)
        return NextResponse.json({ error: insErr.message }, { status: 500 })
      }
    }
  }

  return NextResponse.json({ ok: true })
}
