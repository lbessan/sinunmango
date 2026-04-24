// ─── Bancos y billeteras de Argentina ─────────────────────────────────────────
// Archivos de imagen esperados en /public/:
//   Ícono cuadrado:   /banks/{id}.png          (200×200px, fondo transparente)
//   Logo banner:      /banks/{id}-banner.png   (600×200px, fondo transparente, se superpone sobre el color)
//   Imagen de tarjeta:/cards/{bankId}-{networkId}-{variant}.png  (800×504px)
//
// Si un archivo no existe, el código muestra el color como fallback.

export type BankEntry = {
  id:     string
  nombre: string
  color:  string
  tipo:   'banco' | 'billetera' | 'crypto'
}

export const BANKS: BankEntry[] = [
  // ── Bancos tradicionales ──────────────────────────────────────────────────
  { id: 'galicia',      nombre: 'Banco Galicia',       color: '#E6001A', tipo: 'banco' },
  { id: 'bbva',         nombre: 'BBVA',                color: '#004B8D', tipo: 'banco' },
  { id: 'santander',    nombre: 'Santander',           color: '#EC0000', tipo: 'banco' },
  { id: 'hsbc',         nombre: 'HSBC',                color: '#DB0011', tipo: 'banco' },
  { id: 'nacion',       nombre: 'Banco Nación',        color: '#00529B', tipo: 'banco' },
  { id: 'provincia',    nombre: 'Banco Provincia',     color: '#0066CC', tipo: 'banco' },
  { id: 'macro',        nombre: 'Banco Macro',         color: '#FF6B00', tipo: 'banco' },
  { id: 'supervielle',  nombre: 'Supervielle',         color: '#00A651', tipo: 'banco' },
  { id: 'icbc',         nombre: 'ICBC',                color: '#C8102E', tipo: 'banco' },
  { id: 'comafi',       nombre: 'Banco Comafi',        color: '#004990', tipo: 'banco' },
  { id: 'ciudad',       nombre: 'Banco Ciudad',        color: '#007DC3', tipo: 'banco' },
  { id: 'patagonia',    nombre: 'Banco Patagonia',     color: '#005A9C', tipo: 'banco' },
  { id: 'hipotecario',  nombre: 'Banco Hipotecario',   color: '#1D3D8F', tipo: 'banco' },
  { id: 'industrial',   nombre: 'Banco Industrial',    color: '#0066A1', tipo: 'banco' },
  { id: 'piano',        nombre: 'Banco Piano',         color: '#1A3A6B', tipo: 'banco' },
  { id: 'credicoop',    nombre: 'Banco Credicoop',     color: '#E31837', tipo: 'banco' },
  { id: 'columbia',     nombre: 'Banco Columbia',      color: '#003087', tipo: 'banco' },
  // ── Billeteras virtuales ──────────────────────────────────────────────────
  { id: 'mercadopago',  nombre: 'Mercado Pago',        color: '#009EE3', tipo: 'billetera' },
  { id: 'naranjax',     nombre: 'Naranja X',           color: '#FF6200', tipo: 'billetera' },
  { id: 'personalpay',  nombre: 'Personal Pay',        color: '#6B00F5', tipo: 'billetera' },
  { id: 'uala',         nombre: 'Ualá',                color: '#7B2FBE', tipo: 'billetera' },
  { id: 'brubank',      nombre: 'Brubank',             color: '#1C00FF', tipo: 'billetera' },
  { id: 'lemon',        nombre: 'Lemon',               color: '#00B24B', tipo: 'billetera' },
  { id: 'prex',         nombre: 'Prex',                color: '#FF4444', tipo: 'billetera' },
  { id: 'bimo',         nombre: 'Bimo',                color: '#00C2FF', tipo: 'billetera' },
  { id: 'cuenta-dni',   nombre: 'Cuenta DNI (BNA)',    color: '#00529B', tipo: 'billetera' },
  { id: 'modo',         nombre: 'Modo',                color: '#1B1B2F', tipo: 'billetera' },
  // ── Crypto / fintech ──────────────────────────────────────────────────────
  { id: 'ripio',        nombre: 'Ripio',               color: '#00D4AA', tipo: 'crypto' },
  { id: 'belo',         nombre: 'Belo',                color: '#6C3EFF', tipo: 'crypto' },
  { id: 'buenbit',      nombre: 'Buenbit',             color: '#1DC9B7', tipo: 'crypto' },
]

export function getBankById(id: string): BankEntry | undefined {
  return BANKS.find(b => b.id === id)
}

// ── Redes de tarjetas de crédito ──────────────────────────────────────────────
export type CardNetwork = {
  id:     string
  nombre: string
  color:  string
}

export const CARD_NETWORKS: CardNetwork[] = [
  { id: 'visa',       nombre: 'Visa',             color: '#1A1F71' },
  { id: 'mastercard', nombre: 'Mastercard',        color: '#252525' },
  { id: 'amex',       nombre: 'American Express',  color: '#007BC1' },
  { id: 'naranja',    nombre: 'Naranja',           color: '#FF6B00' },
  { id: 'cabal',      nombre: 'Cabal',             color: '#00529B' },
  { id: 'maestro',    nombre: 'Maestro',           color: '#CC0000' },
]

// ── Variantes de tarjeta ──────────────────────────────────────────────────────
// Archivo esperado: /public/cards/{bankId}-{networkId}-{variantId}.png
// Si el archivo no existe el código muestra un placeholder con el color del banco.

export type CardVariant = {
  id:    string   // slug usado en el nombre del archivo
  label: string   // nombre visible
  color: string   // color de fondo cuando no hay imagen
}

// Variantes genéricas que aplican a cualquier banco + red
export const CARD_VARIANTS: CardVariant[] = [
  { id: 'standard',  label: 'Clásica',   color: '#1e293b' },
  { id: 'black',     label: 'Black',     color: '#0f0f0f' },
  { id: 'gold',      label: 'Gold',      color: '#7c5c1e' },
  { id: 'platinum',  label: 'Platinum',  color: '#475569' },
  { id: 'signature', label: 'Signature', color: '#1e3a5f' },
  { id: 'infinite',  label: 'Infinite',  color: '#0d1117' },
]

// Configuración específica por banco: qué variantes tienen imágenes disponibles.
// Cuando el repositorio de imágenes esté cargado, completar/ajustar esta lista.
// Si un banco no aparece acá, se muestran las variantes genéricas sin imagen previa.
export const BANK_CARD_VARIANTS: Record<string, Record<string, string[]>> = {
  // bankId → networkId → variantes con imagen disponible
  bbva:        { mastercard: ['black', 'standard'], visa: ['black', 'standard'] },
  galicia:     { visa: ['standard', 'black', 'signature'], mastercard: ['standard'] },
  provincia:   { visa: ['standard', 'platinum'] },
  santander:   { visa: ['standard', 'black', 'gold'], mastercard: ['standard'] },
  macro:       { visa: ['standard', 'gold'], mastercard: ['standard'] },
  naranjax:    { mastercard: ['standard'] },
  mercadopago: { mastercard: ['standard', 'black'] },
  hsbc:        { visa: ['standard', 'black', 'platinum'] },
  icbc:        { visa: ['standard', 'gold', 'platinum'] },
  supervielle: { visa: ['standard', 'black'], mastercard: ['standard'] },
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Ícono cuadrado del banco (200×200px, fondo transparente) */
export function bankIconUrl(bankId: string): string {
  return `/banks/${bankId}.png`
}

/** Logo horizontal para el banner (600×200px, fondo transparente) */
export function bankBannerUrl(bankId: string): string {
  return `/banks/${bankId}-banner.png`
}

/** Imagen de tarjeta de crédito (800×504px) */
export function cardImageUrl(bankId: string, networkId: string, variantId: string): string {
  return `/cards/${bankId}-${networkId}-${variantId}.png`
}

/** Variantes disponibles para una combinación banco+red */
export function getCardVariants(bankId: string, networkId: string): CardVariant[] {
  const available = BANK_CARD_VARIANTS[bankId]?.[networkId]
  if (!available) return CARD_VARIANTS  // mostrar todas si no hay config específica
  return CARD_VARIANTS.filter(v => available.includes(v.id))
}
