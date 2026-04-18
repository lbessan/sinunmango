'use client'

import { Sun, Moon } from 'lucide-react'
import { useTheme } from './theme-provider'

export function DarkModeToggle() {
  const { isDark, toggleDark } = useTheme()

  return (
    <div className="flex items-center bg-white/10 rounded-xl p-1 w-full">
      <button
        onClick={() => isDark && toggleDark()}
        className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-medium transition-all ${
          !isDark
            ? 'bg-white text-slate-700 shadow-sm'
            : 'text-white/50 hover:text-white/70'
        }`}
      >
        <Sun size={12} /> Claro
      </button>
      <button
        onClick={() => !isDark && toggleDark()}
        className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-medium transition-all ${
          isDark
            ? 'bg-white/20 text-white shadow-sm'
            : 'text-white/50 hover:text-white/70'
        }`}
      >
        <Moon size={12} /> Oscuro
      </button>
    </div>
  )
}
