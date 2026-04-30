import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import AsyncStorage from '@react-native-async-storage/async-storage'

// ─── Acentos (del design handoff) ────────────────────────────────────────────
export const ACCENTS = [
  { id: 'verde',   label: 'Verde',   hex: '#0F7173', light: '#E6F4F4', dark: '#0A5355' },
  { id: 'azul',    label: 'Azul',    hex: '#2563EB', light: '#EFF6FF', dark: '#1D4ED8' },
  { id: 'violeta', label: 'Violeta', hex: '#7C3AED', light: '#F5F3FF', dark: '#6D28D9' },
  { id: 'naranja', label: 'Naranja', hex: '#E8601A', light: '#FFF6EE', dark: '#C94D10' },
  { id: 'rosado',  label: 'Rosado',  hex: '#BE185D', light: '#FDF2F8', dark: '#9D174D' },
] as const

export type AccentId = typeof ACCENTS[number]['id']
export type ModeId   = 'claro' | 'oscuro'

// ─── Tipo de tema completo ────────────────────────────────────────────────────
export type Theme = {
  mode:         ModeId
  accentId:     AccentId
  // Surfaces
  bg:           string
  surface:      string
  surfaceAlt:   string
  // Text
  text:         string
  textSec:      string
  textMuted:    string
  // Borders / tab bar
  border:       string
  tabBar:       string
  tabBarBorder: string
  // Semánticos
  income:       string
  expense:      string
  // Acento
  primary:      string
  primaryLight: string
  primaryDark:  string
  // Tokens especiales
  balanceBg:    readonly [string, string]
  fabShadow:    string
}

// ─── buildTheme — fuente de verdad ────────────────────────────────────────────
export function buildTheme(mode: ModeId, accentId: AccentId): Theme {
  const accent = ACCENTS.find(a => a.id === accentId) ?? ACCENTS[0]

  const light = {
    bg:           '#EEF2F8',
    surface:      '#FFFFFF',
    surfaceAlt:   accent.light,
    text:         '#1A2332',
    textSec:      '#6B7A8D',
    textMuted:    '#A0AFBE',
    border:       '#E2E8F0',
    tabBar:       '#FFFFFF',
    tabBarBorder: 'rgba(0,0,0,0.07)',
    income:       '#16A34A',
    expense:      '#DC2626',
  }

  const dark = {
    bg:           '#0D1B2A',
    surface:      '#162335',
    surfaceAlt:   '#1E2F42',
    text:         '#E8EEF5',
    textSec:      '#8BA3BA',
    textMuted:    '#546A7E',
    border:       '#243547',
    tabBar:       '#111E2D',
    tabBarBorder: 'rgba(255,255,255,0.06)',
    income:       '#22C55E',
    expense:      '#F87171',
  }

  const base = mode === 'claro' ? light : dark

  return {
    mode,
    accentId,
    ...base,
    primary:      accent.hex,
    primaryLight: accent.light,
    primaryDark:  accent.dark,
    balanceBg:    [accent.hex, accent.dark] as const,
    fabShadow:    `${accent.hex}55`,
  }
}

// ─── Contexto ─────────────────────────────────────────────────────────────────
type ThemeContextValue = {
  theme:     Theme
  accentId:  AccentId
  mode:      ModeId
  setAccent: (id: AccentId) => void
  setMode:   (mode: ModeId) => void
}

const ThemeContext = createContext<ThemeContextValue>({
  theme:     buildTheme('claro', 'rosado'),
  accentId:  'rosado',
  mode:      'claro',
  setAccent: () => {},
  setMode:   () => {},
})

const STORAGE_ACCENT = '@sinunmango:accent'
const STORAGE_MODE   = '@sinunmango:mode'

// Mapeo de IDs legacy (paletas viejas → nuevas)
const LEGACY_MAP: Record<string, AccentId> = {
  magenta: 'rosado',
  rosa:    'rosado',
  verde:   'verde',
  azul:    'azul',
  violeta: 'violeta',
  naranja: 'naranja',
  rosado:  'rosado',
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [accentId, setAccentState] = useState<AccentId>('rosado')
  const [mode, setModeState]       = useState<ModeId>('claro')

  useEffect(() => {
    Promise.all([
      AsyncStorage.getItem(STORAGE_ACCENT),
      AsyncStorage.getItem(STORAGE_MODE),
    ]).then(([storedAccent, storedMode]) => {
      if (storedAccent) {
        const mapped = LEGACY_MAP[storedAccent] ?? storedAccent
        if (ACCENTS.some(a => a.id === mapped)) setAccentState(mapped as AccentId)
      }
      if (storedMode === 'claro' || storedMode === 'oscuro') {
        setModeState(storedMode as ModeId)
      }
    })
  }, [])

  const setAccent = useCallback((id: AccentId) => {
    setAccentState(id)
    AsyncStorage.setItem(STORAGE_ACCENT, id)
  }, [])

  const setMode = useCallback((m: ModeId) => {
    setModeState(m)
    AsyncStorage.setItem(STORAGE_MODE, m)
  }, [])

  return (
    <ThemeContext.Provider value={{
      theme:    buildTheme(mode, accentId),
      accentId,
      mode,
      setAccent,
      setMode,
    }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme() {
  return useContext(ThemeContext)
}

// ─── Backward-compat exports (evitar romper imports existentes) ───────────────
export const PALETAS = ACCENTS.map(a => ({ id: a.id, label: a.label, accent: a.hex }))
export type PaletaId = AccentId
export const STATIC_COLORS = {
  bgMain:        '#EEF2F8',
  bgCard:        '#FFFFFF',
  textPrimary:   '#1A2332',
  textSecondary: '#6B7A8D',
  textMuted:     '#A0AFBE',
  border:        '#E2E8F0',
  borderSubtle:  '#F1F5F9',
  green:         '#16A34A',
  red:           '#DC2626',
  orange:        '#E8601A',
  white:         '#ffffff',
}
