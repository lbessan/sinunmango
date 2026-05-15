import { describe, it, expect } from 'vitest'
import {
  stripMarkdownFences,
  parseClaudeJSON,
  recoverPartialArray,
  recoverObject,
} from '@/lib/parse-claude-json'

describe('stripMarkdownFences', () => {
  it('quita ```json al inicio y ``` al final', () => {
    expect(stripMarkdownFences('```json\n{"a":1}\n```')).toBe('{"a":1}')
  })

  it('quita ``` solo (sin lang)', () => {
    expect(stripMarkdownFences('```\n{"a":1}\n```')).toBe('{"a":1}')
  })

  it('no toca texto sin fences', () => {
    expect(stripMarkdownFences('{"a":1}')).toBe('{"a":1}')
  })

  it('trim de whitespace al final', () => {
    expect(stripMarkdownFences('  {"a":1}  \n\n')).toBe('{"a":1}')
  })
})

describe('parseClaudeJSON', () => {
  it('parsea JSON limpio', () => {
    const r = parseClaudeJSON<{ transacciones: number[] }>('{"transacciones": [1,2,3]}')
    expect(r).toEqual({ transacciones: [1, 2, 3] })
  })

  it('parsea JSON con code fences', () => {
    const r = parseClaudeJSON<{ a: number }>('```json\n{"a": 42}\n```')
    expect(r).toEqual({ a: 42 })
  })

  it('parsea JSON con whitespace alrededor', () => {
    const r = parseClaudeJSON<{ a: number }>('\n\n  {"a":1}  \n')
    expect(r).toEqual({ a: 1 })
  })

  it('devuelve null si el JSON está malformado', () => {
    expect(parseClaudeJSON('{"a": 1,')).toBeNull()
    expect(parseClaudeJSON('not json at all')).toBeNull()
    expect(parseClaudeJSON('')).toBeNull()
  })
})

describe('recoverPartialArray', () => {
  it('rescata array completo cuando el JSON tiene transacciones cerradas', () => {
    const txt = `{
      "transacciones": [
        {"fecha": "2026-04-14", "detalle": "Netflix", "monto_ars": 5990},
        {"fecha": "2026-04-15", "detalle": "Spotify", "monto_ars": 2100}
      ]`  // sin cerrar el array ni el objeto raíz
    const r = recoverPartialArray<{ detalle: string }>(txt, 'transacciones')
    expect(r).not.toBeNull()
    expect(r!.length).toBe(2)
    expect(r![0].detalle).toBe('Netflix')
    expect(r![1].detalle).toBe('Spotify')
  })

  it('rescata solo elementos completos cuando el último está cortado', () => {
    const txt = `{
      "transacciones": [
        {"fecha": "2026-04-14", "detalle": "Netflix", "monto_ars": 5990},
        {"fecha": "2026-04-15", "detalle": "Spo`  // último elemento incompleto
    const r = recoverPartialArray<{ detalle: string }>(txt, 'transacciones')
    expect(r).not.toBeNull()
    expect(r!.length).toBe(1)
    expect(r![0].detalle).toBe('Netflix')
  })

  it('devuelve null si no encuentra la key', () => {
    const txt = '{"otra_key": [1,2,3]}'
    expect(recoverPartialArray(txt, 'transacciones')).toBeNull()
  })

  it('devuelve null si no hay ningún elemento completo', () => {
    const txt = '{"transacciones": [{"fecha": "2026'
    expect(recoverPartialArray(txt, 'transacciones')).toBeNull()
  })

  it('funciona con code fences alrededor', () => {
    const txt = '```json\n{"transacciones": [{"a": 1},'
    const r = recoverPartialArray<{ a: number }>(txt, 'transacciones')
    expect(r).toEqual([{ a: 1 }])
  })

  it('funciona con keys con caracteres especiales (sanitizar regex)', () => {
    const txt = '{"mi.key": [{"a": 1},'
    const r = recoverPartialArray(txt, 'mi.key')
    expect(r).toEqual([{ a: 1 }])
  })
})

describe('recoverObject', () => {
  it('rescata objeto completo nested', () => {
    const txt = `{
      "tarjeta": {"banco": "Galicia", "red": "visa"},
      "transacciones": [`  // truncado después del objeto tarjeta
    const r = recoverObject<{ banco: string; red: string }>(txt, 'tarjeta')
    expect(r).toEqual({ banco: 'Galicia', red: 'visa' })
  })

  it('devuelve null si el objeto está truncado', () => {
    const txt = '{"tarjeta": {"banco": "Galicia",'
    expect(recoverObject(txt, 'tarjeta')).toBeNull()
  })

  it('devuelve null si la key no existe', () => {
    expect(recoverObject('{"a": 1}', 'tarjeta')).toBeNull()
  })

  it('NO matchea objetos con nested objects (heurística simple)', () => {
    // Por diseño: solo matchea {[^{}]+} para evitar parsear estructuras complejas
    const txt = '{"tarjeta": {"meta": {"x": 1}, "banco": "G"}}'
    expect(recoverObject(txt, 'tarjeta')).toBeNull()
  })
})
