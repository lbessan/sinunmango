'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ImagenUploader } from './imagen-uploader'
import { BankSelector } from './bank-selector'
import { bankIconUrl, bankBannerUrl, type BankEntry } from '@/constants/banks'
import { DeleteButton } from './delete-button'

type CuentaForm = {
  id?: string
  nombre_cuenta: string
  institucion: string
  moneda: string
  tipo_cuenta: string
  saldo_inicial: string
  activa: boolean
  imagen_url: string
  imagen_banner_url: string
  color_primario: string
  terminacion_tarjeta: string
}

// ─── Helpers tipo de cuenta ───────────────────────────────────────────────────
// Tipos almacenados: 'Banco CA', 'Banco CC', 'Billetera', 'Efectivo', 'Tarjeta Credito'.
// Si llegara una cuenta vieja con valor desconocido, defaulteamos a Banco CA y el
// usuario tiene que elegir un tipo válido al guardar.

type TipoPrincipal = 'Banco' | 'Billetera' | 'Efectivo'

function parseTipoInicial(tipo: string): { principal: TipoPrincipal; subtipo: 'CA' | 'CC' } {
  if (tipo === 'Banco CC')   return { principal: 'Banco',    subtipo: 'CC' }
  if (tipo === 'Banco CA')   return { principal: 'Banco',    subtipo: 'CA' }
  if (tipo === 'Efectivo')   return { principal: 'Efectivo', subtipo: 'CA' }
  if (tipo === 'Billetera')  return { principal: 'Billetera', subtipo: 'CA' }
  // Default seguro para valores desconocidos (incluye legacy 'Billetera/Banco')
  return { principal: 'Banco', subtipo: 'CA' }
}

const inputClass = 'w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm text-slate-800 outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-300 bg-white'
const labelClass = 'block text-xs font-medium text-slate-500 mb-1.5'

export function CuentaFormClient({
  inicial,
  onSuccess,
  title,
}: {
  inicial: CuentaForm
  /** Si se define, se llama al guardar exitosamente en lugar de redirigir a /cuentas */
  onSuccess?: () => void
  /** Título opcional (por defecto "Nueva cuenta" / "Editar cuenta") */
  title?: string
}) {
  const router = useRouter()
  const [form, setForm]     = useState<CuentaForm>(inicial)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved]   = useState(false)
  const [error, setError]   = useState('')
  const [selectedBank, setSelectedBank] = useState<BankEntry | null>(null)

  // ── Tipo de cuenta: dos niveles ─────────────────────────────────────────────
  const { principal: initPrincipal, subtipo: initSubtipo } = parseTipoInicial(inicial.tipo_cuenta)
  const [tipoPrincipal, setTipoPrincipal] = useState<TipoPrincipal>(initPrincipal)
  const [subtipoBanco,  setSubtipoBanco]  = useState<'CA' | 'CC'>(initSubtipo)

  // El tipo que se guarda en la BD: 'Banco CA' | 'Banco CC' | 'Billetera' | 'Efectivo'
  const tipoFinal =
    tipoPrincipal === 'Banco' ? `Banco ${subtipoBanco}` : tipoPrincipal

  const set = (k: keyof CuentaForm, v: string | boolean) =>
    setForm(prev => ({ ...prev, [k]: v }))

  // Cuando el usuario selecciona un banco: auto-complete nombre, institución, color e imagen
  const handleBankChange = (bank: BankEntry) => {
    setSelectedBank(bank.id ? bank : null)
    if (!bank.id) return
    if (!form.nombre_cuenta) set('nombre_cuenta', bank.nombre)
    set('institucion',       bank.nombre)
    set('color_primario',    bank.color)
    set('imagen_url',        bankIconUrl(bank.id))
    set('imagen_banner_url', bankBannerUrl(bank.id))
  }

  const isEditing = !!form.id

  const handleGuardar = async () => {
    if (!form.nombre_cuenta || !form.tipo_cuenta || !form.moneda) {
      setError('Completá los campos obligatorios')
      return
    }
    setSaving(true)
    setError('')

    const body = {
      nombre_cuenta:       form.nombre_cuenta,
      institucion:         form.institucion || null,
      moneda:              form.moneda,
      tipo_cuenta:         tipoFinal,
      saldo_inicial:       parseFloat(form.saldo_inicial) || 0,
      activa:              form.activa,
      imagen_url:          form.imagen_url || null,
      imagen_banner_url:   form.imagen_banner_url || null,
      color_primario:      form.color_primario || '#0d3b6e',
      terminacion_tarjeta: form.terminacion_tarjeta?.trim() || null,
    }

    const res = await fetch(
      isEditing ? `/api/cuentas/${form.id}` : '/api/cuentas',
      { method: isEditing ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
    )

    setSaving(false)
    if (res.ok) {
      setSaved(true)
      setTimeout(() => {
        if (onSuccess) onSuccess()
        else router.push('/cuentas')
      }, 800)
    } else { const d = await res.json(); setError(d.error ?? 'Error al guardar') }
  }

  return (
    <div className="max-w-lg mx-auto">
      <h1 className="text-xl font-semibold text-slate-800 mb-6">
        {title ?? (isEditing ? 'Editar cuenta' : 'Nueva cuenta')}
      </h1>

      <div className="bg-white rounded-2xl border border-slate-100 p-4 sm:p-6 space-y-5">

        {/* ── Tipo de cuenta — primero de todo porque cambia qué inputs
            aparecen abajo (BankSelector solo para Banco/Billetera; subtipo
            CA/CC solo para Banco). Chips grandes en vez de un <select>
            chiquito enterrado: los users no encontraban el selector y
            terminaban creando todo como "Banco" por default. */}
        <div>
          <label className={labelClass}>¿Qué tipo de cuenta es? *</label>
          <div className="grid grid-cols-3 gap-2">
            {(['Banco', 'Billetera', 'Efectivo'] as TipoPrincipal[]).map(t => {
              const active = tipoPrincipal === t
              const label  = t === 'Billetera' ? 'Billetera virtual' : t
              return (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTipoPrincipal(t)}
                  className="py-2.5 rounded-xl text-sm font-medium border transition-colors"
                  style={{
                    background: active ? 'var(--accent, #1a6b5a)' : 'white',
                    color:      active ? 'white' : '#475569',
                    borderColor: active ? 'var(--accent, #1a6b5a)' : '#e2e8f0',
                  }}
                >
                  {label}
                </button>
              )
            })}
          </div>
          {/* Subtipo solo para Banco */}
          {tipoPrincipal === 'Banco' && (
            <div className="mt-3 grid grid-cols-2 gap-2">
              {([
                { v: 'CA' as const, label: 'Caja de Ahorro' },
                { v: 'CC' as const, label: 'Cuenta Corriente' },
              ]).map(({ v, label }) => {
                const active = subtipoBanco === v
                return (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setSubtipoBanco(v)}
                    className="py-2 rounded-lg text-xs font-medium border transition-colors"
                    style={{
                      background: active ? '#f1f5f9' : 'white',
                      color:      active ? '#0f172a' : '#64748b',
                      borderColor: active ? '#cbd5e1' : '#e2e8f0',
                    }}
                  >
                    {label}
                  </button>
                )
              })}
            </div>
          )}
        </div>

        {/* ── Selector de banco / billetera ── */}
        {tipoPrincipal !== 'Efectivo' && (
          <BankSelector
            value={selectedBank?.id ?? ''}
            onChange={handleBankChange}
            label={
              tipoPrincipal === 'Banco'    ? 'Banco emisor' :
              tipoPrincipal === 'Billetera'? 'Billetera virtual' :
              'Banco o billetera'
            }
          />
        )}

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
          <label className={labelClass}>
            Color de marca
            {selectedBank && (
              <span className="ml-2 text-emerald-500 font-normal normal-case">— asignado automáticamente</span>
            )}
          </label>
          <div className="flex items-center gap-3">
            <input type="color" value={form.color_primario}
              onChange={e => set('color_primario', e.target.value)}
              className="w-10 h-10 rounded-lg border border-slate-200 cursor-pointer p-0.5" />
            <input type="text" value={form.color_primario}
              onChange={e => set('color_primario', e.target.value)}
              placeholder="#004999"
              className="flex-1 px-3 py-2 border border-slate-200 rounded-lg text-sm font-mono outline-none" />
            <div className="w-10 h-10 rounded-lg shrink-0" style={{ background: form.color_primario }} />
          </div>
        </div>

        {/* Imágenes — stack en mobile da más ancho a cada uploader para
            mejor preview. En sm+ vuelve a 2 columnas. */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
          PNG con fondo transparente para mejor resultado.
        </p>

        {/* Datos */}
        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2">
            <label className={labelClass}>Nombre *</label>
            <input type="text" value={form.nombre_cuenta}
              onChange={e => set('nombre_cuenta', e.target.value)}
              placeholder="Ej: CA Galicia" className={inputClass} />
          </div>
          <div className="col-span-2">
            <label className={labelClass}>Institución</label>
            <input type="text" value={form.institucion}
              onChange={e => set('institucion', e.target.value)}
              placeholder="Ej: Banco Galicia" className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>Moneda *</label>
            <select value={form.moneda} onChange={e => set('moneda', e.target.value)} className={inputClass}>
              <option value="ARS">ARS</option>
              <option value="USD">USD</option>
            </select>
          </div>
          <div>
            <label className={labelClass}>Saldo inicial</label>
            <input type="number" step="0.01" value={form.saldo_inicial}
              onChange={e => set('saldo_inicial', e.target.value)}
              placeholder="0.00" className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>Terminación (últimos 4 dígitos)</label>
            <input
              type="text"
              maxLength={4}
              value={form.terminacion_tarjeta}
              onChange={e => set('terminacion_tarjeta', e.target.value.replace(/\D/g, '').slice(0, 4))}
              placeholder="Ej: 6837"
              className={inputClass}
            />
            <p className="text-xs text-slate-400 mt-1">Necesario para importar movimientos automáticamente por email.</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <input type="checkbox" id="activa" checked={form.activa}
            onChange={e => set('activa', e.target.checked)} className="w-4 h-4" />
          <label htmlFor="activa" className="text-sm text-slate-600 cursor-pointer">Cuenta activa</label>
        </div>

        {error && <p className="text-sm text-red-500 bg-red-50 px-4 py-2 rounded-lg">{error}</p>}

        {/* py-3 = ~44px touch target en mobile. */}
        <div className="flex gap-3">
          <button onClick={() => router.back()}
            className="flex-1 py-3 rounded-lg text-sm font-medium border border-slate-200 text-slate-600 hover:bg-slate-50">
            Cancelar
          </button>
          <button onClick={handleGuardar} disabled={saving || saved}
            className="flex-1 py-3 rounded-lg text-sm font-medium text-white"
            style={{ background: saved ? '#16a34a' : 'linear-gradient(90deg, var(--accent2, #1B3A6B), var(--accent, #1a6b5a))', opacity: saving ? 0.7 : 1 }}
          >
            {saved ? '✓ Guardado' : saving ? 'Guardando...' : isEditing ? 'Guardar cambios' : 'Crear cuenta'}
          </button>
        </div>

        {isEditing && form.id && (
          <div className="pt-2 border-t border-slate-100">
            <DeleteButton
              endpoint={inicial.tipo_cuenta === 'Tarjeta Credito' ? `/api/tarjetas/${form.id}` : `/api/cuentas/${form.id}`}
              label={form.nombre_cuenta}
              description={inicial.tipo_cuenta === 'Tarjeta Credito'
                ? 'La tarjeta se desactivará. Los movimientos existentes se conservan.'
                : 'La cuenta se desactivará. El historial de movimientos se conserva.'}
              variant="button"
              redirectTo={inicial.tipo_cuenta === 'Tarjeta Credito' ? '/tarjetas' : '/cuentas'}
            />
          </div>
        )}
      </div>
    </div>
  )
}
