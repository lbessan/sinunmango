'use client'

import { useState, useEffect } from 'react'
import { Share, X } from 'lucide-react'

// ─── iOS PWA install banner ──────────────────────────────────────────────────
//
// iOS Safari no soporta `beforeinstallprompt` ni un prompt nativo de "instalar
// app". Los users tienen que descubrir manualmente que pueden agregar a la
// pantalla de inicio. Este banner les da instrucciones cuando detectamos:
//
//   1. Es iOS (iPhone/iPad/iPod)
//   2. Es Safari (no Chrome iOS / Firefox iOS — esos también son WebKit pero
//      Apple no les expone el "Add to Home Screen")
//   3. NO está corriendo en standalone (ya instalada)
//
// Después de descartarlo, guardamos un flag en localStorage para no mostrarlo
// de nuevo en este navegador. Es un "soft prompt" — no insistimos.

const DISMISSED_KEY = 'ios_install_banner_dismissed_v1'
// Esperamos 3s antes de mostrar para no ser intrusivos al cargar la app.
const SHOW_DELAY_MS = 3_000

function detectIOSSafari(): boolean {
  if (typeof window === 'undefined') return false

  const ua = window.navigator.userAgent
  const isIOS =
    /iPhone|iPad|iPod/.test(ua) ||
    // iPadOS 13+ se anuncia como Mac — chequeamos touch points
    (ua.includes('Mac') && 'ontouchend' in document)

  // Safari real, no Chrome/Firefox/Edge en iOS (todos esos contienen su propio token)
  const isSafari = /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS|OPiOS|YaBrowser/.test(ua)

  // navigator.standalone es API legacy específica de iOS Safari para detectar
  // PWAs agregadas a home screen. matchMedia también funciona en navegadores
  // modernos cuando la app ya está instalada.
  const nav      = window.navigator as Navigator & { standalone?: boolean }
  const isStandalone =
    nav.standalone === true ||
    window.matchMedia('(display-mode: standalone)').matches

  return isIOS && isSafari && !isStandalone
}

export function IOSInstallBanner() {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    // Evitar SSR mismatch — solo evaluamos en cliente
    if (typeof window === 'undefined') return
    try {
      if (localStorage.getItem(DISMISSED_KEY) === '1') return
    } catch {
      // localStorage puede tirar en privado/iframe sandboxed; tratamos como
      // "no dismissado" y dejamos que aparezca
    }
    if (!detectIOSSafari()) return

    const t = setTimeout(() => setVisible(true), SHOW_DELAY_MS)
    return () => clearTimeout(t)
  }, [])

  const dismiss = () => {
    setVisible(false)
    try { localStorage.setItem(DISMISSED_KEY, '1') } catch { /* ignore */ }
  }

  if (!visible) return null

  return (
    <div
      role="dialog"
      aria-label="Instalá sinunmango en tu iPhone"
      className="fixed inset-x-0 z-[60] mx-auto max-w-md px-4"
      // bottom respeta el safe-area-inset-bottom para que no choque con el
      // home indicator. 16px de gap encima del safe-area.
      style={{ bottom: 'calc(16px + env(safe-area-inset-bottom))' }}
    >
      <div
        className="relative rounded-2xl shadow-xl border p-4 pr-10"
        style={{
          background:   'var(--bg-card, #ffffff)',
          borderColor:  'var(--border, #e2e8f0)',
        }}
      >
        <button
          onClick={dismiss}
          aria-label="Cerrar"
          className="absolute top-3 right-3 w-7 h-7 rounded-full flex items-center justify-center hover:bg-black/5 transition"
          style={{ color: 'var(--text-muted, #94a3b8)' }}
        >
          <X size={16} />
        </button>

        <div className="flex items-start gap-3">
          <div
            className="shrink-0 w-10 h-10 rounded-xl flex items-center justify-center overflow-hidden"
            style={{ background: '#0d2137' }}
          >
            {/* Logo del Manguito real (no emoji 🥭) — consistente con la
                identidad de marca en el resto de la app. */}
            <img src="/manguito.png" alt="" aria-hidden="true" className="w-7 h-7 object-contain" />
          </div>
          <div className="flex-1 min-w-0">
            <p
              className="font-bold text-sm leading-tight"
              style={{ color: 'var(--text-primary, #1e293b)' }}
            >
              Instalá sinunmango
            </p>
            <p
              className="text-xs mt-1 leading-snug"
              style={{ color: 'var(--text-secondary, #475569)' }}
            >
              Tocá <Share size={12} className="inline align-text-bottom mx-0.5" aria-label="Compartir" />
              {' '}Compartir y elegí <strong>Agregar a pantalla de inicio</strong>.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
