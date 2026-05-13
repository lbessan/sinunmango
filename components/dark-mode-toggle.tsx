'use client'

import { useState } from 'react'
import { Sun, Moon, Lock } from 'lucide-react'
import { useTheme } from './theme-provider'
import { LimitReachedModal } from './limit-reached-modal'

export function DarkModeToggle({ hasProAccess }: { hasProAccess: boolean }) {
  const { isDark, toggleDark } = useTheme()
  const [showProGate, setShowProGate] = useState(false)

  // En Free: cualquier click intenta abrir modal Pro (no toggle).
  const onClickClaro  = () => { if (!hasProAccess) { setShowProGate(true); return } if (isDark)  toggleDark() }
  const onClickOscuro = () => { if (!hasProAccess) { setShowProGate(true); return } if (!isDark) toggleDark() }

  return (
    <>
      <div className={`flex items-center bg-white/10 rounded-xl p-1 w-full relative ${!hasProAccess ? 'opacity-70' : ''}`}>
        <button
          onClick={onClickClaro}
          className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-medium transition-all ${
            !isDark
              ? 'bg-white text-slate-700 shadow-sm'
              : 'text-white/50 hover:text-white/70'
          }`}
        >
          <Sun size={12} /> Claro
        </button>
        <button
          onClick={onClickOscuro}
          className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-medium transition-all ${
            isDark
              ? 'bg-white/20 text-white shadow-sm'
              : 'text-white/50 hover:text-white/70'
          }`}
        >
          <Moon size={12} /> Oscuro
        </button>
        {!hasProAccess && (
          <Lock size={10} className="absolute -top-1 -right-1 text-white/60 bg-slate-700 rounded-full p-0.5" />
        )}
      </div>
      <LimitReachedModal
        info={showProGate ? { feature: 'personalizacion', limit: -1, used: 0 } : null}
        onClose={() => setShowProGate(false)}
      />
    </>
  )
}
