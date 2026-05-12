'use client'

// ─── Modal: cargar ingresos futuros en bulk ──────────────────────────────────
//
// Form simple: cuenta + monto + detalle + categoría + día + cantidad de meses.
// Crea N movimientos de Ingreso, uno por mes, en el día indicado.
// Usado desde el Dashboard cerca de "Proyecciones Mensuales".

import { useState } from 'react'
import { X, Calendar, Banknote, Tag, Loader2, CheckCircle2 } from 'lucide-react'
import { useRouter } from 'next/navigation'

export type CuentaParaIngreso    = { id: string; nombre_cuenta: string | null; tipo_cuenta: string | null }
export type CategoriaParaIngreso = { id: string; nombre_categoria: string | null; icono: string | null; tipo_default: string | null }

export function CargarIngresosModal({
  open,
  onClose,
  cuentas,
  categorias,
}: {
  open:       boolean
  onClose:    () => void
  cuentas:    CuentaParaIngreso[]
  categorias: CategoriaParaIngreso[]
}) {
  const router = useRouter()
  const [cuenta,    setCuenta]    = useState('')
  const [monto,     setMonto]     = useState('')
  const [moneda,    setMoneda]    = useState<'ARS' | 'USD'>('ARS')
  const [detalle,   setDetalle]   = useState('Sueldo')
  const [categoria, setCategoria] = useState('')
  const [dia,       setDia]       = useState('1')
  const [meses,     setMeses]     = useState('12')

  const [saving,  setSaving]  = useState(false)
  const [success, setSuccess] = useState<number | null>(null)
  const [error,   setError]   = useState<string | null>(null)

  const hoy = new Date()
  const diaInt = parseInt(dia) || 1
  const yaPasoEsteMes = hoy.getDate() > diaInt
  const mesInicio = yaPasoEsteMes
    ? new Date(hoy.getFullYear(), hoy.getMonth() + 1, 1)
    : new Date(hoy.getFullYear(), hoy.getMonth(), 1)
  const mesInicioStr = `${mesInicio.getFullYear()}-${String(mesInicio.getMonth() + 1).padStart(2, '0')}`
  const mesInicioLabel = mesInicio.toLocaleDateString('es-AR', { month: 'long', year: 'numeric' })

  const catsIngreso  = categorias.filter(c => c.tipo_default === 'Ingreso' || c.tipo_default === null)
  const cuentasAptas = cuentas.filter(c => c.tipo_cuenta !== 'Tarjeta Credito')

  const submit = async () => {
    setSaving(true)
    setError(null)
    try {
      const res = await fetch('/api/ingresos-bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cuenta_origen:  cuenta,
          monto:          parseFloat(monto),
          moneda,
          detalle,
          categoria:      categoria || null,
          dia:            diaInt,
          mes_inicio:     mesInicioStr,
          cantidad_meses: parseInt(meses),
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? 'No se pudo guardar')
        setSaving(false)
        return
      }
      setSuccess(data.creados)
      setSaving(false)
      setTimeout(() => {
        router.refresh()
        onClose()
        setSuccess(null)
      }, 1500)
    } catch {
      setError('Error de red')
      setSaving(false)
    }
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl max-w-lg w-full p-6 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-start justify-between mb-5">
          <div>
            <p className="text-base font-bold text-slate-800">Cargar ingresos futuros</p>
            <p className="text-xs text-slate-500 mt-0.5">
              Crea {parseInt(meses) || 0} movimientos de ingreso recurrente
            </p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 p-1">
            <X size={18} />
          </button>
        </div>

        {success !== null ? (
          <div className="text-center py-8">
            <div className="w-12 h-12 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto mb-3">
              <CheckCircle2 size={24} />
            </div>
            <p className="text-base font-bold text-slate-800">¡Listo! Creaste {success} ingresos</p>
            <p className="text-xs text-slate-500 mt-1">Se van a reflejar en tu proyección en un momento</p>
          </div>
        ) : (
          <>
            <div className="space-y-4">
              <Field label="Cuenta donde se acredita" icon={<Banknote size={13} />}>
                <select
                  value={cuenta}
                  onChange={e => setCuenta(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm outline-none focus:ring-2 focus:ring-indigo-100 focus:border-indigo-300"
                >
                  <option value="">Elegí una cuenta</option>
                  {cuentasAptas.map(c => (
                    <option key={c.id} value={c.id}>{c.nombre_cuenta} · {c.tipo_cuenta}</option>
                  ))}
                </select>
              </Field>

              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-2">
                  <Field label="Monto por mes" icon={<Banknote size={13} />}>
                    <input
                      type="number"
                      value={monto}
                      onChange={e => setMonto(e.target.value)}
                      placeholder="Ej: 5000000"
                      className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm outline-none focus:ring-2 focus:ring-indigo-100 focus:border-indigo-300"
                    />
                  </Field>
                </div>
                <div>
                  <Field label="Moneda">
                    <select
                      value={moneda}
                      onChange={e => setMoneda(e.target.value as 'ARS' | 'USD')}
                      className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm outline-none focus:ring-2 focus:ring-indigo-100 focus:border-indigo-300"
                    >
                      <option value="ARS">ARS</option>
                      <option value="USD">USD</option>
                    </select>
                  </Field>
                </div>
              </div>

              <Field label="Detalle">
                <input
                  type="text"
                  value={detalle}
                  onChange={e => setDetalle(e.target.value)}
                  placeholder="Ej: Sueldo, Freelance, Alquiler dpto"
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm outline-none focus:ring-2 focus:ring-indigo-100 focus:border-indigo-300"
                />
              </Field>

              {catsIngreso.length > 0 && (
                <Field label="Categoría (opcional)" icon={<Tag size={13} />}>
                  <select
                    value={categoria}
                    onChange={e => setCategoria(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm outline-none focus:ring-2 focus:ring-indigo-100 focus:border-indigo-300"
                  >
                    <option value="">Sin categoría</option>
                    {catsIngreso.map(c => (
                      <option key={c.id} value={c.id}>{c.nombre_categoria}</option>
                    ))}
                  </select>
                </Field>
              )}

              <div className="grid grid-cols-2 gap-3">
                <Field label="Día del mes" icon={<Calendar size={13} />}>
                  <input
                    type="number"
                    min="1"
                    max="31"
                    value={dia}
                    onChange={e => setDia(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm outline-none focus:ring-2 focus:ring-indigo-100 focus:border-indigo-300"
                  />
                </Field>
                <Field label="Cantidad de meses">
                  <input
                    type="number"
                    min="1"
                    max="24"
                    value={meses}
                    onChange={e => setMeses(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm outline-none focus:ring-2 focus:ring-indigo-100 focus:border-indigo-300"
                  />
                </Field>
              </div>

              <div className="bg-slate-50 rounded-lg p-3 text-xs text-slate-600">
                <p className="font-medium text-slate-700 mb-1">Vista previa</p>
                <p>
                  Vas a crear <strong>{parseInt(meses) || 0} ingresos</strong> de <strong>{moneda} ${monto || '0'}</strong>,
                  uno por mes el día <strong>{diaInt}</strong>, empezando en <strong>{mesInicioLabel}</strong>.
                </p>
              </div>

              {error && (
                <p className="text-xs text-red-600 bg-red-50 rounded-lg p-3 border border-red-100">{error}</p>
              )}
            </div>

            <div className="flex justify-end gap-2 mt-6">
              <button
                onClick={onClose}
                className="px-4 py-2 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-50"
              >
                Cancelar
              </button>
              <button
                onClick={submit}
                disabled={saving || !cuenta || !monto || !detalle}
                className="px-4 py-2 rounded-lg text-sm font-semibold text-white flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                style={{ background: 'linear-gradient(90deg, #6366f1, #8b5cf6)' }}
              >
                {saving && <Loader2 size={14} className="animate-spin" />}
                {saving ? 'Creando...' : 'Cargar ingresos'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function Field({ label, icon, children }: { label: string; icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div>
      <label className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-500 uppercase tracking-widest mb-1.5">
        {icon}{label}
      </label>
      {children}
    </div>
  )
}
