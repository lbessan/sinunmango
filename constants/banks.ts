// ─── Bancos y billeteras de Argentina ─────────────────────────────────────────
// id: nombre del archivo en /public/banks/{id}.png
// color: color primario para fallback y temas de tarjeta
// Para agregar un banco: añadir la entrada acá + poner el PNG en /public/banks/

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
  { id: 'frances',      nombre: 'BBVA Francés',        color: '#004B8D', tipo: 'banco' },
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
  { id: 'cuenta-dni',   nombre: 'Cuenta DNI (BNA)',   color: '#00529B', tipo: 'billetera' },
  { id: 'modo',         nombre: 'Modo',                color: '#1B1B2F', tipo: 'billetera' },
  { id: 'pluscard',     nombre: 'Plus Card',           color: '#1A237E', tipo: 'billetera' },
  // ── Crypto / fintech ──────────────────────────────────────────────────────
  { id: 'ripio',        nombre: 'Ripio',               color: '#00D4AA', tipo: 'crypto' },
  { id: 'satoshitango', nombre: 'SatoshiTango',        color: '#F7931A', tipo: 'crypto' },
  { id: 'belo',         nombre: 'Belo',                color: '#6C3EFF', tipo: 'crypto' },
  { id: 'buenbit',      nombre: 'Buenbit',             color: '#1DC9B7', tipo: 'crypto' },
]

export function getBankById(id: string): BankEntry | undefined {
  return BANKS.find(b => b.id === id)
}

// ── Redes de tarjetas de crédito ──────────────────────────────────────────────
// Imágenes en /public/cards/{id}.png
// El archivo debería ser una tarjeta horizontal (por ej. 400×250px)

export type CardNetwork = {
  id:     string
  nombre: string
  color:  string   // color de fondo de la mini-tarjeta si no hay imagen
}

export const CARD_NETWORKS: CardNetwork[] = [
  { id: 'visa',       nombre: 'Visa',             color: '#1A1F71' },
  { id: 'mastercard', nombre: 'Mastercard',        color: '#252525' },
  { id: 'amex',       nombre: 'American Express',  color: '#007BC1' },
  { id: 'naranja',    nombre: 'Naranja',           color: '#FF6B00' },
  { id: 'cabal',      nombre: 'Cabal',             color: '#00529B' },
  { id: 'maestro',    nombre: 'Maestro',           color: '#CC0000' },
]

export function getCardNetworkById(id: string): CardNetwork | undefined {
  return CARD_NETWORKS.find(c => c.id === id)
}

// ── Helpers para construir rutas de imágenes ──────────────────────────────────

export function bankLogoUrl(bankId: string): string {
  return `/banks/${bankId}.png`
}

export function cardImageUrl(networkId: string): string {
  return `/cards/${networkId}.png`
}
