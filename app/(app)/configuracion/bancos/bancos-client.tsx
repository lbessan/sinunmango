'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Pencil, Check, X, ChevronDown, ChevronUp, CreditCard, Landmark } from 'lucide-react'

type Cuenta = {
  id:               string
  nombre_cuenta:    string
  institucion:      string | null
  tipo_cuenta:      string
  imagen_url:       string | null
  imagen_banner_url:string | null
  color_primario:   string | null
  activa:           boolean
}

type Grupo = {
  institucion: string
  cuentas:     Cuenta[]
  color:       string
  imagen_url:  string | null
  imagen_banner_url: string | null
}

function agruparPorInstitucion(cuentas: Cuenta[]): Grupo[] {
  const map = new Map<string, Cuenta[]>()
  for (const c of cuentas) {
    const key = c.institucion?.trim() || '(Sin institución)'
    if (!map.has(key)) map.set(key, [])
    map.get(key)!.push(c)
  }
  return [...map.entries()].map(([institucion, cuentas]) => ({
    institucion,
    cuentas,
    color:             cuentas[0]?.color_primario ?? '#475569',
    imagen_url:        cuentas[0]?.imagen_url ?? null,
    imagen_banner_url: cuentas[0]?.imagen_banner_url ?? null,
  }))
}

// ── Editor inline de una institución ─────────────────────────────────────────

function GrupoEditor({ grupo, onSaved }: { grupo: Grupo; onSaved: () => void }) {
  const [nombre,    setNombre]    = useState(grupo.institucion === '(Sin institución)' ? '' : grupo.institucion)
  const [color,     setColor]     = useState(grupo.color)
  const [imagenUrl, setImagenUrl] = useState(grupo.imagen_url ?? '')
  const [bannerUrl, setBannerUrl] = useState(grupo.imagen_banner_url ?? '')
  const [saving,    setSaving]    = useState(false)
  const [error,     setError]     = useState('')
  const [open,      setOpen]      = useState(false)

  const handleGuardar = async () => {
    setSaving(true); setError('')

    // Actualizar todas las cuentas de este grupo
    const res = await Promise.all(
      grupo.cuentas.map(c =>
        fetch(`/api/cuentas/${c.id}`, {
          method:  'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            institucion:       nombre.trim() || null,
            color_primario:    color,
            imagen_url:        imagenUrl.trim() || null,
            imagen_banner_url: bannerUrl.trim() || null,
          }),
        })
      )
    )

    setSaving(false)
    if (res.some(r => !r.ok)) { setError('No se pudo guardar'); return }
    onSaved()
    setOpen(false)
  }

  const isTarjeta = grupo.cuentas[0]?.tipo_cuenta === 'Tarjeta Credito'

  return (
    <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden">
      {/* Header del grupo */}
      <button
        className="w-full flex items-center gap-4 px-5 py-4 hover:bg-slate-50 transition-colors text-left"
        onClick={() => setOpen(o => !o)}
      >
        {/* Ícono / thumbnail */}
        <div
          className={`shrink-0 flex items-center justify-center overflow-hidden ${isTarjeta ? 'rounded-lg' : 'rounded-xl'}`}
          style={{ width: isTarjeta ? 56 : 40, height: isTarjeta ? 36 : 40, background: grupo.color }}
        >
          {grupo.imagen_url
            ? <img src={grupo.imagen_url} alt={grupo.institucion}
                className={isTarjeta ? 'w-full h-full object-cover' : 'w-9 h-9 object-contain p-1'} />
            : isTarjeta
              ? <CreditCard size={18} className="text-white/60" />
              : <Landmark  size={16} className="text-white/60" />
          }
        </div>

        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-slate-800 truncate">{grupo.institucion}</p>
          <p className="text-xs text-slate-400">
            {grupo.cuentas.length} cuenta{grupo.cuentas.length !== 1 ? 's' : ''} ·{' '}
            {grupo.cuentas.map(c => c.nombre_cuenta).join(', ')}
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <div className="w-5 h-5 rounded-full border-2 border-white shadow" style={{ background: grupo.color }} />
          {open ? <ChevronUp size={16} className="text-slate-400" /> : <ChevronDown size={16} className="text-slate-400" />}
        </div>
      </button>

      {/* Editor expandido */}
      {open && (
        <div className="px-5 pb-5 pt-1 border-t border-slate-100 space-y-4">
          {/* Nombre de institución */}
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1.5">Nombre de la institución</label>
            <input
              type="text"
              value={nombre}
              onChange={e => setNombre(e.target.value)}
              placeholder="Ej: Banco Galicia"
              className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm text-slate-800 focus:outline-none"
            />
            <p className="text-xs text-slate-400 mt-1">
              Cambia el nombre en todas las cuentas de este grupo.
            </p>
          </div>

          {/* Color */}
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1.5">Color de marca</label>
            <div className="flex items-center gap-3">
              <input type="color" value={color} onChange={e => setColor(e.target.value)}
                className="w-10 h-10 rounded-lg border border-slate-200 cursor-pointer p-0.5 shrink-0" />
              <input type="text" value={color} onChange={e => setColor(e.target.value)}
                placeholder="#004999"
                className="flex-1 px-3 py-2 border border-slate-200 rounded-lg text-sm font-mono focus:outline-none" />
              <div className="w-10 h-10 rounded-lg shrink-0" style={{ background: color }} />
            </div>
          </div>

          {/* Ícono URL */}
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1.5">URL del ícono (PNG)</label>
            <input
              type="text"
              value={imagenUrl}
              onChange={e => setImagenUrl(e.target.value)}
              placeholder="https://... o /banks/galicia.png"
              className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm text-slate-800 focus:outline-none font-mono"
            />
            {imagenUrl && (
              <img src={imagenUrl} alt="preview" className="mt-2 h-8 object-contain rounded"
                onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />
            )}
          </div>

          {/* Banner URL */}
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1.5">URL del logo / banner</label>
            <input
              type="text"
              value={bannerUrl}
              onChange={e => setBannerUrl(e.target.value)}
              placeholder="https://... o /banks/galicia-banner.png"
              className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm text-slate-800 focus:outline-none font-mono"
            />
          </div>

          {error && <p className="text-xs text-red-500">{error}</p>}

          <div className="flex gap-3 pt-1">
            <button onClick={() => setOpen(false)}
              className="flex-1 py-2.5 rounded-xl text-sm font-medium border border-slate-200 text-slate-600 hover:bg-slate-50">
              Cancelar
            </button>
            <button onClick={handleGuardar} disabled={saving}
              className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-50"
              style={{ background: 'linear-gradient(90deg, var(--accent2, #1B3A6B), var(--accent, #1a6b5a))' }}>
              {saving ? 'Guardando…' : 'Guardar cambios'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Main client component ─────────────────────────────────────────────────────

export function BancosClient({ cuentas }: { cuentas: Cuenta[] }) {
  const router  = useRouter()
  const [key, setKey] = useState(0) // para re-trigger de recarga

  const grupos = agruparPorInstitucion(cuentas)

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-800 mb-1">Mis bancos e instituciones</h1>
        <p className="text-sm text-slate-500">
          Editá el nombre, color e íconos de cada banco o billetera. Los cambios aplican a todas
          las cuentas de esa institución.
        </p>
      </div>

      {grupos.length === 0 ? (
        <div className="text-center py-16 text-slate-400">
          <Landmark size={40} className="mx-auto mb-3 opacity-30" />
          <p className="text-sm">Todavía no tenés cuentas cargadas.</p>
        </div>
      ) : (
        <div className="space-y-3" key={key}>
          {grupos.map(g => (
            <GrupoEditor key={g.institucion} grupo={g} onSaved={() => { setKey(k => k + 1); router.refresh() }} />
          ))}
        </div>
      )}

      <p className="text-xs text-slate-400 text-center pb-4">
        Para cambiar la imagen de forma permanente, subí el archivo a{' '}
        <code className="bg-slate-100 px-1 rounded">/public/banks/</code> y referencialo con una URL relativa.
      </p>
    </div>
  )
}
