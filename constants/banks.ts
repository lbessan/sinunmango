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
  { id: 'credicoop',    nombre: 'Banco Credicoop',     color: '#605C50', tipo: 'banco' },  // gris/taupe (color del ícono)
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
  { id: 'cocos',        nombre: 'Cocos Capital',       color: '#00609D', tipo: 'crypto' },  // azul
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

// ── Variantes de tarjeta por red ──────────────────────────────────────────────
// Imágenes en /public/cards/{networkId}-{variantId}.png
// Casos especiales:
//   Cabal    → /cards/cabal.png  (única variante)
//   Naranjax → /cards/naranjax.png  (banco=naranjax + red=naranja)

export type CardVariant = {
  id:    string   // slug del archivo
  label: string   // nombre visible
  color: string   // color de fondo fallback
}

export const CARD_VARIANTS_BY_NETWORK: Record<string, CardVariant[]> = {
  visa: [
    { id: 'standard',  label: 'Standard',        color: '#1A1F71' },
    { id: 'gold',      label: 'Gold',            color: '#7c5c1e' },
    { id: 'platinum',  label: 'Platinum',        color: '#475569' },
    { id: 'signature', label: 'Signature',       color: '#1e3a5f' },
  ],
  mastercard: [
    { id: 'standard',  label: 'Standard',        color: '#252525' },
    { id: 'gold',      label: 'Gold',            color: '#7c5c1e' },
    { id: 'platinum',  label: 'Platinum',        color: '#475569' },
    { id: 'black',     label: 'Black',           color: '#0f0f0f' },
  ],
  amex: [
    { id: 'standard',  label: 'Standard',        color: '#007BC1' },
    { id: 'gold',      label: 'Gold',            color: '#7c5c1e' },
    { id: 'platinum',  label: 'Platinum',        color: '#475569' },
    { id: 'aplus',     label: 'Aerolíneas Plus', color: '#003580' },
    { id: 'green',     label: 'Green',           color: '#2d6a4f' },
  ],
  naranja: [
    { id: 'standard',  label: 'Standard',        color: '#FF6B00' },
  ],
  cabal: [
    { id: 'standard',  label: 'Standard',        color: '#00529B' },
  ],
  maestro: [
    { id: 'standard',  label: 'Standard',        color: '#CC0000' },
  ],
}

/** Variantes disponibles para una red de tarjeta */
export function getNetworkVariants(networkId: string): CardVariant[] {
  return CARD_VARIANTS_BY_NETWORK[networkId]
    ?? [{ id: 'standard', label: 'Standard', color: '#1e293b' }]
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

/**
 * Imagen de tarjeta de crédito (800×504px).
 * - Cabal:    /cards/cabal.png
 * - NaranjaX: /cards/naranjax.png  (solo cuando bankId='naranjax' y networkId='naranja')
 * - Resto:    /cards/{networkId}-{variantId}.png
 */
export function cardImageUrl(networkId: string, variantId: string, bankId?: string): string {
  if (networkId === 'cabal') return '/cards/cabal.png'
  if (bankId === 'naranjax' && networkId === 'naranja') return '/cards/naranjax.png'
  return `/cards/${networkId}-${variantId}.png`
}
