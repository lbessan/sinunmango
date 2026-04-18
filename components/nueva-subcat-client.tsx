'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

const inputClass = 'w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm text-slate-800 outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-300 bg-white'
const labelClass = 'block text-xs font-medium text-slate-500 mb-1.5'

export function NuevaSubcatClient({
  categoriaPadre,
  categorias,
}: {
  categoriaPadre: any
  categorias: any[]
}) {
  const router  = useRouter()
  const [nombre, setNombre]   = useState('')
  const [padreId, setPadreId] = useState(categoriaPadre.id)
  const [saving, setSaving]   = useState(false)
  const [error, setError]     = useState('')

  const handleGuardar = async () => {
    if (!nombre.trim()) { setError('El nombre es obligatorio'); return }
    setSaving(true)
    const res = await fetch('/api/subcategorias', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nombre_subcategoria: nombre, categoria_padre: padreId }),
    })
    setSaving(false)
    if (res.ok) router.push('/categorias')
    else { const d = await res.json(); setError(d.error ?? 'Error') }
  }

  return (
    <div className="max-w-lg mx-auto">
      <h1 className="text-xl font-semibold text-slate-800 mb-6">Nueva subcategoría</h1>
      <div className="bg-white rounded-2xl border border-slate-100 p-6 space-y-5">

        <div>
          <label className={labelClass}>Categoría padre</label>
          <select value={padreId} onChange={e => setPadreId(e.target.value)} className={inputClass}>
            {categorias.map(c => <option key={c.id} value={c.id}>{c.icono} {c.nombre_categoria}</option>)}
          </select>
        </div>

        <div>
          <label className={labelClass}>Nombre *</label>
          <input type="text" value={nombre} onChange={e => setNombre(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleGuardar()}
            placeholder="Ej: Veterinaria" className={inputClass} autoFocus />
        </div>

        {error && <p className="text-sm text-red-500 bg-red-50 px-4 py-2 rounded-lg">{error}</p>}

        <div className="flex gap-3">
          <button onClick={() => router.back()} className="flex-1 py-2.5 rounded-lg text-sm font-medium border border-slate-200 text-slate-600 hover:bg-slate-50">Cancelar</button>
          <button onClick={handleGuardar} disabled={saving}
            className="flex-1 py-2.5 rounded-lg text-sm font-medium text-white"
            style={{ background: 'linear-gradient(90deg, var(--accent2, #1B3A6B), var(--accent, #1a6b5a))', opacity: saving ? 0.7 : 1 }}
          >{saving ? 'Guardando...' : 'Crear subcategoría'}</button>
        </div>
      </div>
    </div>
  )
}
