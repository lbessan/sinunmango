// Tokens de color que replican el theme de la web (globals.css)
export const Colors = {
  // Brand — rosa/magenta como la configuración del usuario en la web
  accent:   '#d946ef',
  accent2:  '#9333ea',
  sidebar:  '#0d2137',

  // Backgrounds
  bgMain:   '#f1f5f9',
  bgCard:   '#ffffff',

  // Text
  textPrimary:   '#1e293b',
  textSecondary: '#475569',
  textMuted:     '#94a3b8',

  // Border
  border:       '#e2e8f0',
  borderSubtle: '#f1f5f9',

  // Semantic
  green:  '#1a6b5a',
  red:    '#ef4444',
  orange: '#f97316',

  // White / transparent
  white: '#ffffff',
}

// Gradiente del banner (igual que en la web)
export const BANNER_GRADIENT = {
  colors: [Colors.sidebar, Colors.accent2, Colors.accent],
  start:  { x: 0, y: 0 },
  end:    { x: 1, y: 1 },
}
