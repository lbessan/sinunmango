'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ImagenUploader } from './imagen-uploader'

type CuentaForm = {
  id?: string
  nombre_cuenta: string
  institucion: string
  moneda: string
  tipo_cuenta: string
  saldo_inicial: string
  fecha_cierre_tarjeta: string
  fecha_vencimiento_tarjeta: string
  terminacion_tarjeta: string
  activa: boolean
  imagen_url: string
  imagen_banner_url: string
  color_primario: string
}

// Colores predefinidos de bancos argentinos comunes
const COLORES_BANCO = [
  { nombre: 'BBVA Francés',    color: '#004999' },
  { nombre: 'Banco Galicia',   color: '#E30613' },
  { nombre: 'Banco Provincia', color: '#005CA9' },
  { nombre: 'Santander',       color: '#EC0000' },
  { nombre: 'Mercado Pago',    color: '#009EE3' },
  { nombre: 'Naranja X',       color: '#FF6200' },
  { nombre: 'Brubank',         color: '#6100FF' },
  { nombre: 'Uala',            color: '#7B2D8B' },
  { nombre: 'Carrefour',       color: '#004A97' },
  { nombre: 'Macro',           color: '#FFCC00' },
  { nombre: 'HSBC',            color: '#DB0011' },
  { nombre: 'Personalizado',   color: '#0d3b6e' },
]

const inputClass = 'w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm text-slate-800 outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-300 bg-white'
const labelClass = 'block text-xs font-medium text-slate-500 mb-1.5'

export function CuentaFormClient({ inicial }: { inicial: CuentaForm }) {
  const router = useRouter()
  const [form, setForm] = useState<CuentaForm>(inicial)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved]   = useState(false)
  const [error, setError]   = useState('')

  const set = (k: keyof CuentaForm, v: string | boolean) =>
    setForm(prev => ({ ...prev, [k]: v }))

  const isTarjeta = form.tipo_cuenta === 'Tarjeta Credito'
  const isEditing = !!form.id

  const handleGuardar = async () => {
    if (!form.nombre_cuenta || !form.tipo_cuenta || !form.moneda) {
      setError('Completá los campos obligatorios')
      return
    }
    setSaving(true)
    setError('')

    const body = {
      nombre_cuenta:             form.nombre_cuenta,
      institucion:               form.institucion || null,
      moneda:                    form.moneda,
      tipo_cuenta:               form.tipo_cuenta,
      saldo_inicial:             parseFloat(form.saldo_inicial) || 0,
      fecha_cierre_tarjeta:      isTarjeta && form.fecha_cierre_tarjeta ? form.fecha_cierre_tarjeta : null,
      fecha_vencimiento_tarjeta: isTarjeta && form.fecha_vencimiento_tarjeta ? form.fecha_vencimiento_tarjeta : null,
      terminacion_tarjeta:       isTarjeta && form.terminacion_tarjeta ? form.terminacion_tarjeta.trim() : null,
      activa:                    form.activa,
      imagen_url:                form.imagen_url || null,
      imagen_banner_url:         form.imagen_banner_url || null,
      color_primario:            form.color_primario || '#0d3b6e',
    }

    const res = await fetch(
      isEditing ? `/api/cuentas/${form.id}` : '/api/cuentas',
      { method: isEditing ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
    )

    setSaving(false)
    if (res.ok) { setSaved(true); setTimeout(() => router.push('/cuentas'), 1000) }
    else { const d = await res.json(); setError(d.error ?? 'Error al guardar') }
  }

  return (
    <div className="max-w-lg mx-auto">
      <h1 className="text-xl font-semibold text-slate-800 mb-6">
        {isEditing ? 'Editar cuenta' : 'Nueva cuenta'}
      </h1>

      <div className="bg-white rounded-2xl border border-slate-100 p-6 space-y-5">

        {/* Preview del banner */}
        <div
          className="rounded-xl h-20 flex items-center justify-center overflow-hidden relative"
          style={{ background: form.color_primario }}
        >
          {form.imagen_banner_url
            ? <img src={form.imagen_banner_url} alt="Banner" className="max-h-14 max-w-full object-contain" />
            : <p className="text-white/50 text-xs">Preview del banner</p>
          }
        </div>

        {/* Color de marca */}
        <div>
          <label className={labelClass}>Color de marca</label>
          <div className="flex flex-wrap gap-2 mb-2">
            {COLORES_BANCO.map(c => (
              <button
                key={c.color}
                onClick={() => set('color_primario', c.color)}
                title={c.nombre}
                className={`w-7 h-7 rounded-full transition-all border-2 ${
                  form.color_primario === c.color ? 'border-slate-800 scale-110' : 'border-transparent hover:scale-105'
                }`}
                style={{ background: c.color }}
              />
            ))}
          </div>
          <div className="flex items-center gap-3">
            <input
              type="color"
              value={form.color_primario}
              onChange={e => set('color_primario', e.target.value)}
              className="w-10 h-10 rounded-lg border border-slate-200 cursor-pointer p-0.5"
            />
            <input
              type="text"
              value={form.color_primario}
              onChange={e => set('color_primario', e.target.value)}
              placeholder="#004999"
              className="flex-1 px-3 py-2 border border-slate-200 rounded-lg text-sm font-mono outline-none"
            />
          </div>
        </div>

        {/* Imágenes */}
        <div className="grid grid-cols-2 gap-4">
          <ImagenUploader
            valor={form.imagen_url}
            onChange={url => set('imagen_url', url)}
            label="Ícono (lista)"
            carpeta="cuentas"
            id={`${form.id ?? 'nueva'}-icon`}
          />
          <ImagenUploader
            valor={form.imagen_banner_url}
            onChange={url => set('imagen_banner_url', url)}
            label="Logo para el banner"
            carpeta="cuentas"
            id={`${form.id ?? 'nueva'}-banner`}
          />
        </div>
        <p className="text-xs text-slate-400 -mt-2">
          El logo del banner se muestra sobre el color de marca. Usá PNG con fondo transparente para mejor resultado.
        </p>

        {/* Datos */}
        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2">
            <label className={labelClass}>Nombre *</label>
            <input type="text" value={form.nombre_cuenta} onChange={e => set('nombre_cuenta', e.target.value)} placeholder="Ej: CA Galicia" className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>Institución</label>
            <input type="text" value={form.institucion} onChange={e => set('institucion', e.target.value)} placeholder="Ej: Banco Galicia" className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>Moneda *</label>
            <select value={form.moneda} onChange={e => set('moneda', e.target.value)} className={inputClass}>
              <option value="ARS">ARS</option>
              <option value="USD">USD</option>
            </select>
          </div>
          <div>
            <label className={labelClass}>Tipo *</label>
            <select value={form.tipo_cuenta} onChange={e => set('tipo_cuenta', e.target.value)} className={inputClass}>
              <option value="Billetera/Banco">Billetera/Banco</option>
              <option value="Tarjeta Credito">Tarjeta de crédito</option>
              <option value="Efectivo">Efectivo</option>
            </select>
          </div>
          <div>
            <label className={labelClass}>Saldo inicial</label>
            <input type="number" step="0.01" value={form.saldo_inicial} onChange={e => set('saldo_inicial', e.target.value)} placeholder="0.00" className={inputClass} />
          </div>
        </div>

        {isTarjeta && (
          <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 space-y-4">
            <p className="text-xs font-semibold text-blue-600 uppercase tracking-wide">Datos de tarjeta</p>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-blue-700 mb-1.5">Fecha de cierre</label>
                <input type="date" value={form.fecha_cierre_tarjeta} onChange={e => set('fecha_cierre_tarjeta', e.target.value)} className="w-full px-3 py-2.5 border border-blue-200 rounded-lg text-sm outline-none bg-white" />
              </div>
              <div>
                <label className="block text-xs font-medium text-blue-700 mb-1.5">Fecha de vencimiento</label>
                <input type="date" value={form.fecha_vencimiento_tarjeta} onChange={e => set('fecha_vencimiento_tarjeta', e.target.value)} className="w-full px-3 py-2.5 border border-blue-200 rounded-lg text-sm outline-none bg-white" />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-blue-700 mb-1.5">
                Últimos 4 dígitos
                <span className="ml-1.5 font-normal text-blue-500">— para importación automática desde email</span>
              </label>
              <div className="relative max-w-[140px]">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-blue-300 text-sm font-mono pointer-events-none">····</span>
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={4}
                  value={form.terminacion_tarjeta}
                  onChange={e => set('terminacion_tarjeta', e.target.value.replace(/\D/g, ''))}
                  placeholder="1234"
                  className="w-full pl-10 pr-3 py-2.5 border border-blue-200 rounded-lg text-sm font-mono outline-none bg-white focus:ring-2 focus:ring-blue-200"
                />
              </div>
            </div>
          </div>
        )}

        <div className="flex items-center gap-3">
          <input type="checkbox" id="activa" checked={form.activa} onChange={e => set('activa', e.target.checked)} className="w-4 h-4" />
          <label htmlFor="activa" className="text-sm text-slate-600 cursor-pointer">Cuenta activa</label>
        </div>

        {error && <p className="text-sm text-red-500 bg-red-50 px-4 py-2 rounded-lg">{error}</p>}

        <div className="flex gap-3">
          <button onClick={() => router.back()} className="flex-1 py-2.5 rounded-lg text-sm font-medium border border-slate-200 text-slate-600 hover:bg-slate-50">Cancelar</button>
          <button onClick={handleGuardar} disabled={saving || saved}
            className="flex-1 py-2.5 rounded-lg text-sm font-medium text-white"
            style={{ background: saved ? '#16a34a' : 'linear-gradient(90deg, var(--accent2, #1B3A6B), var(--accent, #1a6b5a))', opacity: saving ? 0.7 : 1 }}
          >
            {saved ? '✓ Guardado' : saving ? 'Guardando...' : isEditing ? 'Guardar cambios' : 'Crear cuenta'}
          </button>
        </div>
      </div>
    </div>
  )
}
