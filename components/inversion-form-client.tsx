'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { todayAR } from '@/lib/timezone'

type Cuenta = { id: string; nombre_cuenta: string; tipo_cuenta: string }
type Categoria = { id: string; nombre_categoria: string; tipo_default: string }

const TIPOS = [
  { value: 'plazo_fijo',     label: '🏦 Plazo Fijo',        sub: 'Tradicional o UVA' },
  { value: 'fci',            label: '📊 FCI',               sub: 'Money Market, Renta Fija/Variable' },
  { value: 'dolar',          label: '💵 Dólar físico',       sub: 'Billete, MEP, Blue' },
  { value: 'crypto',         label: '₿ Crypto',             sub: 'BTC, ETH, USDT, USDC...' },
  { value: 'cedear',         label: '🌎 CEDEAR',            sub: 'AAPL, MSFT, GOOGL...' },
  { value: 'accion',         label: '📉 Acción Merval',      sub: 'YPFD, GGAL, BBAR...' },
  { value: 'bono',           label: '📜 Bono soberano',     sub: 'GD30, AL30, GD35...' },
  { value: 'on',             label: '🏢 ON corporativa',    sub: 'YPF, Pampa, TGS...' },
  { value: 'otro',           label: '➕ Otro',              sub: 'Inmueble, préstamo, etc.' },
] as const

type TipoInversion = typeof TIPOS[number]['value']

const inputClass = 'w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm text-slate-800 outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-300 bg-white'
const labelClass = 'block text-xs font-medium text-slate-500 mb-1.5'
const fmt = (n: number) => n.toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })

// ─── Helpers de cálculo ────────────────────────────────────────────────────────
function calcularRendimientoPF(capital: number, tna: number, dias: number): number {
  return Math.round(capital * (tna / 100 / 365) * dias)
}

function estimarValorActual(tipo: TipoInversion, datos: Record<string, string>, capital: number): number | null {
  if (tipo === 'plazo_fijo') {
    const tna  = parseFloat(datos.tna ?? '0')
    const dias = parseInt(datos.plazo_dias ?? '0', 10)
    if (tna > 0 && dias > 0) return capital + calcularRendimientoPF(capital, tna, dias)
  }
  if (tipo === 'fci') {
    const cuotapartes    = parseFloat(datos.cuotapartes ?? '0')
    const precioActual   = parseFloat(datos.precio_actual ?? '0')
    if (cuotapartes > 0 && precioActual > 0) return Math.round(cuotapartes * precioActual)
  }
  if (tipo === 'dolar') {
    const cantidad        = parseFloat(datos.cantidad_usd ?? '0')
    const cotizacionActual = parseFloat(datos.cotizacion_actual ?? '0')
    if (cantidad > 0 && cotizacionActual > 0) return Math.round(cantidad * cotizacionActual)
  }
  return null
}

export function InversionFormClient({
  cuentas,
  categorias,
  dolar,
}: {
  cuentas: Cuenta[]
  categorias: Categoria[]
  dolar: number
}) {
  const router = useRouter()
  const [tipo, setTipo]           = useState<TipoInversion>('plazo_fijo')
  const [nombre, setNombre]       = useState('')
  const [fechaInicio, setFechaInicio] = useState(todayAR())
  const [fechaVence, setFechaVence]   = useState('')
  const [moneda, setMoneda]       = useState<'ARS' | 'USD'>('ARS')
  const [capital, setCapital]     = useState('')
  const [cuentaId, setCuentaId]   = useState('')
  const [categoriaId, setCategoriaId] = useState('')
  const [datos, setDatos]         = useState<Record<string, string>>({})
  const [notas, setNotas]         = useState('')
  const [saving, setSaving]       = useState(false)
  const [saved, setSaved]         = useState(false)
  const [error, setError]         = useState('')

  const setDato = (k: string, v: string) => setDatos(p => ({ ...p, [k]: v }))

  // Calcular fecha de vencimiento automática para PF
  const handlePlazoChange = (dias: string) => {
    setDato('plazo_dias', dias)
    const d = parseInt(dias, 10)
    if (!isNaN(d) && d > 0 && fechaInicio) {
      const vence = new Date(fechaInicio)
      vence.setDate(vence.getDate() + d)
      setFechaVence(vence.toISOString().slice(0, 10))
    }
  }

  // Calcular cuotapartes al suscribir FCI
  const handleFCICapitalChange = (v: string) => {
    setCapital(v)
    const monto  = parseFloat(v)
    const precio = parseFloat(datos.precio_compra ?? '0')
    if (monto > 0 && precio > 0) {
      setDato('cuotapartes', (monto / precio).toFixed(6))
    }
  }

  // Rendimiento estimado (preview)
  const capitalNum    = parseFloat(capital) || 0
  const valorEstimado = estimarValorActual(tipo, datos, capitalNum)
  const rendEstimado  = valorEstimado !== null ? valorEstimado - capitalNum : null

  const categoriasFiltradas = categorias.filter(c => c.tipo_default === 'Gasto')

  const handleGuardar = async () => {
    if (!capital || parseFloat(capital) <= 0) { setError('Ingresá el capital invertido'); return }
    setSaving(true)
    setError('')

    // Combinar datos específicos + defaults
    const datosFinales: Record<string, unknown> = { ...datos }

    const res = await fetch('/api/inversiones', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tipo,
        nombre:            nombre || null,
        fecha_inicio:      fechaInicio,
        fecha_vencimiento: fechaVence || null,
        moneda,
        capital_inicial:   parseFloat(capital),
        datos:             datosFinales,
        notas:             notas || null,
        cuenta_origen_id:  cuentaId || null,
        categoria_id:      categoriaId || null,
      }),
    })

    setSaving(false)
    if (res.ok) {
      setSaved(true)
      setTimeout(() => { router.push('/inversiones'); router.refresh() }, 900)
    } else {
      const d = await res.json()
      setError(d.error ?? 'Error al guardar')
    }
  }

  const tipoInfo = TIPOS.find(t => t.value === tipo)!

  return (
    <div className="max-w-2xl mx-auto space-y-6">

      {/* Selector de tipo */}
      <div className="bg-white rounded-2xl border border-slate-100 p-5">
        <p className={labelClass}>Tipo de inversión</p>
        <div className="grid grid-cols-3 gap-2">
          {TIPOS.map(t => (
            <button
              key={t.value}
              onClick={() => { setTipo(t.value); setDatos({}) }}
              className={`text-left px-3 py-2.5 rounded-xl border text-sm transition-all ${
                tipo === t.value
                  ? 'border-blue-300 bg-blue-50 text-blue-800'
                  : 'border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-50'
              }`}
            >
              <div className="font-semibold text-xs leading-tight">{t.label}</div>
              <div className="text-[10px] text-slate-400 mt-0.5 leading-tight">{t.sub}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Datos comunes */}
      <div className="bg-white rounded-2xl border border-slate-100 p-5 space-y-4">
        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Datos generales</p>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={labelClass}>Nombre / Etiqueta <span className="text-slate-400">(opcional)</span></label>
            <input
              type="text"
              value={nombre}
              onChange={e => setNombre(e.target.value)}
              placeholder={`Ej: ${tipoInfo.label.split(' ').slice(1).join(' ')} junio`}
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass}>Fecha de inicio</label>
            <input type="date" value={fechaInicio} onChange={e => setFechaInicio(e.target.value)} className={inputClass} />
          </div>
        </div>

        <div className="grid grid-cols-3 gap-4">
          <div>
            <label className={labelClass}>Moneda</label>
            <select value={moneda} onChange={e => setMoneda(e.target.value as 'ARS' | 'USD')} className={inputClass}>
              <option value="ARS">ARS</option>
              <option value="USD">USD</option>
            </select>
          </div>
          <div className="col-span-2">
            <label className={labelClass}>Capital invertido {moneda === 'USD' && <span className="text-amber-600">(~ ${fmt(parseFloat(capital || '0') * dolar)} ARS)</span>}</label>
            <input
              type="number" step="0.01"
              value={tipo === 'fci' ? capital : capital}
              onChange={e => tipo === 'fci' ? handleFCICapitalChange(e.target.value) : setCapital(e.target.value)}
              placeholder="0"
              className={`${inputClass} font-mono text-lg`}
            />
          </div>
        </div>

        {/* Cuenta origen */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={labelClass}>Cuenta de origen <span className="text-slate-400">(opcional)</span></label>
            <select value={cuentaId} onChange={e => setCuentaId(e.target.value)} className={inputClass}>
              <option value="">— no registrar salida —</option>
              {cuentas.filter(c => c.tipo_cuenta !== 'Tarjeta Credito').map(c => (
                <option key={c.id} value={c.id}>{c.nombre_cuenta}</option>
              ))}
            </select>
            {cuentaId && <p className="text-xs text-blue-600 mt-1">✓ Se registrará movimiento de salida automáticamente</p>}
          </div>
          <div>
            <label className={labelClass}>Categoría del movimiento</label>
            <select value={categoriaId} onChange={e => setCategoriaId(e.target.value)} className={inputClass} disabled={!cuentaId}>
              <option value="">— elegir —</option>
              {categoriasFiltradas.map(c => (
                <option key={c.id} value={c.id}>{c.nombre_categoria}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* ── Campos específicos por tipo ───────────────────────────────────────── */}

      {/* PLAZO FIJO */}
      {tipo === 'plazo_fijo' && (
        <div className="bg-white rounded-2xl border border-slate-100 p-5 space-y-4">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Datos del Plazo Fijo</p>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>Subtipo</label>
              <select value={datos.tipo_pf ?? 'tradicional'} onChange={e => setDato('tipo_pf', e.target.value)} className={inputClass}>
                <option value="tradicional">Tradicional (TNA fija)</option>
                <option value="uva">UVA (ajusta por inflación)</option>
              </select>
            </div>
            <div>
              <label className={labelClass}>Banco / Entidad</label>
              <input type="text" value={datos.banco ?? ''} onChange={e => setDato('banco', e.target.value)} placeholder="Ej: Galicia, Nación, BBVA" className={inputClass} />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className={labelClass}>TNA {datos.tipo_pf === 'uva' ? '(spread sobre UVA)' : ''} (%)</label>
              <input type="number" step="0.01" value={datos.tna ?? ''} onChange={e => setDato('tna', e.target.value)} placeholder="Ej: 18.5" className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>Plazo (días)</label>
              <input type="number" value={datos.plazo_dias ?? ''} onChange={e => handlePlazoChange(e.target.value)} placeholder="Ej: 30" className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>Fecha de vencimiento</label>
              <input type="date" value={fechaVence} onChange={e => setFechaVence(e.target.value)} className={inputClass} />
            </div>
          </div>

          {datos.tipo_pf === 'uva' && (
            <div>
              <label className={labelClass}>Valor UVA al inicio</label>
              <input type="number" step="0.01" value={datos.valor_uva_inicio ?? ''} onChange={e => setDato('valor_uva_inicio', e.target.value)} placeholder="Ej: 1709.15" className={inputClass} />
              <p className="text-xs text-slate-400 mt-1">Consultá el valor actual en bcra.gob.ar</p>
            </div>
          )}

          {/* Preview rendimiento */}
          {capitalNum > 0 && parseFloat(datos.tna ?? '0') > 0 && parseInt(datos.plazo_dias ?? '0', 10) > 0 && (
            <div className="bg-emerald-50 border border-emerald-100 rounded-xl px-4 py-3">
              <p className="text-xs text-emerald-700 font-medium">
                Intereses estimados: <span className="font-bold text-base">${fmt(calcularRendimientoPF(capitalNum, parseFloat(datos.tna), parseInt(datos.plazo_dias, 10)))}</span>
                {' '}→ Total al vencer: <span className="font-bold">${fmt(capitalNum + calcularRendimientoPF(capitalNum, parseFloat(datos.tna), parseInt(datos.plazo_dias, 10)))}</span>
              </p>
            </div>
          )}
        </div>
      )}

      {/* FCI */}
      {tipo === 'fci' && (
        <div className="bg-white rounded-2xl border border-slate-100 p-5 space-y-4">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Datos del FCI</p>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>Nombre del fondo</label>
              <input type="text" value={datos.nombre_fondo ?? ''} onChange={e => setDato('nombre_fondo', e.target.value)} placeholder="Ej: Pellegrini Pesos" className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>Administradora</label>
              <input type="text" value={datos.administradora ?? ''} onChange={e => setDato('administradora', e.target.value)} placeholder="Ej: Pellegrini, BBVA, Balanz" className={inputClass} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>Tipo de FCI</label>
              <select value={datos.tipo_fci ?? 'money_market'} onChange={e => setDato('tipo_fci', e.target.value)} className={inputClass}>
                <option value="money_market">Money Market (T+0)</option>
                <option value="renta_fija">Renta Fija (T+1)</option>
                <option value="renta_variable">Renta Variable (T+2)</option>
                <option value="mixto">Mixto</option>
              </select>
            </div>
            <div>
              <label className={labelClass}>Precio de compra (por cuotaparte)</label>
              <input
                type="number" step="0.000001"
                value={datos.precio_compra ?? ''}
                onChange={e => {
                  setDato('precio_compra', e.target.value)
                  const precio = parseFloat(e.target.value)
                  if (capitalNum > 0 && precio > 0) setDato('cuotapartes', (capitalNum / precio).toFixed(6))
                }}
                placeholder="Ej: 1.52345678"
                className={inputClass}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>Cuotapartes</label>
              <input type="number" step="0.000001" value={datos.cuotapartes ?? ''} onChange={e => setDato('cuotapartes', e.target.value)} placeholder="Auto-calculado" className={`${inputClass} bg-slate-50`} />
            </div>
            <div>
              <label className={labelClass}>Precio actual (por cuotaparte)</label>
              <input type="number" step="0.000001" value={datos.precio_actual ?? ''} onChange={e => setDato('precio_actual', e.target.value)} placeholder="Para calcular rendimiento" className={inputClass} />
            </div>
          </div>
        </div>
      )}

      {/* DÓLAR FÍSICO */}
      {tipo === 'dolar' && (
        <div className="bg-white rounded-2xl border border-slate-100 p-5 space-y-4">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Datos del Dólar</p>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className={labelClass}>Cantidad (USD)</label>
              <input type="number" step="1" value={datos.cantidad_usd ?? ''} onChange={e => {
                setDato('cantidad_usd', e.target.value)
                const c = parseFloat(datos.cotizacion_compra ?? '0')
                if (c > 0) setCapital((parseFloat(e.target.value) * c).toFixed(2))
              }} placeholder="Ej: 500" className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>Cotización de compra (ARS/USD)</label>
              <input type="number" step="0.01" value={datos.cotizacion_compra ?? ''} onChange={e => {
                setDato('cotizacion_compra', e.target.value)
                const q = parseFloat(datos.cantidad_usd ?? '0')
                if (q > 0) setCapital((q * parseFloat(e.target.value)).toFixed(2))
              }} placeholder={`Ej: ${fmt(dolar)}`} className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>Tipo de cotización</label>
              <select value={datos.tipo_cotizacion ?? 'blue'} onChange={e => setDato('tipo_cotizacion', e.target.value)} className={inputClass}>
                <option value="blue">Blue</option>
                <option value="mep">MEP / Bolsa</option>
                <option value="ccl">CCL</option>
                <option value="oficial">Oficial</option>
                <option value="cripto">Cripto (USDT)</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>Cotización actual (para rendimiento)</label>
              <input type="number" step="0.01" value={datos.cotizacion_actual ?? ''} onChange={e => setDato('cotizacion_actual', e.target.value)} placeholder={`Ej: ${fmt(dolar)}`} className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>Ubicación <span className="text-slate-400">(opcional)</span></label>
              <input type="text" value={datos.ubicacion ?? ''} onChange={e => setDato('ubicacion', e.target.value)} placeholder="Casa, caja de seguridad..." className={inputClass} />
            </div>
          </div>

          {parseFloat(datos.cantidad_usd ?? '0') > 0 && parseFloat(datos.cotizacion_compra ?? '0') > 0 && (
            <div className="bg-amber-50 border border-amber-100 rounded-xl px-4 py-3">
              <p className="text-xs text-amber-700 font-medium">
                Costo total: <span className="font-bold">${fmt(parseFloat(datos.cantidad_usd) * parseFloat(datos.cotizacion_compra))}</span> ARS
                {datos.cotizacion_actual && parseFloat(datos.cotizacion_actual) > 0 && (
                  <> · Valor actual: <span className="font-bold">${fmt(parseFloat(datos.cantidad_usd) * parseFloat(datos.cotizacion_actual))}</span> ARS</>
                )}
              </p>
            </div>
          )}
        </div>
      )}

      {/* CRYPTO */}
      {tipo === 'crypto' && (
        <div className="bg-white rounded-2xl border border-slate-100 p-5 space-y-4">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Datos de Crypto</p>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className={labelClass}>Moneda</label>
              <input type="text" value={datos.moneda_cripto ?? ''} onChange={e => setDato('moneda_cripto', e.target.value.toUpperCase())} placeholder="BTC, ETH, USDT..." className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>Exchange / Plataforma</label>
              <input type="text" value={datos.exchange ?? ''} onChange={e => setDato('exchange', e.target.value)} placeholder="Lemon, Bitso, Binance..." className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>Tipo</label>
              <select value={datos.tipo_crypto ?? 'volatil'} onChange={e => setDato('tipo_crypto', e.target.value)} className={inputClass}>
                <option value="volatil">Volátil (BTC, ETH...)</option>
                <option value="stablecoin">Stablecoin (USDT, USDC...)</option>
                <option value="yield">Con rendimiento (DeFi)</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className={labelClass}>Cantidad</label>
              <input type="number" step="any" value={datos.cantidad ?? ''} onChange={e => setDato('cantidad', e.target.value)} placeholder="Ej: 0.00234" className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>Precio compra (USD)</label>
              <input type="number" step="0.01" value={datos.precio_compra_usd ?? ''} onChange={e => setDato('precio_compra_usd', e.target.value)} placeholder="Ej: 95000" className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>Cotización ARS/USD al comprar</label>
              <input type="number" step="1" value={datos.cotizacion_compra_ars ?? ''} onChange={e => setDato('cotizacion_compra_ars', e.target.value)} placeholder={fmt(dolar)} className={inputClass} />
            </div>
          </div>
          {datos.tipo_crypto === 'yield' && (
            <div>
              <label className={labelClass}>Rendimiento anual estimado (%)</label>
              <input type="number" step="0.01" value={datos.yield_anual_pct ?? ''} onChange={e => setDato('yield_anual_pct', e.target.value)} placeholder="Ej: 6.5" className={inputClass} />
            </div>
          )}
        </div>
      )}

      {/* CEDEAR / ACCIÓN */}
      {(tipo === 'cedear' || tipo === 'accion') && (
        <div className="bg-white rounded-2xl border border-slate-100 p-5 space-y-4">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">{tipo === 'cedear' ? 'Datos del CEDEAR' : 'Datos de la Acción'}</p>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className={labelClass}>Ticker</label>
              <input type="text" value={datos.ticker ?? ''} onChange={e => setDato('ticker', e.target.value.toUpperCase())} placeholder={tipo === 'cedear' ? 'AAPL, MSFT...' : 'YPFD, GGAL...'} className={inputClass} />
            </div>
            {tipo === 'cedear' && (
              <div>
                <label className={labelClass}>Ratio (CEDEARs por acción)</label>
                <input type="number" step="1" value={datos.ratio ?? ''} onChange={e => setDato('ratio', e.target.value)} placeholder="Ej: 10" className={inputClass} />
              </div>
            )}
            <div>
              <label className={labelClass}>Cantidad</label>
              <input type="number" step="1" value={datos.cantidad ?? ''} onChange={e => setDato('cantidad', e.target.value)} className={inputClass} />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className={labelClass}>Precio compra (ARS)</label>
              <input type="number" step="0.01" value={datos.precio_compra_ars ?? ''} onChange={e => setDato('precio_compra_ars', e.target.value)} className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>Precio actual (ARS)</label>
              <input type="number" step="0.01" value={datos.precio_actual_ars ?? ''} onChange={e => setDato('precio_actual_ars', e.target.value)} className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>Broker</label>
              <input type="text" value={datos.broker ?? ''} onChange={e => setDato('broker', e.target.value)} placeholder="IOL, Balanz, PPI..." className={inputClass} />
            </div>
          </div>
        </div>
      )}

      {/* BONO / ON */}
      {(tipo === 'bono' || tipo === 'on') && (
        <div className="bg-white rounded-2xl border border-slate-100 p-5 space-y-4">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">{tipo === 'bono' ? 'Datos del Bono Soberano' : 'Datos de la ON'}</p>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className={labelClass}>Ticker</label>
              <input type="text" value={datos.ticker ?? ''} onChange={e => setDato('ticker', e.target.value.toUpperCase())} placeholder={tipo === 'bono' ? 'GD30, AL30...' : 'YCA6O...'} className={inputClass} />
            </div>
            {tipo === 'on' && (
              <div>
                <label className={labelClass}>Emisor</label>
                <input type="text" value={datos.emisor ?? ''} onChange={e => setDato('emisor', e.target.value)} placeholder="YPF, Pampa, TGS..." className={inputClass} />
              </div>
            )}
            <div>
              <label className={labelClass}>Valor nominal (VN)</label>
              <input type="number" step="1" value={datos.cantidad_vn ?? ''} onChange={e => setDato('cantidad_vn', e.target.value)} placeholder="Ej: 1000" className={inputClass} />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className={labelClass}>Precio compra (% VN)</label>
              <input type="number" step="0.01" value={datos.precio_compra_pct ?? ''} onChange={e => setDato('precio_compra_pct', e.target.value)} placeholder="Ej: 65.5" className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>TIR al comprar (%)</label>
              <input type="number" step="0.01" value={datos.tir_compra ?? ''} onChange={e => setDato('tir_compra', e.target.value)} placeholder="Ej: 8.5" className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>Cotización ARS/USD</label>
              <input type="number" step="1" value={datos.cotizacion_compra ?? ''} onChange={e => setDato('cotizacion_compra', e.target.value)} placeholder={fmt(dolar)} className={inputClass} />
            </div>
          </div>
          {tipo === 'bono' && (
            <div>
              <label className={labelClass}>Legislación</label>
              <select value={datos.legislacion ?? 'argentina'} onChange={e => setDato('legislacion', e.target.value)} className={inputClass}>
                <option value="argentina">Argentina (AL)</option>
                <option value="new_york">Nueva York (GD)</option>
              </select>
            </div>
          )}
        </div>
      )}

      {/* OTRO */}
      {tipo === 'otro' && (
        <div className="bg-white rounded-2xl border border-slate-100 p-5 space-y-4">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Datos adicionales</p>
          <div>
            <label className={labelClass}>Fecha de vencimiento / cierre <span className="text-slate-400">(opcional)</span></label>
            <input type="date" value={fechaVence} onChange={e => setFechaVence(e.target.value)} className={inputClass} />
          </div>
        </div>
      )}

      {/* Notas */}
      <div className="bg-white rounded-2xl border border-slate-100 p-5">
        <label className={labelClass}>Notas <span className="text-slate-400">(opcional)</span></label>
        <textarea value={notas} onChange={e => setNotas(e.target.value)} rows={2} placeholder="Observaciones, condiciones especiales..." className={inputClass} />
      </div>

      {/* Rendimiento preview */}
      {rendEstimado !== null && rendEstimado !== 0 && (
        <div className={`rounded-xl px-4 py-3 border ${rendEstimado >= 0 ? 'bg-emerald-50 border-emerald-100' : 'bg-red-50 border-red-100'}`}>
          <p className={`text-sm font-medium ${rendEstimado >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>
            Rendimiento estimado: {rendEstimado >= 0 ? '+' : ''}${fmt(rendEstimado)} ARS ({((rendEstimado / capitalNum) * 100).toFixed(1)}%)
          </p>
        </div>
      )}

      {error && <p className="text-sm text-red-500 bg-red-50 px-4 py-2 rounded-lg">{error}</p>}

      {/* Botones */}
      <div className="flex gap-3 pb-8">
        <button
          onClick={() => router.back()}
          className="flex-1 py-3 rounded-xl text-sm font-medium border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors"
        >
          Cancelar
        </button>
        <button
          onClick={handleGuardar}
          disabled={saving || saved}
          className="flex-1 py-3 rounded-xl text-sm font-medium text-white transition-colors"
          style={{
            background: saved ? '#16a34a' : 'linear-gradient(90deg, var(--accent2, #1B3A6B), var(--accent, #1a6b5a))',
            opacity: saving ? 0.7 : 1,
          }}
        >
          {saved ? '✓ Guardado' : saving ? 'Guardando...' : 'Cargar inversión'}
        </button>
      </div>
    </div>
  )
}
