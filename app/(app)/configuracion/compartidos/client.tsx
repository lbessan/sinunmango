'use client'

import { useState, useEffect, useCallback } from 'react'
import { Copy, Trash2, RefreshCw, Pencil, ChevronDown, ChevronUp, Plus, Users, Inbox, AlertCircle } from 'lucide-react'
import { ShareWorkspaceModal } from '@/components/share-workspace-modal'

// ─── Tipos compartidos con los endpoints ───────────────────────────────────
type OutgoingShare = {
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

type IncomingShare = {
  id:            string
  owner_user_id: string
  owner_email:   string | null
  role:          'viewer' | 'editor'
  accepted_at:   string
  resources:     { cuentas: string[]; gastos_fijos: string[]; inversiones: string[] }
}

// Nombres legibles cacheados para mostrar "Cuenta Galicia" en vez del id.
type ResourceNames = {
  cuentas:     Record<string, string>
  gastosFijos: Record<string, string>
  inversiones: Record<string, string>
}

type Tab = 'outgoing' | 'incoming'

const fmtFecha = (s: string) => new Date(s).toLocaleDateString('es-AR', { day: '2-digit', month: 'short' })

export function CompartidosClient() {
  const [tab, setTab]             = useState<Tab>('outgoing')
  const [outgoing, setOutgoing]   = useState<OutgoingShare[]>([])
  const [incoming, setIncoming]   = useState<IncomingShare[]>([])
  const [names, setNames]         = useState<ResourceNames>({ cuentas: {}, gastosFijos: {}, inversiones: {} })
  const [loading, setLoading]     = useState(true)
  const [error, setError]         = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [creating, setCreating]   = useState(false)

  const loadAll = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      // Outgoing + incoming + nombres de recursos (los del owner — para mostrar
      // en el detail expandible).
      const [resOut, resIn, resResources] = await Promise.all([
        fetch('/api/shares', { cache: 'no-store' }).then(r => r.ok ? r.json() : { shares: [] }),
        fetch('/api/shares/incoming', { cache: 'no-store' }).then(r => r.ok ? r.json() : { shares: [] }),
        fetch('/api/shareable-resources', { cache: 'no-store' }).then(r => r.ok ? r.json() : null),
      ])
      setOutgoing(resOut.shares ?? [])
      setIncoming(resIn.shares ?? [])

      if (resResources) {
        type CR = { id: string; nombre_cuenta: string }
        type GR = { id: string; nombre_gasto: string }
        type IR = { id: string; nombre?: string; tipo?: string }
        const cs = (resResources.cuentas ?? []) as CR[]
        const gs = (resResources.gastos_fijos ?? []) as GR[]
        const is = (resResources.inversiones ?? []) as IR[]
        setNames({
          cuentas:     Object.fromEntries(cs.map(c => [c.id, c.nombre_cuenta])),
          gastosFijos: Object.fromEntries(gs.map(g => [g.id, g.nombre_gasto])),
          inversiones: Object.fromEntries(is.map(i => [i.id, i.nombre ?? i.tipo ?? '(sin nombre)'])),
        })
      }
    } catch {
      setError('No pudimos cargar los datos.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void loadAll() }, [loadAll])

  // ─── Acciones outgoing ────────────────────────────────────────────────────
  async function handleRevoke(id: string) {
    if (!confirm('¿Revocar este acceso? La otra persona lo pierde inmediatamente.')) return
    await fetch(`/api/shares/${id}`, { method: 'DELETE' })
    await loadAll()
  }

  async function handleRegenerate(id: string) {
    if (!confirm('Generar un link nuevo invalida el anterior. ¿Continuar?')) return
    const res = await fetch(`/api/shares/${id}/regenerate`, { method: 'POST' })
    if (!res.ok) {
      const d = await res.json().catch(() => ({}))
      alert(d.error ?? 'No pudimos regenerar el link')
      return
    }
    await loadAll()
  }

  function inviteUrl(token: string): string {
    if (typeof window === 'undefined') return ''
    return `${window.location.origin}/invite/${token}`
  }

  async function handleCopyLink(token: string) {
    try {
      await navigator.clipboard.writeText(inviteUrl(token))
      // Sin alert: el botón cambia visualmente abajo (ver setCopiedId).
      setCopiedId(token)
      setTimeout(() => setCopiedId(null), 2000)
    } catch {
      alert('No pudimos copiar — copialo a mano:\n' + inviteUrl(token))
    }
  }

  const [copiedId, setCopiedId] = useState<string | null>(null)

  // ─── Acciones incoming ────────────────────────────────────────────────────
  async function handleLeave(id: string) {
    if (!confirm('¿Dejar este workspace? No vas a poder verlo a menos que el dueño te re-invite.')) return
    await fetch(`/api/shares/${id}`, { method: 'DELETE' })
    await loadAll()
  }

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="space-y-4">
      {/* Pestañas */}
      <div className="flex gap-2 border-b border-slate-200">
        <TabButton active={tab === 'outgoing'} onClick={() => setTab('outgoing')}>
          <Users size={14} /> Compartiste con ({outgoing.length})
        </TabButton>
        <TabButton active={tab === 'incoming'} onClick={() => setTab('incoming')}>
          <Inbox size={14} /> Te compartieron ({incoming.length})
        </TabButton>
      </div>

      {error && (
        <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 rounded-xl px-3 py-2 text-sm">
          <AlertCircle size={14} /> {error}
        </div>
      )}

      {/* OUTGOING */}
      {tab === 'outgoing' && (
        <div className="space-y-3">
          <div className="flex justify-end">
            <button
              onClick={() => setCreating(true)}
              className="inline-flex items-center gap-2 text-sm text-white px-4 py-2 rounded-lg font-medium"
              style={{ background: 'linear-gradient(90deg, var(--accent2, #1B3A6B), var(--accent, #1a6b5a))' }}
            >
              <Plus size={14} /> Nuevo share
            </button>
          </div>

          {loading ? (
            <p className="text-sm text-slate-400 py-8 text-center">Cargando...</p>
          ) : outgoing.length === 0 ? (
            <EmptyState message="Todavía no compartiste el workspace con nadie." />
          ) : (
            outgoing.map(s => (
              <OutgoingCard
                key={s.id}
                share={s}
                names={names}
                onEdit={() => setEditingId(s.id)}
                onRevoke={() => handleRevoke(s.id)}
                onRegenerate={() => handleRegenerate(s.id)}
                onCopyLink={() => handleCopyLink(s.invite_token)}
                copied={copiedId === s.invite_token}
                inviteUrl={inviteUrl(s.invite_token)}
              />
            ))
          )}
        </div>
      )}

      {/* INCOMING */}
      {tab === 'incoming' && (
        <div className="space-y-3">
          {loading ? (
            <p className="text-sm text-slate-400 py-8 text-center">Cargando...</p>
          ) : incoming.length === 0 ? (
            <EmptyState message="Nadie compartió un workspace con vos todavía." />
          ) : (
            incoming.map(s => (
              <IncomingCard
                key={s.id}
                share={s}
                onLeave={() => handleLeave(s.id)}
              />
            ))
          )}
        </div>
      )}

      {/* Modal: crear nuevo */}
      {creating && (
        <ShareWorkspaceModal
          onClose={() => setCreating(false)}
          onShareChanged={() => { void loadAll() }}
        />
      )}

      {/* Modal: editar existente */}
      {editingId && (
        <ShareWorkspaceModal
          onClose={() => setEditingId(null)}
          editShareId={editingId}
          onShareChanged={() => { void loadAll() }}
        />
      )}
    </div>
  )
}

// ─── Sub-componentes ─────────────────────────────────────────────────────────

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
        active
          ? 'border-blue-500 text-slate-800'
          : 'border-transparent text-slate-500 hover:text-slate-700'
      }`}
    >
      {children}
    </button>
  )
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="text-center py-12 bg-white rounded-2xl border border-slate-100">
      <p className="text-sm text-slate-400">{message}</p>
    </div>
  )
}

function StatusBadge({ status }: { status: OutgoingShare['status'] }) {
  const config: Record<OutgoingShare['status'], { label: string; classes: string }> = {
    pending:  { label: 'Pendiente', classes: 'bg-amber-50 text-amber-700 border-amber-200' },
    active:   { label: 'Activo',    classes: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
    expired:  { label: 'Expirado',  classes: 'bg-slate-100 text-slate-600 border-slate-200' },
    revoked:  { label: 'Revocado',  classes: 'bg-slate-100 text-slate-400 border-slate-200' },
  }
  const { label, classes } = config[status]
  return (
    <span className={`text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full border ${classes}`}>
      {label}
    </span>
  )
}

function OutgoingCard({
  share, names, onEdit, onRevoke, onRegenerate, onCopyLink, copied, inviteUrl,
}: {
  share:        OutgoingShare
  names:        ResourceNames
  onEdit:       () => void
  onRevoke:     () => void
  onRegenerate: () => void
  onCopyLink:   () => void
  copied:       boolean
  inviteUrl:    string
}) {
  const [open, setOpen] = useState(false)
  const totalRecursos =
    share.resources.cuentas.length + share.resources.gastos_fijos.length + share.resources.inversiones.length
  const isActive  = share.status === 'active'
  const isPending = share.status === 'pending'
  const canEdit   = !['expired', 'revoked'].includes(share.status)

  return (
    <div className="bg-white border border-slate-100 rounded-xl overflow-hidden">
      <div className="p-4 flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm font-semibold text-slate-800 truncate">
              {share.invitee_email ?? 'Pendiente de aceptar'}
            </p>
            <StatusBadge status={share.status} />
          </div>
          <p className="text-xs text-slate-500 mt-1">
            {share.role === 'editor' ? 'Colaborador' : 'Solo ver'} ·{' '}
            {totalRecursos} recurso{totalRecursos === 1 ? '' : 's'}
            {isPending && ` · Expira ${fmtFecha(share.expires_at)}`}
            {isActive && share.accepted_at && ` · Aceptado ${fmtFecha(share.accepted_at)}`}
          </p>
        </div>
        <button
          onClick={() => setOpen(o => !o)}
          className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-50"
          aria-label="Ver detalle"
        >
          {open ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </button>
      </div>

      {open && (
        <div className="border-t border-slate-100 bg-slate-50/50 px-4 py-3 space-y-3 text-sm">
          {/* Link visible solo si está pending — sino el link expiró o no aplica */}
          {isPending && (
            <div className="bg-white border border-slate-200 rounded-lg p-2.5 flex items-center gap-2">
              <code className="flex-1 text-xs text-slate-700 truncate" title={inviteUrl}>{inviteUrl}</code>
              <button
                onClick={onCopyLink}
                className="text-xs font-semibold px-2.5 py-1 rounded bg-slate-900 text-white hover:bg-slate-800"
              >
                {copied ? '¡Copiado!' : <><Copy size={12} className="inline mr-1" />Copiar</>}
              </button>
            </div>
          )}

          {/* Detalle de recursos compartidos */}
          <div className="space-y-2 text-xs">
            <ResourceList title="Cuentas y tarjetas"
              ids={share.resources.cuentas} dict={names.cuentas} />
            <ResourceList title="Gastos fijos"
              ids={share.resources.gastos_fijos} dict={names.gastosFijos} />
            <ResourceList title="Inversiones"
              ids={share.resources.inversiones} dict={names.inversiones} />
          </div>

          {/* Acciones */}
          <div className="flex flex-wrap gap-2 pt-2 border-t border-slate-200">
            {canEdit && (
              <button
                onClick={onEdit}
                className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-slate-200 text-slate-700 hover:bg-white"
              >
                <Pencil size={12} /> Editar
              </button>
            )}
            {isPending && (
              <button
                onClick={onRegenerate}
                className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-slate-200 text-slate-700 hover:bg-white"
              >
                <RefreshCw size={12} /> Regenerar link
              </button>
            )}
            {/* expired permite regenerar también — el endpoint lo permite si !accepted_at */}
            {share.status === 'expired' && (
              <button
                onClick={onRegenerate}
                className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-amber-200 text-amber-700 hover:bg-amber-50"
              >
                <RefreshCw size={12} /> Regenerar link
              </button>
            )}
            {!['revoked'].includes(share.status) && (
              <button
                onClick={onRevoke}
                className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-red-200 text-red-600 hover:bg-red-50 ml-auto"
              >
                <Trash2 size={12} /> Revocar acceso
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function IncomingCard({ share, onLeave }: { share: IncomingShare; onLeave: () => void }) {
  const totalRecursos =
    share.resources.cuentas.length + share.resources.gastos_fijos.length + share.resources.inversiones.length

  return (
    <div className="bg-white border border-slate-100 rounded-xl p-4 flex items-start gap-3">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-slate-800 truncate">
          {share.owner_email ?? 'Workspace compartido'}
        </p>
        <p className="text-xs text-slate-500 mt-1">
          {share.role === 'editor' ? 'Podés cargar movimientos' : 'Solo lectura'} ·{' '}
          {totalRecursos} recurso{totalRecursos === 1 ? '' : 's'}
          {' '}· Aceptado {fmtFecha(share.accepted_at)}
        </p>
      </div>
      <button
        onClick={onLeave}
        className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-red-200 text-red-600 hover:bg-red-50 shrink-0"
      >
        <Trash2 size={12} /> Dejar
      </button>
    </div>
  )
}

function ResourceList({ title, ids, dict }: { title: string; ids: string[]; dict: Record<string, string> }) {
  if (ids.length === 0) return null
  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-1">{title}</p>
      <ul className="space-y-0.5 ml-2">
        {ids.map(id => (
          <li key={id} className="text-slate-700">· {dict[id] ?? id}</li>
        ))}
      </ul>
    </div>
  )
}
