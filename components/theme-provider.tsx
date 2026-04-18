'use client'

import { useEffect, createContext, useContext, useState, useCallback } from 'react'

// ─── Presets ──────────────────────────────────────────────────────────────────
export const THEMES = {
  verde: {
    label:   'Verde',
    accent:  '#1a6b5a',
    accent2: '#1B3A6B',
    sidebar: '#0d2137',
    preview: '#1a6b5a',
  },
  azul: {
    label:   'Azul',
    accent:  '#2563eb',
    accent2: '#1e3a8a',
    sidebar: '#0c1829',
    preview: '#2563eb',
  },
  violeta: {
    label:   'Violeta',
    accent:  '#7c3aed',
    accent2: '#4c1d95',
    sidebar: '#160d2b',
    preview: '#7c3aed',
  },
  naranja: {
    label:   'Naranja',
    accent:  '#c2410c',
    accent2: '#7c2d12',
    sidebar: '#1a0d08',
    preview: '#c2410c',
  },
  rosado: {
    label:   'Rosado',
    accent:  '#be185d',
    accent2: '#831843',
    sidebar: '#1a0a14',
    preview: '#be185d',
  },
} as const

export type ThemeKey = keyof typeof THEMES

export const STORAGE_THEME    = 'finanzas-theme'
export const STORAGE_DARKMODE = 'finanzas-darkmode'

// Applies a color theme by setting CSS custom properties on <html>
export function applyTheme(key: ThemeKey) {
  const t    = THEMES[key]
  const root = document.documentElement
  root.style.setProperty('--accent',     t.accent)
  root.style.setProperty('--accent2',    t.accent2)
  root.style.setProperty('--sidebar-bg', t.sidebar)
}

// Applies or removes the .dark class on <html>
export function applyDarkMode(dark: boolean) {
  if (dark) {
    document.documentElement.classList.add('dark')
  } else {
    document.documentElement.classList.remove('dark')
  }
}

// ─── Context ──────────────────────────────────────────────────────────────────
interface ThemeCtx {
  isDark: boolean
  toggleDark: () => void
}

const ThemeContext = createContext<ThemeCtx>({ isDark: false, toggleDark: () => {} })

export function useTheme() {
  return useContext(ThemeContext)
}

// ─── Provider ─────────────────────────────────────────────────────────────────
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [isDark, setIsDark] = useState(false)

  // Restore on mount (before first paint — also in <script> below for SSR)
  useEffect(() => {
    const savedTheme = localStorage.getItem(STORAGE_THEME) as ThemeKey | null
    const savedDark  = localStorage.getItem(STORAGE_DARKMODE) === 'true'

    if (savedTheme && THEMES[savedTheme]) applyTheme(savedTheme)
    applyDarkMode(savedDark)
    setIsDark(savedDark)
  }, [])

  const toggleDark = useCallback(() => {
    setIsDark(prev => {
      const next = !prev
      applyDarkMode(next)
      localStorage.setItem(STORAGE_DARKMODE, String(next))
      return next
    })
  }, [])

  return (
    <ThemeContext.Provider value={{ isDark, toggleDark }}>
      {/* Inline script to apply dark mode before first paint (no flash) */}
      <script
        dangerouslySetInnerHTML={{
          __html: `(function(){try{var d=localStorage.getItem('${STORAGE_DARKMODE}');if(d==='true')document.documentElement.classList.add('dark');}catch(e){}})()`,
        }}
      />
      {children}
    </ThemeContext.Provider>
  )
}
