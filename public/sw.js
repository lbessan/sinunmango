// sinunmango Service Worker
//
// Estrategia minimalista: solo cachea assets estáticos del /public folder
// (logos, fonts). Páginas HTML, requests RSC, API y POST pasan directo al
// network sin que el SW intervenga.
//
// Por qué no cacheamos páginas HTML:
//   - Tienen contenido del user logueado (info privada). Si el browser lo
//     comparte otro user o la sesión vence, mostrar HTML cacheado sería
//     un leak/inconsistencia.
//   - En Next 16 el router cliente hace requests RSC (no HTML completo).
//     Cachear esos rompe la navegación interna.
//
// El PWA manifest sigue funcionando (install to home screen) — solo
// limitamos el comportamiento offline a recursos estáticos.

const CACHE_NAME = 'sinunmango-v2'

const STATIC_ASSETS = [
  '/logo.png',
  '/manguito.png',
  '/favicon.ico',
]

// Install: pre-cache static assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(STATIC_ASSETS))
  )
  self.skipWaiting()
})

// Activate: clean up old caches (incluyendo sinunmango-v1 viejo que
// tenía páginas HTML autenticadas cacheadas — issue de privacidad)
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  )
  self.clients.claim()
})

// Fetch: solo manejamos GETs same-origin de assets estáticos.
// Todo lo demás pasa al fetch default sin event.respondWith().
self.addEventListener('fetch', (event) => {
  const { request } = event
  const url = new URL(request.url)

  if (
    request.method !== 'GET' ||
    url.origin !== self.location.origin ||
    !url.pathname.match(/\.(png|jpg|jpeg|svg|ico|woff2?|webp)$/i)
  ) {
    return
  }

  event.respondWith(
    caches.match(request).then(cached => {
      if (cached) return cached
      return fetch(request).then(response => {
        // Solo cacheamos respuestas OK same-origin
        if (response.ok && response.type === 'basic') {
          const clone = response.clone()
          caches.open(CACHE_NAME).then(cache => cache.put(request, clone))
        }
        return response
      })
    })
  )
})
