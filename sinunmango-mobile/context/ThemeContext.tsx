import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import AsyncStorage from '@react-native-async-storage/async-storage'

// ─── Paletas disponibles ──────────────────────────────────────────────────────
export const PALETAS = [
  { id: 'magenta', label: 'Magenta', accent: '#94184A', accent2: '#5c0f2e', sidebar: '#1a0028' },
  { id: 'verde',   label: 'Verde',   accent: '#1a6b5a', accent2: '#0d3b2e', sidebar: '#07192b' },
  { id: 'azul',    label: 'Azul',    accent: '#1B3A6B', accent2: '#0f2548', sidebar: '#0a1628' },
  { id: 'violeta', label: 'Violeta', accent: '#6d28d9', accent2: '#4c1d95', sidebar: '#1a0a3b' },
  { id: 'naranja', label: 'Naranja', accent: '#c2410c', accent2: '#9a3412', sidebar: '#1a0f07' },
  { id: 'rosa',    label: 'Rosa',    accent: '#be185d', accent2: '#9d174d', sidebar: '#1a0716' },
] as const

export type PaletaId = typeof PALETAS[number]['id']

// ─── Colores estáticos (no cambian con el tema) ───────────────────────────────
export const STATIC_COLORS = {
  bgMain:        '#f1f5f9',
  bgCard:        '#ffffff',
  textPrimary:   '#1e293b',
  textSecondary: '#475569',
  textMuted:     '#94a3b8',
  border:        '#e2e8f0',
  borderSubtle:  '#f1f5f9',
  green:         '#16a34a',
  red:           '#ef4444',
  orange:        '#f97316',
  white:         '#ffffff',
}

// ─── Tipo del contexto ────────────────────────────────────────────────────────
export type ThemeColors = typeof STATIC_COLORS & {
  accent:  string
  accent2: string
  sidebar: string
}

type ThemeContextValue = {
  colors:    ThemeColors
  paletaId:  PaletaId
  setPaleta: (id: PaletaId) => void
}

const STORAGE_KEY = '@sinunmango:paleta'

// ─── Helpers ──────────────────────────────────────────────────────────────────
function buildColors(paletaId: PaletaId): ThemeColors {
  const p = PALETAS.find(p => p.id === paletaId) ?? PALETAS[0]
  return { ...STATIC_COLORS, accent: p.accent, accent2: p.accent2, sidebar: p.sidebar }
}

// ─── Context ──────────────────────────────────────────────────────────────────
const ThemeContext = createContext<ThemeContextValue>({
  colors:    buildColors('magenta'),
  paletaId:  'magenta',
  setPaleta: () => {},
})

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [paletaId, setPaletaState] = useState<PaletaId>('magenta')

  // Cargar paleta guardada al iniciar
  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then(stored => {
      if (stored && PALETAS.some(p => p.id === stored)) {
        setPaletaState(stored as PaletaId)
      }
    })
  }, [])

  const setPaleta = useCallback((id: PaletaId) => {
    setPaletaState(id)
    AsyncStorage.setItem(STORAGE_KEY, id)
  }, [])

  return (
    <ThemeContext.Provider value={{ colors: buildColors(paletaId), paletaId, setPaleta }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme() {
  return useContext(ThemeContext)
}
