// Tests del parser del CSV de "Mis Comprobantes" (ARCA).
import { describe, it, expect } from 'vitest'
import {
  parseMisComprobantes, parseNumero, parseFecha, detectarSeparador,
  splitCsvLine, normalizarHeader, mapearColumnas, interpretarTipo,
} from '@/lib/afip/mis-comprobantes'

// Header tal cual lo exporta ARCA (con acentos y abreviaturas).
const HEADER = 'Fecha de Emisión;Tipo de Comprobante;Punto de Venta;Número Desde;Número Hasta;Cód. Autorización;Tipo Doc. Receptor;Nro. Doc. Receptor;Denominación Receptor;Tipo Cambio;Moneda;Imp. Neto Gravado;Imp. Neto No Gravado;Imp. Op. Exentas;Otros Tributos;IVA;Imp. Total'

const fila = (over: Partial<Record<string, string>> = {}) => {
  const c = {
    fecha: '2026-07-15', tipo: '11 - Factura C', pto: '1', desde: '110', hasta: '110',
    cae: '75123456789012', docTipo: '80', docNro: '30712345678', cliente: 'ACME SA',
    cambio: '1', moneda: 'PES', neto: '101000,00', netoNG: '0,00', exentas: '0,00',
    tributos: '0,00', iva: '0,00', total: '101000,00', ...over,
  }
  return [c.fecha, c.tipo, c.pto, c.desde, c.hasta, c.cae, c.docTipo, c.docNro, c.cliente,
    c.cambio, c.moneda, c.neto, c.netoNG, c.exentas, c.tributos, c.iva, c.total].join(';')
}

describe('helpers', () => {
  it('normalizarHeader saca acentos y puntuación', () => {
    expect(normalizarHeader('Fecha de Emisión')).toBe('fecha de emision')
    expect(normalizarHeader('Cód. Autorización')).toBe('cod autorizacion')
    expect(normalizarHeader('Imp. Total')).toBe('imp total')
  })

  it('detectarSeparador distingue ; de , y tab', () => {
    expect(detectarSeparador('a;b;c')).toBe(';')
    expect(detectarSeparador('a,b,c')).toBe(',')
    expect(detectarSeparador('a\tb\tc')).toBe('\t')
  })

  it('splitCsvLine respeta comillas y comas adentro', () => {
    expect(splitCsvLine('a,"b,c",d', ',')).toEqual(['a', 'b,c', 'd'])
    expect(splitCsvLine('a,"di ""hola""",b', ',')).toEqual(['a', 'di "hola"', 'b'])
  })

  it('parseNumero entiende formato AR y US', () => {
    expect(parseNumero('101.000,00')).toBe(101000)   // AR
    expect(parseNumero('101,000.00')).toBe(101000)   // US
    expect(parseNumero('147,26')).toBe(147.26)       // AR sin miles
    expect(parseNumero('147.26')).toBe(147.26)       // US sin miles
    expect(parseNumero('3360000')).toBe(3360000)
    expect(parseNumero('')).toBeNull()
  })

  it('parseFecha entiende los 3 formatos que usa ARCA', () => {
    expect(parseFecha('2026-07-15')).toBe('2026-07-15')
    expect(parseFecha('15/07/2026')).toBe('2026-07-15')
    expect(parseFecha('20260715')).toBe('2026-07-15')
    expect(parseFecha('basura')).toBeNull()
  })

  it('interpretarTipo reconoce notas de crédito por código y por texto', () => {
    expect(interpretarTipo('11 - Factura C').esNotaCredito).toBe(false)
    expect(interpretarTipo('13 - Nota de Crédito C').esNotaCredito).toBe(true)
    expect(interpretarTipo('Nota de Credito C').esNotaCredito).toBe(true)
    expect(interpretarTipo('11 - Factura C').codigo).toBe(11)
  })

  it('mapearColumnas ubica los campos del header real de ARCA', () => {
    const idx = mapearColumnas(HEADER.split(';'))
    expect(idx.fecha).toBe(0)
    expect(idx.tipo).toBe(1)
    expect(idx.puntoVenta).toBe(2)
    expect(idx.numeroDesde).toBe(3)
    expect(idx.cae).toBe(5)
    expect(idx.cliente).toBe(8)
    expect(idx.total).toBe(16)
  })
})

describe('parseMisComprobantes', () => {
  it('lee una factura y arma el número con el formato de la app', () => {
    const { filas } = parseMisComprobantes(`${HEADER}\n${fila()}`)
    expect(filas).toHaveLength(1)
    expect(filas[0]).toMatchObject({
      fecha: '2026-07-15',
      cliente: 'ACME SA',
      total: 101000,
      numeroComprobante: '00001-00000110',   // mismo formato que usa el importador de AFIP
      puntoVenta: '00001',
      cae: '75123456789012',
      esNotaCredito: false,
    })
  })

  it('las notas de crédito quedan NEGATIVAS (restan facturación, como en ARCA)', () => {
    const { filas } = parseMisComprobantes(
      `${HEADER}\n${fila()}\n${fila({ tipo: '13 - Nota de Crédito C', desde: '111', total: '1000,00' })}`,
    )
    expect(filas[1].esNotaCredito).toBe(true)
    expect(filas[1].total).toBe(-1000)
    // El neto es lo que el gauge tiene que mostrar
    expect(filas.reduce((s, f) => s + f.total, 0)).toBe(100000)
  })

  it('acepta el mismo archivo separado por comas (Excel lo reescribe así)', () => {
    // Excel reescribe con coma de separador Y punto decimal — si quedara la
    // coma decimal, cada importe partiría la fila en dos columnas.
    const usd = { neto: '101000.00', netoNG: '0.00', exentas: '0.00', tributos: '0.00', iva: '0.00', total: '101000.00' }
    const csv = `${HEADER.replace(/;/g, ',')}\n${fila(usd).replace(/;/g, ',')}`
    const { filas } = parseMisComprobantes(csv)
    expect(filas).toHaveLength(1)
    expect(filas[0].total).toBe(101000)
    expect(filas[0].cliente).toBe('ACME SA')
  })

  it('formato AR con comas decimales SÓLO se lee bien con ; (el separador real de ARCA)', () => {
    // Regresión del riesgo que encontramos: "101000,00" con separador coma
    // corre las columnas. Con el separador correcto sale bien.
    const { filas } = parseMisComprobantes(`${HEADER}\n${fila({ total: '3.360.000,50' })}`)
    expect(filas[0].total).toBe(3360000.5)
  })

  it('ignora las líneas de pie/totales sin romperse', () => {
    const { filas, descartadas } = parseMisComprobantes(
      `${HEADER}\n${fila()}\nTotales;;;;;;;;;;;;;;;;101000,00`,
    )
    expect(filas).toHaveLength(1)
    expect(descartadas).toHaveLength(1)
    expect(descartadas[0].motivo).toContain('fecha')
  })

  it('si el formato no es el esperado, lo dice en vez de importar basura', () => {
    const { filas, descartadas } = parseMisComprobantes('Columna A;Columna B\n1;2')
    expect(filas).toHaveLength(0)
    expect(descartadas[0].motivo).toContain('No reconocimos el formato')
  })

  it('sin denominación cae a un cliente identificable, nunca vacío', () => {
    const { filas } = parseMisComprobantes(`${HEADER}\n${fila({ cliente: '', docNro: '20304050607' })}`)
    expect(filas[0].cliente).toBe('Doc 20304050607')
    const anon = parseMisComprobantes(`${HEADER}\n${fila({ cliente: '', docNro: '0', docTipo: '99' })}`)
    expect(anon.filas[0].cliente).toBe('Consumidor final')
  })

  it('archivo vacío no explota', () => {
    expect(parseMisComprobantes('').filas).toHaveLength(0)
  })
})
