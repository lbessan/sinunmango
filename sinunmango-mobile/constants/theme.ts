// Tokens de color — replicando el theme de la web del usuario (magenta/rosa oscuro)
export const Colors = {
  // Brand
  accent:   '#94184A',   // magenta oscuro (color del usuario)
  accent2:  '#5c0f2e',   // dark pink (punto medio del gradiente)
  sidebar:  '#1a0028',   // fondo oscuro casi negro con tinte púrpura

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
  green:  '#16a34a',
  red:    '#ef4444',
  orange: '#f97316',

  // White / transparent
  white: '#ffffff',
}

// Gradiente del banner: oscuro → magenta (igual que la web)
export const BANNER_GRADIENT = {
  colors: [Colors.sidebar, Colors.accent2, Colors.accent],
  start:  { x: 0, y: 0 },
  end:    { x: 1, y: 1 },
}
