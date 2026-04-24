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
  { id: 'galicia',      nombre: 'Banco Galicia',       color: '#FD6400', tipo: 'banco' },  // naranja
  { id: 'bbva',         nombre: 'BBVA',                color: '#001491', tipo: 'banco' },  // azul BBVA
  { id: 'santander',    nombre: 'Santander',           color: '#EC0000', tipo: 'banco' },  // rojo
  { id: 'hsbc',         nombre: 'HSBC',                color: '#DB0011', tipo: 'banco' },  // rojo
  { id: 'nacion',       nombre: 'Banco Nación',        color: '#007993', tipo: 'banco' },  // teal
  { id: 'provincia',    nombre: 'Banco Provincia',     color: '#269E37', tipo: 'banco' },  // verde
  { id: 'macro',        nombre: 'Banco Macro',         color: '#113250', tipo: 'banco' },  // azul marino
  { id: 'supervielle',  nombre: 'Supervielle',         color: '#EC1C24', tipo: 'banco' },  // rojo
  { id: 'icbc',         nombre: 'ICBC',                color: '#C8102E', tipo: 'banco' },  // rojo
  { id: 'comafi',       nombre: 'Banco Comafi',        color: '#82955C', tipo: 'banco' },  // oliva
  { id: 'ciudad',       nombre: 'Banco Ciudad',        color: '#25AAE2', tipo: 'banco' },  // celeste
  { id: 'patagonia',    nombre: 'Banco Patagonia',     color: '#012D5A', tipo: 'banco' },  // azul marino oscuro
  { id: 'hipotecario',  nombre: 'Banco Hipotecario',   color: '#F27321', tipo: 'banco' },  // naranja
  { id: 'industrial',   nombre: 'Banco Industrial',    color: '#013766', tipo: 'banco' },  // azul marino oscuro (Bind)
  { id: 'piano',        nombre: 'Banco Piano',         color: '#13294B', tipo: 'banco' },  // azul marino oscuro
  { id: 'credicoop',    nombre: 'Banco Credicoop',     color: '#E31837', tipo: 'banco' },  // rojo
  { id: 'columbia',     nombre: 'Banco Columbia',      color: '#004B8E', tipo: 'banco' },  // azul
  { id: 'carrefour',    nombre: 'Carrefour Banco',     color: '#254F9B', tipo: 'banco' },  // azul Carrefour
  // ── Billeteras virtuales ──────────────────────────────────────────────────
  { id: 'mercadopago',  nombre: 'Mercado Pago',        color: '#009EE3', tipo: 'billetera' },  // celeste
  { id: 'naranjax',     nombre: 'Naranja X',           color: '#FE5000', tipo: 'billetera' },  // naranja
  { id: 'personalpay',  nombre: 'Personal Pay',        color: '#5C4FF6', tipo: 'billetera' },  // violeta
  { id: 'uala',         nombre: 'Ualá',                color: '#4168E2', tipo: 'billetera' },  // azul
  { id: 'brubank',      nombre: 'Brubank',             color: '#614AD9', tipo: 'billetera' },  // violeta
  { id: 'lemon',        nombre: 'Lemon',               color: '#00D15C', tipo: 'billetera' },  // verde
  { id: 'prex',         nombre: 'Prex',                color: '#7128D8', tipo: 'billetera' },  // violeta
  { id: 'cuenta-dni',   nombre: 'Cuenta DNI',          color: '#269E37', tipo: 'billetera' },  // verde Provincia (es su billetera)
  { id: 'modo',         nombre: 'Modo',                color: '#008859', tipo: 'billetera' },  // verde teal
  // ── Crypto / fintech ──────────────────────────────────────────────────────
  { id: 'ripio',        nombre: 'Ripio',               color: '#7908FF', tipo: 'crypto' },  // violeta
  { id: 'belo',         nombre: 'Belo',                color: '#3B00FF', tipo: 'crypto' },  // azul eléctrico
  { id: 'buenbit',      nombre: 'Buenbit',             color: '#FF78C8', tipo: 'crypto' },  // rosa
  { id: 'cocos',        nombre: 'Cocos Capital',       color: '#3EBD8F', tipo: 'crypto' },  // verde fintech
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
