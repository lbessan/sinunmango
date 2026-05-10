# sinunmango — landing

Landing de marketing para [sinunmango.com.ar](https://sinunmango.com.ar). La app vive en [app.sinunmango.com.ar](https://app.sinunmango.com.ar).

## Stack

- [Astro 5](https://astro.build/) — sitio estático
- [Tailwind CSS 4](https://tailwindcss.com/) — utility classes (config CSS-first vía `@theme` en `src/styles/global.css`)
- TypeScript en modo strict

## Desarrollo

```bash
npm install
npm run dev    # http://localhost:4321
npm run build  # genera dist/
npm run preview
```

## Estructura

```
landing/
├── public/                  Assets estáticos (manguito.png, screenshots/, favicon)
├── src/
│   ├── layouts/Layout.astro Layout base con SEO + estilos globales
│   ├── pages/
│   │   ├── index.astro      Home (Hero, Features, Screenshots, FAQ)
│   │   └── privacidad.astro Política de privacidad
│   ├── components/
│   │   ├── Hero.astro
│   │   ├── Features.astro
│   │   ├── Screenshots.astro
│   │   ├── FAQ.astro
│   │   └── Footer.astro
│   └── styles/global.css    Tailwind import + paleta de marca (CSS vars)
└── astro.config.mjs
```

## Deploy a Vercel

Va como un **proyecto separado** dentro del mismo repo (no toca el deploy de la app web). Pasos:

1. En el dashboard de Vercel: **Add New → Project → Import** el repo `finanzas-lb`.
2. En la pantalla de configuración:
   - **Root Directory**: `landing` (botón "Edit" → seleccionar la carpeta).
   - **Framework Preset**: Astro (debería autodetectarse al elegir el root).
   - **Build Command**: `npm run build` (default).
   - **Output Directory**: `dist` (default).
   - **Install Command**: `npm install` (default).
3. **Deploy**.
4. Una vez verde, ir a **Settings → Domains** y agregar `sinunmango.com.ar` y `www.sinunmango.com.ar`. Configurar los DNS A/CNAME que indique Vercel.
5. La app web queda intacta en `app.sinunmango.com.ar`, sirviéndose desde el otro proyecto Vercel apuntado a la raíz del repo.

## Próximos pasos sugeridos

- [ ] Capturar los 4 screenshots (ver `public/screenshots/README.md`) y descomentar las props `image` en `src/components/Screenshots.astro`.
- [ ] Generar un OG image dedicado (1200×630) y reemplazar `manguito.png` como `ogImage` en `Layout.astro`.
- [ ] Si se publica la app de Android, agregar un badge "Disponible en Google Play" debajo de los CTAs del Hero.
- [ ] Considerar revisar el copy de la sección de privacidad con un abogado antes de abrir registros públicos.

## Screenshots

Los placeholders en la sección "Así se ve" deben reemplazarse por capturas reales. Ver `public/screenshots/README.md`.
