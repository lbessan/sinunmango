// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

// Tailwind 4 se integra vía PostCSS (ver postcss.config.mjs) en lugar de
// @tailwindcss/vite, porque este último no es compatible con Astro 6 +
// rolldown-vite (https://github.com/withastro/astro/issues/16542).
// Astro detecta postcss.config.mjs automáticamente.

// https://astro.build/config
export default defineConfig({
  site: 'https://sinunmango.com.ar',
  integrations: [
    // Genera /sitemap-index.xml + sitemap-0.xml en build. Google los
    // descubre via el link en robots.txt (ver public/robots.txt).
    sitemap({
      lastmod: new Date(),
      // Solo 2 páginas hoy (/ y /privacidad); no necesitamos filter custom.
    }),
  ],
});
