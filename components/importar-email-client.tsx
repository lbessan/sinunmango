'use client'

import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { Clipboard, CheckCircle, AlertCircle, Loader2, ChevronRight, CreditCard, ArrowLeft } from 'lucide-react'
import { CategoriaSelect } from '@/components/categoria-select'
import type { ParsedMov } from '@/lib/email-parsers'

const fmt = (n: number) => n.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const inputClass = 'w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm text-slate-800 outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-300 bg-white'
const labelClass = 'block text-xs font-medium text-slate-500 mb-1.5'

type Cuenta = {
  id: string
  nombre_cuenta: string
  tipo_cuenta: string
  moneda: string
  fecha_cierre_tarjeta: string | null
  fecha_vencimiento_tarjeta: string | null
}
type Categoria    = { id: string; nombre_categoria: string; icono: string | null; tipo_default?: string }
type Subcategoria = { id: string; categoria_padre: string; nombre_subcategoria: string }

// ─── Period calc (same logic as cuenta-movimientos-table) ─────────────────────
function calcularPeriodo(
  fechaStr: string,
  cierreDay: number | null,
  venceDay: number | null,
  isTarjeta: boolean
): string {
  const d = new Date(fechaStr + 'T12:00:00')
  let mes  = d.getMonth()
  let anio = d.getFullYear()
  if (isTarjeta && cierreDay && venceDay) {
    const day = d.getDate()
    if (day <= cierreDay) {
      if (venceDay <= cierreDay) mes += 1
    } else {
      if (venceDay > cierreDay) mes += 1
      else                       mes += 2
    }
    while (mes > 11) { mes -= 12; anio++ }
  }
  return `${anio}-${String(mes + 1).padStart(2, '0')}-01`
}

function addMeses(fechaStr: string, n: number): string {
  const d = new Date(fechaStr + 'T12:00:00')
  d.setMonth(d.getMonth() + n)
  return d.toISOString().slice(0, 10)
}

function formatPeriodo(p: string): string {
  return new Date(p + 'T12:00:00')
    .toLocaleDateString('es-AR', { month: 'long', year: 'numeric' })
    .replace(/^\w/, c => c.toUpperCase())
}

const FUENTE_LABEL: Record<ParsedMov['fuente'], string> = {
  infomistarjetas: 'infomistarjetas.com (BBVA / Banco Provincia)',
  mercadopago:     'Mercado Pago',
  desconocida:     'Formato desconocido',
}

// ─── Main component ───────────────────────────────────────────────────────────
export function ImportarEmailClient({ cuentas, categorias }: {
  cuentas:    Cuenta[]
  categorias: Categoria[]
}) {
  const router = useRouter()

  // Step state
  const [step, setStep]     = useState<'paste' | 'preview' | 'done'>('paste')
  const [texto, setTexto]   = useState('')
  const [parsed, setParsed] = useState<ParsedMov | null>(null)
  const [parseErr, setParseErr] = useState<string | null>(null)
  const [parsing, setParsing]   = useState(false)

  // Form state
  const [fecha,    setFecha]    = useState('')
  const [detalle,  setDetalle]  = useState('')
  const [monto,    setMonto]    = useState('')
  const [moneda,   setMoneda]   = useState<'ARS' | 'USD'>('ARS')
  const [cuotas,   setCuotas]   = useState(1)
  const [cuentaId, setCuentaId] = useState('')
  const [catId,    setCatId]    = useState('')
  const [subcatId, setSubcatId] = useState('')
  const [cotizacion, setCotizacion] = useState('')
  const [saving, setSaving] = useState(false)
  const [saveErr, setSaveErr] = useState<string | null>(null)

  // Derived cuenta info
  const cuenta = useMemo(() => cuentas.find(c => c.id === cuentaId), [cuentas, cuentaId])
  const isTarjeta = cuenta?.tipo_cuenta === 'Tarjeta Credito'
  const cierreDay = cuenta?.fecha_cierre_tarjeta
    ? new Date(cuenta.fecha_cierre_tarjeta + 'T12:00:00').getDate() : null
  const venceDay  = cuenta?.fecha_vencimiento_tarjeta
    ? new Date(cuenta.fecha_vencimiento_tarjeta + 'T12:00:00').getDate() : null

  // Period preview for first cuota
  const periodoActual = useMemo(() => {
    if (!fecha) return null
    return calcularPeriodo(fecha, cierreDay, venceDay, isTarjeta && moneda !== 'USD')
  }, [fecha, cierreDay, venceDay, isTarjeta, moneda])

  // ─── Parse handler ──────────────────────────────────────────────────────────
  const handleParse = async () => {
    if (!texto.trim()) return
    setParsing(true)
    setParseErr(null)

    const res = await fetch('/api/importar-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ texto }),
    })
    const json = await res.json()
    setParsing(false)

    if (!json.ok) { setParseErr(json.error); return }

    const d = json.data as ParsedMov
    setParsed(d)
    setFecha(d.fecha)
    setDetalle(d.detalle)
    setMonto(String(d.monto))
    setMoneda(d.moneda)
    setCuotas(d.cuotas)
    setCuentaId('')
    setCatId('')
    setSubcatId('')
    setStep('preview')
  }

  // ─── Save handler ───────────────────────────────────────────────────────────
  const handleSave = async () => {
    if (!cuentaId) { setSaveErr('Seleccioná la cuenta'); return }
    if (!monto || !fecha) { setSaveErr('Fecha y monto son obligatorios'); return }
    setSaving(true)
    setSaveErr(null)

    const montoNum   = parseFloat(monto)
    const montoCuota = cuotas > 1 ? montoNum / cuotas : montoNum
    const isUSD      = moneda === 'USD'
    const cotizNum   = isUSD && cotizacion ? parseFloat(cotizacion) : null

    const records = Array.from({ length: cuotas }, (_, i) => {
      const fechaCuota   = addMeses(fecha, i)
      const periodoCuota = calcularPeriodo(fechaCuota, cierreDay, venceDay, isTarjeta && !isUSD)
      return {
        id:              crypto.randomUUID(),
        fecha:           fechaCuota,
        detalle:         cuotas > 1 ? `${detalle} (Cuota ${i + 1}/${cuotas})` : detalle,
        monto:           montoCuota,
        moneda,
        tipo_movimiento: 'Gasto',
        cuenta_origen:   cuentaId,
        cuenta_destino:  null,
        categoria:       catId || null,
        subcategoria:    subcatId || null,
        cotizacion:      cotizNum,
        conciliado:      false,
        periodo_tarjeta: periodoCuota,
        cuotas_total:    cuotas,
        cuota_actual:    i + 1,
        ciclo_actual:    1,
      }
    })

    const res = await fetch('/api/movimientos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(records),
    })
    setSaving(false)

    if (!res.ok) {
      const j = await res.json()
      setSaveErr(j.error ?? 'Error al guardar')
      return
    }
    setStep('done')
  }

  // ─── Render: done ───────────────────────────────────────────────────────────
  if (step === 'done') {
    return (
      <div className="max-w-lg mx-auto bg-white rounded-2xl border border-slate-100 p-10 text-center space-y-4">
        <div className="w-14 h-14 rounded-full bg-emerald-50 flex items-center justify-center mx-auto">
          <CheckCircle className="text-emerald-500" size={28} />
        </div>
        <h2 className="text-lg font-semibold text-slate-800">
          {cuotas > 1 ? `${cuotas} cuotas guardadas` : 'Movimiento guardado'}
        </h2>
        <p className="text-sm text-slate-500">
          {detalle} · ${fmt(parseFloat(monto))} {moneda}
        </p>
        <div className="flex items-center justify-center gap-3 pt-2">
          <button
            onClick={() => { setStep('paste'); setTexto(''); setParsed(null) }}
            className="px-4 py-2 text-sm font-medium border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 transition-colors"
          >
            Importar otro
          </button>
          <button
            onClick={() => router.push('/movimientos')}
            className="px-4 py-2 text-sm font-medium text-white rounded-lg transition-colors"
            style={{ background: 'linear-gradient(90deg, var(--accent2, #1B3A6B), var(--accent, #1a6b5a))' }}
          >
            Ver movimientos
          </button>
        </div>
      </div>
    )
  }

  // ─── Render: preview ────────────────────────────────────────────────────────
  if (step === 'preview' && parsed) {
    return (
      <div className="max-w-xl mx-auto space-y-5">

        {/* Source badge */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => setStep('paste')}
            className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-700 transition-colors"
          >
            <ArrowLeft size={13} />Volver
          </button>
          <span className="text-xs bg-blue-50 text-blue-600 px-2.5 py-1 rounded-full font-medium">
            ✓ Detectado: {FUENTE_LABEL[parsed.fuente]}
          </span>
          {parsed.terminacion && (
            <span className="text-xs bg-slate-100 text-slate-500 px-2.5 py-1 rounded-full font-mono">
              ···· {parsed.terminacion}
            </span>
          )}
        </div>

        <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100 bg-slate-50">
            <p className="text-sm font-semibold text-slate-700">Confirmar movimiento</p>
            <p className="text-xs text-slate-400 mt-0.5">Revisá y ajustá los datos antes de guardar</p>
          </div>

          <div className="p-6 space-y-5">

            {/* Fecha + Detalle */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={labelClass}>Fecha</label>
                <input type="date" value={fecha} onChange={e => setFecha(e.target.value)}
                  className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>Cuotas</label>
                <input type="number" min={1} max={48} value={cuotas}
                  onChange={e => setCuotas(Math.max(1, parseInt(e.target.value) || 1))}
                  className={inputClass} />
              </div>
            </div>

            <div>
              <label className={labelClass}>Comercio / Descripción</label>
              <input type="text" value={detalle} onChange={e => setDetalle(e.target.value)}
                className={inputClass} placeholder="Descripción del gasto" />
            </div>

            {/* Monto + Moneda */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={labelClass}>Monto total</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm font-medium pointer-events-none">
                    {moneda === 'USD' ? 'US$' : '$'}
                  </span>
                  <input type="number" step="0.01" min={0} value={monto}
                    onChange={e => setMonto(e.target.value)}
                    className={`${inputClass} pl-8`} />
                </div>
                {cuotas > 1 && monto && (
                  <p className="text-xs text-slate-400 mt-1">
                    = ${fmt(parseFloat(monto) / cuotas)} / cuota
                  </p>
                )}
              </div>
              <div>
                <label className={labelClass}>Moneda</label>
                <select value={moneda} onChange={e => setMoneda(e.target.value as 'ARS' | 'USD')}
                  className={inputClass}>
                  <option value="ARS">ARS – Pesos</option>
                  <option value="USD">USD – Dólares</option>
                </select>
              </div>
            </div>

            {/* Cotización USD */}
            {moneda === 'USD' && (
              <div>
                <label className={labelClass}>Cotización (ARS por USD)</label>
                <input type="number" step="0.01" value={cotizacion}
                  onChange={e => setCotizacion(e.target.value)}
                  placeholder="Ej: 1410" className={inputClass} />
              </div>
            )}

            {/* Cuenta */}
            <div>
              <label className={labelClass}>
                Cuenta
                {parsed.terminacion && (
                  <span className="ml-2 text-slate-400 font-normal">
                    — la tarjeta termina en <span className="font-mono font-semibold text-slate-600">{parsed.terminacion}</span>
                  </span>
                )}
              </label>
              <select value={cuentaId} onChange={e => setCuentaId(e.target.value)} className={inputClass}>
                <option value="">— Seleccioná una cuenta —</option>
                {cuentas.map(c => (
                  <option key={c.id} value={c.id}>{c.nombre_cuenta} ({c.tipo_cuenta})</option>
                ))}
              </select>
            </div>

            {/* Period preview */}
            {isTarjeta && periodoActual && (
              <div className="bg-blue-50 border border-blue-100 rounded-xl px-4 py-3 text-xs text-blue-700">
                {cuotas <= 1 ? (
                  <>Período: <span className="font-semibold">{formatPeriodo(periodoActual)}</span></>
                ) : (
                  <>
                    <p className="font-medium mb-1">{cuotas} cuotas — distribución de períodos:</p>
                    <div className="space-y-0.5">
                      {Array.from({ length: cuotas }, (_, i) => {
                        const f = addMeses(fecha, i)
                        const p = calcularPeriodo(f, cierreDay, venceDay, true)
                        return (
                          <p key={i} className="text-blue-600">
                            Cuota {i + 1}: {formatPeriodo(p)}
                          </p>
                        )
                      })}
                    </div>
                  </>
                )}
              </div>
            )}

            {/* Categoría */}
            <div>
              <label className={labelClass}>Categoría</label>
              <CategoriaSelect
                categorias={categorias}
                value={catId}
                onChange={setCatId}
                filtroTipo="Gasto"
              />
            </div>

            {/* Error */}
            {saveErr && (
              <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2.5">
                <AlertCircle size={14} />
                {saveErr}
              </div>
            )}

            {/* Actions */}
            <div className="flex items-center justify-end gap-3 pt-1">
              <button
                onClick={() => setStep('paste')}
                className="px-4 py-2 text-sm font-medium border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex items-center gap-2 px-5 py-2 text-sm font-medium text-white rounded-lg transition-colors disabled:opacity-60"
                style={{ background: 'linear-gradient(90deg, var(--accent2, #1B3A6B), var(--accent, #1a6b5a))' }}
              >
                {saving
                  ? <><Loader2 size={14} className="animate-spin" />Guardando…</>
                  : <><CheckCircle size={14} />Guardar movimiento</>}
              </button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // ─── Render: paste ──────────────────────────────────────────────────────────
  return (
    <div className="max-w-2xl mx-auto space-y-5">

      {/* Instructions */}
      <div className="bg-blue-50 border border-blue-100 rounded-2xl p-5">
        <div className="flex items-start gap-3">
          <CreditCard className="text-blue-500 shrink-0 mt-0.5" size={18} />
          <div>
            <p className="text-sm font-semibold text-blue-800 mb-1">¿Cómo usarlo?</p>
            <p className="text-xs text-blue-700 leading-relaxed">
              Abrí el mail de notificación de tu tarjeta, seleccioná todo el texto del cuerpo
              (Ctrl+A en el mail abierto) y pegálo abajo. Funciona con emails de{' '}
              <strong>BBVA</strong>, <strong>Banco Provincia</strong> y{' '}
              <strong>Mercado Pago</strong>.
            </p>
          </div>
        </div>
      </div>

      {/* Paste area */}
      <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold text-slate-700">Pegá el texto del email</p>
            <p className="text-xs text-slate-400 mt-0.5">Copiá el cuerpo completo del mail de notificación</p>
          </div>
          <Clipboard size={16} className="text-slate-300" />
        </div>
        <div className="p-6 space-y-4">
          <textarea
            value={texto}
            onChange={e => { setTexto(e.target.value); setParseErr(null) }}
            placeholder={`Ejemplo (BBVA/Banco Provincia):
Queremos informarte que registramos una autorización de consumo de $ 53.592,40 en el establecimiento OPENPAY*LOS CINCO PINOS , el día 14/04/2026 a las 18:29hs con la tarjeta de L BESSAN NOFAL finalizada en 1955

Ejemplo (Mercado Pago):
Le compraste a Zentra
Pagaste $ 420.690
Tarjeta Mercado Pago Crédito **** 5783
9 cuotas de $ 46.743,33`}
            rows={8}
            className="w-full px-4 py-3 border border-slate-200 rounded-xl text-sm text-slate-700 outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-300 bg-slate-50 resize-none font-mono leading-relaxed"
          />

          {parseErr && (
            <div className="flex items-start gap-2 text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2.5">
              <AlertCircle size={14} className="shrink-0 mt-0.5" />
              <span>{parseErr}</span>
            </div>
          )}

          <div className="flex justify-end">
            <button
              onClick={handleParse}
              disabled={!texto.trim() || parsing}
              className="flex items-center gap-2 px-5 py-2.5 text-sm font-medium text-white rounded-xl transition-colors disabled:opacity-50"
              style={{ background: 'linear-gradient(90deg, var(--accent2, #1B3A6B), var(--accent, #1a6b5a))' }}
            >
              {parsing
                ? <><Loader2 size={14} className="animate-spin" />Analizando…</>
                : <>Analizar email <ChevronRight size={14} /></>}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
