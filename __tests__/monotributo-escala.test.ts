// Tests para lib/monotributo-escala.ts — parseo de la escala pública de AFIP.
import { describe, it, expect } from 'vitest'
import { parseMonto, parseEscala, parseVigenciaISO } from '@/lib/monotributo-escala'

// Fixture: recorte real del HTML de afip.gob.ar/monotributo/categorias.asp (cat A y B).
const HTML = `
<p>Valores de aplicación desde el 1/08/2026</p>
<table>
<tr>
  <th id="th_A_t15" scope="row" data-title="Categoría" headers="th_cat_t14">A</th>
  <td headers="th_A_t15 th_ing_br_t15" data-title="Ingresos brutos">$12.009.410,45 </td>
  <td headers="th_A_t15 th_imp_int_t15 th_imp_int_loc_t15" data-title="Impuesto Integrado servicios">$5.585,77 </td>
  <td headers="th_A_t15 th_ap_sipa_t15">$18.246,86 </td>
  <td headers="th_A_t15 th_ap_obra_soc_t15">$25.694,55 </td>
  <td headers="th_A_t15 th_total_t15 th_total_loc_t15" data-title="Total servicios">$49.527,18 </td>
  <td headers="th_A_t15 th_total_t15 th_total_ven_t15" data-title="Total venta">$49.527,18 </td>
</tr>
<tr>
  <th id="th_B_t15" scope="row" headers="th_cat_t14">B</th>
  <td headers="th_B_t15 th_ing_br_t15">$17.595.182,74 </td>
  <td headers="th_B_t15 th_total_t15 th_total_loc_t15">$55.000,00 </td>
  <td headers="th_B_t15 th_total_t15 th_total_ven_t15">$55.000,00 </td>
</tr>
</table>`

describe('parseMonto', () => {
  it('convierte formato AR a número', () => {
    expect(parseMonto('$12.009.410,45 ')).toBe(12009410.45)
    expect(parseMonto('$49.527,18')).toBe(49527.18)
  })
  it('null/basura → null', () => {
    expect(parseMonto(null)).toBeNull()
    expect(parseMonto('N/A')).toBeNull()
  })
})

describe('parseEscala', () => {
  it('extrae categorías con su límite anual y cuotas', () => {
    const escala = parseEscala(HTML)
    expect(escala).toHaveLength(2)
    const a = escala.find(e => e.categoria === 'A')!
    expect(a.limite_anual).toBe(12009410.45)
    expect(a.cuota_servicios).toBe(49527.18)   // total, no el impuesto integrado
    expect(a.cuota_bienes).toBe(49527.18)
    const b = escala.find(e => e.categoria === 'B')!
    expect(b.limite_anual).toBe(17595182.74)
    expect(b.cuota_servicios).toBe(55000)
  })

  it('no confunde el "total" con el "impuesto integrado"', () => {
    const a = parseEscala(HTML).find(e => e.categoria === 'A')!
    expect(a.cuota_servicios).not.toBe(5585.77) // ese es el impuesto integrado
  })
})

describe('parseVigenciaISO', () => {
  it('extrae la fecha de vigencia en ISO', () => {
    expect(parseVigenciaISO(HTML)).toBe('2026-08-01')
  })
})
