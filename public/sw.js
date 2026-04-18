// sinunmango Service Worker
// Strategy: Network-first for API routes, cache-first for static assets

const CACHE_NAME = 'sinunmango-v1'

const STATIC_ASSETS = [
  '/',
  '/dashboard',
  '/logo.png',
]

// Install: pre-cache static assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(STATIC_ASSETS))
  )
  self.skipWaiting()
})

// Activate: clean up old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  )
  self.clients.claim()
})

// Fetch: network-first for API/auth, cache-first for static
self.addEventListener('fetch', (event) => {
  const { request } = event
  const url = new URL(request.url)

  // Always go network for API routes, auth, and Supabase
  if (
    url.pathname.startsWith('/api/') ||
    url.hostname.includes('supabase') ||
    request.method !== 'GET'
  ) {
    return // default fetch behavior
  }

  // Cache-first for same-origin static assets (images, fonts, etc.)
  if (url.pathname.match(/\.(png|jpg|jpeg|svg|ico|woff2?|css|js)$/)) {
    event.respondWith(
      caches.match(request).then(cached => cached ?? fetch(request))
    )
    return
  }

  // Network-first for HTML pages (so we always get fresh content)
  event.respondWith(
    fetch(request)
      .then(response => {
        const clone = response.clone()
        caches.open(CACHE_NAME).then(cache => cache.put(request, clone))
        return response
      })
      .catch(() => caches.match(request))
  )
})
