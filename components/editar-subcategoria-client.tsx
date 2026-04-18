'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ICONOS_CATEGORIAS, GRUPOS, urlIcono } from '@/lib/iconos-categorias'
import { IconoCategoria } from '@/components/icono-categoria'

type Categoria = { id: string; nombre_categoria: string; icono: string | null }

const inputClass = 'w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm text-slate-800 outline-none focus:ring-2 focus:ring-blue-100 bg-white'
const labelClass = 'block text-xs font-medium text-slate-500 mb-1.5'

function ImgIcono({ nombre, size }: { nombre: string; size: number }) {
  const [failedMain, setFailedMain] = useState(false)
  const [failedAlt,  setFailedAlt]  = useState(false)
  const alt = ICONOS_CATEGORIAS.find(i => i.nombre === nombre)?.alt ?? null
  if (failedAlt || (!alt && failedMain)) return <span style={{ fontSize: size * 0.8 }}>🏷️</span>
  if (failedMain && alt) return <img src={urlIcono(alt, 64)} alt={nombre} width={size} height={size} className="object-contain" loading="lazy" onError={() => setFailedAlt(true)} />
  return <img src={urlIcono(nombre, 64)} alt={nombre} width={size} height={size} className="object-contain" loading="lazy" onError={() => setFailedMain(true)} />
}

export function EditarSubcategoriaClient({
  subcategoria,
  categorias,
  catIdActual,
}: {
  subcategoria: any
  categorias: Categoria[]
  catIdActual: string
}) {
  const router   = useRouter()
  const [nombre,   setNombre]   = useState(subcategoria.nombre_subcategoria ?? '')
  const [padreId,  setPadreId]  = useState(subcategoria.categoria_padre ?? catIdActual)
  const [icono,    setIcono]    = useState(subcategoria.icono ?? 'shopping-cart')
  const [busqueda, setBusqueda] = useState('')
  const [grupo,    setGrupo]    = useState('')
  const [saving,   setSaving]   = useState(false)
  const [saved,    setSaved]    = useState(false)
  const [error,    setError]    = useState('')

  const isNew = !subcategoria.id

  const iconosFiltrados = ICONOS_CATEGORIAS.filter(i => {
    const matchQ = !busqueda || i.label.toLowerCase().includes(busqueda.toLowerCase()) || i.nombre.toLowerCase().includes(busqueda.toLowerCase())
    const matchG = !grupo || i.grupo === grupo
    return matchQ && matchG
  })

  const handleGuardar = async () => {
    if (!nombre.trim()) { setError('El nombre es obligatorio'); return }
    setSaving(true)
    const res = await fetch('/api/subcategorias', {
      method: isNew ? 'POST' : 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(
        isNew
          ? { nombre_subcategoria: nombre, categoria_padre: padreId, icono }
          : { id: subcategoria.id, nombre_subcategoria: nombre, categoria_padre: padreId, icono }
      ),
    })
    setSaving(false)
    if (res.ok) { setSaved(true); setTimeout(() => router.push('/categorias'), 1000) }
    else { const d = await res.json(); setError(d.error ?? 'Error') }
  }

  return (
    <div className="max-w-lg mx-auto">
      <h1 className="text-xl font-semibold text-slate-800 mb-6">
        {isNew ? 'Nueva subcategoría' : 'Editar subcategoría'}
      </h1>

      <div className="bg-white rounded-2xl border border-slate-100 p-6 space-y-5">

        {/* Preview */}
        <div className="flex items-center gap-4 p-4 bg-slate-50 rounded-xl">
          <IconoCategoria icono={icono} size={48} />
          <div>
            <p className="text-base font-semibold text-slate-800">{nombre || 'Nombre de la subcategoría'}</p>
            <p className="text-xs text-slate-400 mt-0.5">
              {ICONOS_CATEGORIAS.find(i => i.nombre === icono)?.label ?? icono}
            </p>
          </div>
        </div>

        <div>
          <label className={labelClass}>Nombre *</label>
          <input type="text" value={nombre} onChange={e => setNombre(e.target.value)} className={inputClass} autoFocus />
        </div>

        <div>
          <label className={labelClass}>Categoría padre</label>
          <select value={padreId} onChange={e => setPadreId(e.target.value)} className={inputClass}>
            <option value="">— seleccionar —</option>
            {categorias.map(c => <option key={c.id} value={c.id}>{c.nombre_categoria}</option>)}
          </select>
        </div>

        {/* Picker de ícono */}
        <div>
          <label className={labelClass}>Ícono</label>
          <input type="text" value={busqueda} onChange={e => { setBusqueda(e.target.value); setGrupo('') }}
            placeholder="Buscar ícono..."
            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-100 bg-white mb-2" />

          <div className="flex gap-1.5 flex-wrap mb-3">
            <button onClick={() => { setGrupo(''); setBusqueda('') }}
              className={`text-xs px-2.5 py-1 rounded-full border font-medium transition-colors ${!grupo && !busqueda ? 'text-white border-transparent' : 'text-slate-500 border-slate-200 hover:bg-slate-50'}`}
              style={!grupo && !busqueda ? { background: 'linear-gradient(90deg, var(--accent2, #1B3A6B), var(--accent, #1a6b5a))' } : {}}>
              Todos
            </button>
            {GRUPOS.map(g => (
              <button key={g} onClick={() => { setGrupo(g); setBusqueda('') }}
                className={`text-xs px-2.5 py-1 rounded-full border font-medium transition-colors ${grupo === g ? 'text-white border-transparent' : 'text-slate-500 border-slate-200 hover:bg-slate-50'}`}
                style={grupo === g ? { background: 'linear-gradient(90deg, var(--accent2, #1B3A6B), var(--accent, #1a6b5a))' } : {}}>
                {g}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-6 gap-2 max-h-56 overflow-y-auto pr-1 border border-slate-100 rounded-xl p-3">
            {iconosFiltrados.map(item => {
              const sel = icono === item.nombre
              return (
                <button key={item.nombre} onClick={() => setIcono(item.nombre)} title={item.label}
                  className={`flex flex-col items-center justify-center gap-1.5 p-2.5 rounded-xl transition-all ${sel ? 'bg-blue-50 ring-2 ring-blue-400 scale-105' : 'hover:bg-slate-50 hover:scale-105'}`}>
                  <ImgIcono nombre={item.nombre} size={32} />
                  <span className="text-[9px] text-slate-400 truncate w-full text-center leading-tight">{item.label}</span>
                </button>
              )
            })}
            {iconosFiltrados.length === 0 && (
              <p className="col-span-6 text-center text-xs text-slate-400 py-4">Sin resultados</p>
            )}
          </div>
        </div>

        {error && <p className="text-sm text-red-500 bg-red-50 px-4 py-2 rounded-lg">{error}</p>}

        <div className="flex gap-3">
          <button onClick={() => router.back()}
            className="flex-1 py-2.5 rounded-lg text-sm font-medium border border-slate-200 text-slate-600 hover:bg-slate-50">
            Cancelar
          </button>
          <button onClick={handleGuardar} disabled={saving || saved}
            className="flex-1 py-2.5 rounded-lg text-sm font-medium text-white"
            style={{ background: saved ? '#16a34a' : 'linear-gradient(90deg, var(--accent2, #1B3A6B), var(--accent, #1a6b5a))', opacity: saving ? 0.7 : 1 }}>
            {saved ? '✓ Guardado' : saving ? 'Guardando...' : isNew ? 'Crear' : 'Guardar cambios'}
          </button>
        </div>
      </div>
    </div>
  )
}
