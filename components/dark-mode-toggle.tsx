'use client'

import { Moon, Sun } from 'lucide-react'
import { useTheme } from './theme-provider'

export function DarkModeToggle() {
  const { isDark, toggleDark } = useTheme()

  return (
    <button
      onClick={toggleDark}
      title={isDark ? 'Modo claro' : 'Modo oscuro'}
      className="w-8 h-8 rounded-lg flex items-center justify-center transition-colors hover:bg-white/10"
      style={{ color: '#94a3b8' }}
    >
      {isDark ? <Sun size={16} /> : <Moon size={16} />}
    </button>
  )
}
