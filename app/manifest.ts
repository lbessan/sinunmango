import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'sinunmango — Finanzas personales',
    short_name: 'sinunmango',
    description: 'Tu gestor financiero personal',
    start_url: '/dashboard',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#0d2137',
    theme_color: '#0d2137',
    categories: ['finance', 'productivity'],
    // Icons separados por purpose:
    //   - 'any' (192/512): el icon "normal" usado por Chrome, share menus, etc.
    //     Logo al 80% del frame.
    //   - 'maskable' (512): tiene safe-zone — el logo solo ocupa el 60% central
    //     del frame, dejando margen para que launchers Android (squircle,
    //     círculo, teardrop) puedan recortar sin comerse el manguito.
    // Antes era un solo /logo.png sin safe-zone — quedaba recortado en
    // algunos launchers.
    icons: [
      {
        src:     '/icon-any-192.png',
        sizes:   '192x192',
        type:    'image/png',
        purpose: 'any',
      },
      {
        src:     '/icon-any-512.png',
        sizes:   '512x512',
        type:    'image/png',
        purpose: 'any',
      },
      {
        src:     '/icon-maskable-512.png',
        sizes:   '512x512',
        type:    'image/png',
        purpose: 'maskable',
      },
    ],
    // Shortcuts del manifest — accesos directos al hacer long-press sobre el
    // icon de la PWA en Android (Chromium). iOS Safari los ignora pero no
    // rompe nada. Hasta 4 funcionan bien; con más, algunos launchers limitan.
    shortcuts: [
      {
        name:        'Nuevo movimiento',
        short_name:  'Nuevo',
        description: 'Registrar un gasto, ingreso o transferencia',
        url:         '/movimientos/nuevo',
      },
      {
        name:        'Movimientos',
        short_name:  'Movimientos',
        description: 'Ver el historial de movimientos',
        url:         '/movimientos',
      },
      {
        name:        'Dashboard',
        short_name:  'Dashboard',
        description: 'Resumen general del mes',
        url:         '/dashboard',
      },
    ],
    screenshots: [],
  }
}
