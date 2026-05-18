// PostCSS config — Tailwind 4 vía el plugin de PostCSS.
//
// Antes usábamos @tailwindcss/vite (integration directa de Vite) pero
// no es compatible con Astro 6 + rolldown-vite (bug:
// https://github.com/withastro/astro/issues/16542). La solución oficial
// es usar el plugin de PostCSS, que sí funciona con rolldown.
//
// Astro detecta automáticamente este archivo y lo aplica a todo el CSS.
export default {
  plugins: {
    "@tailwindcss/postcss": {},
  },
};
