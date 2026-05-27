'use client'

import { useEffect, useState, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { X, Check, Copy, Trash2, Link as LinkIcon, Eye, ShieldCheck, Wallet, CreditCard, Receipt, TrendingUp } from 'lucide-react'

// ─── ShareWorkspaceModal (V2) ────────────────────────────────────────────────
//
// Modal de compartir workspace con picker granular de recursos:
//   - Por default, TODO marcado (mejor UX para el caso típico "compartir hogar").
//   - User desmarca lo que NO quiere compartir.
//   - Categorías por tipo: Cuentas, Tarjetas, Gastos fijos, Inversiones.
//
// Carga al abrir:
//   - GET /api/cuentas (con filter de tipo para separar cuentas vs tarjetas)
//   - GET /api/gastos-fijos
//   - GET /api/inversiones
//   - GET /api/shares (para listar shares activos existentes)
//
// Al generar:
//   POST /api/shares con role + resources = lo que quedó marcado.

type Resource = {
  id:        string
  nombre:    string
  subtitle?: string  // tipo, moneda, etc.
}

type ShareItem = {
  id:             string
  invite_token:   string
  role:           'viewer' | 'editor'
  invited_at:     string
  expires_at:     string
  accepted_at:    string | null
  revoked_at:     string | null
  invitee_email:  string | null
  resources:      { cuentas: string[]; gastos_fijos: string[]; inversiones: string[] }
  status:         'pending' | 'active' | 'expired' | 'revoked'
}

export function ShareWorkspaceModal({
  onClose,
  editShareId,
  onShareChanged,
}: {
  onClose: () => void
  /** Si viene, el modal entra en modo "editar" para ese share existente:
   *  pre-carga su role + recursos seleccionados, oculta la lista de
   *  otros shares y el botón cambia de "Generar link" a "Guardar". */
  editShareId?: string
  /** Callback opcional para notificar al caller que el listado cambió
   *  (creación / edición / revoke) — útil cuando la página de gestión
   *  necesita refetch. */
  onShareChanged?: () => void
}) {
  const isEditing = !!editShareId
  const [mounted, setMounted] = useState(false)
  useEffect(() => { setMounted(true) }, [])

  // Resources del owner (lo que se puede compartir)
  const [cuentas,     setCuentas]     = useState<Resource[]>([])
  const [tarjetas,    setTarjetas]    = useState<Resource[]>([])
  const [gastosFijos, setGastosFijos] = useState<Resource[]>([])
  const [inversiones, setInversiones] = useState<Resource[]>([])

  // Selección (default: todo marcado)
  const [selCuentas, setSelCuentas]     = useState<Set<string>>(new Set())
  const [selTarjetas, setSelTarjetas]   = useState<Set<string>>(new Set())
  const [selGF, setSelGF]               = useState<Set<string>>(new Set())
  const [selInv, setSelInv]             = useState<Set<string>>(new Set())

  // Otros estados
  const [role, setRole]         = useState<'viewer' | 'editor'>('editor')
  const [loading, setLoading]   = useState(true)
  const [creating, setCreating] = useState(false)
  const [newShare, setNewShare] = useState<{ url: string; role: string } | null>(null)
  const [copied, setCopied]     = useState(false)
  const [error, setError]       = useState<string | null>(null)
  const [shares, setShares]     = useState<ShareItem[]>([])

  // ─ Load all resources + shares ─
  const loadAll = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [resAll, resShares] = await Promise.all([
        fetch('/api/shareable-resources').then(r => r.ok ? r.json() : { cuentas: [], gastos_fijos: [], inversiones: [] }),
        fetch('/api/shares').then(r => r.ok ? r.json() : { shares: [] }),
      ])
      const resCuentas = resAll
      const resGF = resAll
      const resInv = resAll

      type CuentaRow = { id: string; nombre_cuenta: string; tipo_cuenta: string; moneda?: string }
      const allCuentas: CuentaRow[] = resCuentas.cuentas ?? []
      const ct = allCuentas
        .filter(c => c.tipo_cuenta !== 'Tarjeta Credito')
        .map(c => ({
          id: c.id, nombre: c.nombre_cuenta,
          subtitle: `${c.tipo_cuenta}${c.moneda ? ` · ${c.moneda}` : ''}`,
        }))
      const tj = allCuentas
        .filter(c => c.tipo_cuenta === 'Tarjeta Credito')
        .map(c => ({ id: c.id, nombre: c.nombre_cuenta, subtitle: c.moneda ?? '' }))

      type GFRow = { id: string; nombre_gasto: string; monto_estimado?: number; moneda?: string }
      const gf: Resource[] = (resGF.gastos_fijos ?? []).map((g: GFRow) => ({
        id: g.id, nombre: g.nombre_gasto,
        subtitle: g.monto_estimado ? `${g.moneda ?? '$'} ${g.monto_estimado.toLocaleString('es-AR')}` : '',
      }))

      type InvRow = { id: string; nombre?: string; tipo: string; moneda?: string }
      const inv: Resource[] = (resInv.inversiones ?? []).map((i: InvRow) => ({
        id: i.id, nombre: i.nombre ?? i.tipo,
        subtitle: `${i.tipo}${i.moneda ? ` · ${i.moneda}` : ''}`,
      }))

      setCuentas(ct)
      setTarjetas(tj)
      setGastosFijos(gf)
      setInversiones(inv)

      // Si estamos editando un share existente, pre-cargamos su selección
      // y role; sino default = TODO marcado (caso "crear nuevo").
      const allShares = (resShares.shares ?? []) as ShareItem[]
      if (isEditing) {
        const sh = allShares.find(s => s.id === editShareId)
        if (sh) {
          // Las cuentas y tarjetas viven en la misma columna `cuentas` a
          // nivel DB (tarjetas son cuentas con tipo_cuenta=Tarjeta Credito).
          // Separamos en el client para mostrar pickers distintos.
          const cuentaIds = new Set(sh.resources.cuentas)
          const tarjetaIds = new Set(tj.map(t => t.id))
          setSelCuentas(new Set([...cuentaIds].filter(id => !tarjetaIds.has(id))))
          setSelTarjetas(new Set([...cuentaIds].filter(id => tarjetaIds.has(id))))
          setSelGF(new Set(sh.resources.gastos_fijos))
          setSelInv(new Set(sh.resources.inversiones))
          setRole(sh.role)
        }
      } else {
        setSelCuentas(new Set(ct.map(c => c.id)))
        setSelTarjetas(new Set(tj.map(t => t.id)))
        setSelGF(new Set(gf.map(g => g.id)))
        setSelInv(new Set(inv.map(i => i.id)))
      }

      setShares(allShares.filter((s: ShareItem) => s.status === 'pending' || s.status === 'active'))
    } catch (err) {
      console.error('[share-modal] loadAll error:', err)
      setError('No pudimos cargar tus recursos.')
    } finally {
      setLoading(false)
    }
  }, [isEditing, editShareId])

  useEffect(() => { void loadAll() }, [loadAll])

  // ─ Toggle helpers ─
  function toggle<T>(set: Set<T>, item: T): Set<T> {
    const n = new Set(set)
    if (n.has(item)) n.delete(item)
    else n.add(item)
    return n
  }
  function toggleAll<T>(items: T[], current: Set<T>): Set<T> {
    if (current.size === items.length) return new Set()
    return new Set(items)
  }

  async function handleCreate() {
    setCreating(true)
    setError(null)
    setNewShare(null)
    setCopied(false)
    try {
      const resources = {
        cuentas:      [...selCuentas, ...selTarjetas],  // tarjetas son cuentas a nivel DB
        gastos_fijos: [...selGF],
        inversiones:  [...selInv],
      }
      if (resources.cuentas.length === 0 && resources.gastos_fijos.length === 0 && resources.inversiones.length === 0) {
        setError('Tenés que elegir al menos un recurso.')
        setCreating(false)
        return
      }
      // POST si es nuevo; PATCH si estamos editando uno existente.
      const url    = isEditing ? `/api/shares/${editShareId}` : '/api/shares'
      const method = isEditing ? 'PATCH' : 'POST'
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ role, resources }),
      })
      const data = await res.json()
      if (!res.ok) {
        if (data.error === 'requires_pro') {
          setError('Compartir workspace es feature Pro.')
        } else {
          setError(data.error ?? (isEditing ? 'No pudimos guardar los cambios.' : 'No pudimos crear el share.'))
        }
        return
      }
      // En modo crear: mostramos el link generado en pantalla.
      // En modo edición: confirmamos guardado y dejamos que el caller refresque.
      if (!isEditing && data.invite_url) {
        setNewShare({ url: data.invite_url, role: data.role })
        await loadAll()
      } else {
        onShareChanged?.()
        onClose()
      }
    } catch (err) {
      console.error('[share-modal] submit error:', err)
      setError('Error de conexión.')
    } finally {
      setCreating(false)
    }
  }

  async function handleRevoke(shareId: string) {
    if (!confirm('¿Revocar este acceso? La otra persona pierde acceso inmediatamente.')) return
    try {
      await fetch(`/api/shares/${shareId}`, { method: 'DELETE' })
      await loadAll()
    } catch (err) {
      console.error('[share-modal] revoke error:', err)
      setError('No pudimos revocar el acceso.')
    }
  }

  function copyLink(url: string) {
    void navigator.clipboard.writeText(url)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  if (!mounted) return null

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm"
         onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl max-w-2xl w-full max-h-[92vh] flex flex-col"
           onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="flex items-start justify-between p-6 border-b border-slate-100 shrink-0">
          <div>
            <h2 className="text-lg font-bold text-slate-900">
              {isEditing ? 'Editar acceso compartido' : 'Compartir workspace'}
            </h2>
            <p className="text-sm text-slate-500 mt-0.5">
              {isEditing
                ? 'Cambiá el rol o qué recursos puede ver / editar el invitado.'
                : 'Elegí qué recursos comparte el invitado. Por default todo marcado.'}
            </p>
          </div>
          <button onClick={onClose} className="p-1 text-slate-400 hover:text-slate-600"
                  aria-label="Cerrar modal">
            <X size={20} />
          </button>
        </div>

        {/* Body scrollable */}
        <div className="flex-1 overflow-y-auto px-6 py-4">

          {/* Role picker */}
          <div className="mb-5">
            <p className="text-sm font-semibold text-slate-800 mb-2">Permisos</p>
            <div className="grid grid-cols-2 gap-2">
              <label className={`p-3 rounded-xl border cursor-pointer ${
                role === 'editor' ? 'border-emerald-300 bg-emerald-50/50' : 'border-slate-200'
              }`}>
                <input type="radio" name="role" checked={role === 'editor'}
                       onChange={() => setRole('editor')} className="mr-2" />
                <span className="text-sm font-medium inline-flex items-center gap-1.5">
                  <ShieldCheck size={14} /> Colaborador
                </span>
                <p className="text-xs text-slate-500 mt-0.5">Puede cargar movimientos</p>
              </label>
              <label className={`p-3 rounded-xl border cursor-pointer ${
                role === 'viewer' ? 'border-slate-400 bg-slate-50' : 'border-slate-200'
              }`}>
                <input type="radio" name="role" checked={role === 'viewer'}
                       onChange={() => setRole('viewer')} className="mr-2" />
                <span className="text-sm font-medium inline-flex items-center gap-1.5">
                  <Eye size={14} /> Solo ver
                </span>
                <p className="text-xs text-slate-500 mt-0.5">No puede cargar nada</p>
              </label>
            </div>
          </div>

          {/* Picker de recursos */}
          {loading
            ? <p className="text-sm text-slate-400 py-8 text-center">Cargando tus recursos...</p>
            : (
              <div className="space-y-4">
                <ResourceSection
                  title="Cuentas" icon={<Wallet size={14} />}
                  items={cuentas} selected={selCuentas}
                  onToggleAll={() => setSelCuentas(toggleAll(cuentas.map(c => c.id), selCuentas))}
                  onToggle={id => setSelCuentas(toggle(selCuentas, id))}
                />
                <ResourceSection
                  title="Tarjetas" icon={<CreditCard size={14} />}
                  items={tarjetas} selected={selTarjetas}
                  onToggleAll={() => setSelTarjetas(toggleAll(tarjetas.map(c => c.id), selTarjetas))}
                  onToggle={id => setSelTarjetas(toggle(selTarjetas, id))}
                />
                <ResourceSection
                  title="Gastos fijos" icon={<Receipt size={14} />}
                  items={gastosFijos} selected={selGF}
                  onToggleAll={() => setSelGF(toggleAll(gastosFijos.map(g => g.id), selGF))}
                  onToggle={id => setSelGF(toggle(selGF, id))}
                />
                <ResourceSection
                  title="Inversiones" icon={<TrendingUp size={14} />}
                  items={inversiones} selected={selInv}
                  onToggleAll={() => setSelInv(toggleAll(inversiones.map(i => i.id), selInv))}
                  onToggle={id => setSelInv(toggle(selInv, id))}
                />
              </div>
            )
          }

          {/* New share link */}
          {newShare && (
            <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 mt-4">
              <p className="text-sm font-semibold text-emerald-900 mb-2 inline-flex items-center gap-1.5">
                <Check size={16} /> Link listo. Copiá y compartí.
              </p>
              <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-lg p-2.5">
                <LinkIcon size={14} className="text-slate-400 shrink-0" />
                <code className="text-xs text-slate-700 truncate flex-1">{newShare.url}</code>
                <button onClick={() => copyLink(newShare.url)}
                        className="px-2.5 py-1 rounded text-xs font-semibold bg-slate-900 text-white">
                  {copied ? '¡Copiado!' : <><Copy size={12} className="inline mr-1" />Copiar</>}
                </button>
              </div>
              <p className="text-xs text-emerald-700 mt-2">Expira en 7 días.</p>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-3 mt-4 text-sm text-red-700">
              {error}
            </div>
          )}

          {/* Active shares — solo en modo CREAR. En modo edición no
              mostramos los otros shares; la gestión es por share. */}
          {!isEditing && !loading && shares.length > 0 && (
            <div className="mt-6">
              <p className="text-sm font-semibold text-slate-800 mb-2">
                Compartido con {shares.length} persona{shares.length === 1 ? '' : 's'}
              </p>
              <ul className="space-y-2">
                {shares.map(s => (
                  <li key={s.id} className="flex items-center gap-3 p-3 rounded-xl border border-slate-200 bg-slate-50/50">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-800 truncate">
                        {s.invitee_email ?? 'Pendiente de aceptar'}
                      </p>
                      <p className="text-xs text-slate-500">
                        {s.role === 'editor' ? 'Colaborador' : 'Solo ver'} ·{' '}
                        {s.resources.cuentas.length + s.resources.gastos_fijos.length + s.resources.inversiones.length} recurso{s.resources.cuentas.length + s.resources.gastos_fijos.length + s.resources.inversiones.length === 1 ? '' : 's'}
                      </p>
                    </div>
                    <button onClick={() => handleRevoke(s.id)}
                            className="text-slate-400 hover:text-red-500 p-1.5"
                            aria-label="Revocar acceso">
                      <Trash2 size={16} />
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

        </div>

        {/* Footer */}
        <div className="border-t border-slate-100 p-4 shrink-0">
          <button onClick={handleCreate} disabled={creating || loading}
                  className="w-full px-5 py-3 rounded-xl text-white font-semibold disabled:opacity-60"
                  style={{ background: 'linear-gradient(135deg, #1B3A6B 0%, #1a6b5a 100%)' }}>
            {creating
              ? (isEditing ? 'Guardando...' : 'Generando link...')
              : (isEditing ? 'Guardar cambios' : 'Generar link de invitación')}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}

function ResourceSection({
  title, icon, items, selected, onToggleAll, onToggle,
}: {
  title: string
  icon: React.ReactNode
  items: Resource[]
  selected: Set<string>
  onToggleAll: () => void
  onToggle: (id: string) => void
}) {
  if (items.length === 0) return null
  const allChecked = selected.size === items.length

  return (
    <div className="border border-slate-200 rounded-xl">
      <div className="flex items-center justify-between p-3 border-b border-slate-100">
        <p className="text-sm font-semibold text-slate-800 inline-flex items-center gap-1.5">
          {icon} {title}
          <span className="text-xs text-slate-400 font-normal">({selected.size}/{items.length})</span>
        </p>
        <button onClick={onToggleAll}
                className="text-xs text-slate-600 hover:text-slate-800 underline">
          {allChecked ? 'Desmarcar todo' : 'Marcar todo'}
        </button>
      </div>
      <ul className="divide-y divide-slate-50">
        {items.map(item => (
          <li key={item.id} className="px-3 py-2 hover:bg-slate-50">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={selected.has(item.id)}
                     onChange={() => onToggle(item.id)} />
              <div className="flex-1 min-w-0">
                <p className="text-sm text-slate-800 truncate">{item.nombre}</p>
                {item.subtitle && <p className="text-xs text-slate-400 truncate">{item.subtitle}</p>}
              </div>
            </label>
          </li>
        ))}
      </ul>
    </div>
  )
}
