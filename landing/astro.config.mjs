// @ts-check
import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';
import sitemap from '@astrojs/sitemap';

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
  vite: {
    plugins: [tailwindcss()],
  },
});
