// Build and local preview inline the release's explicit list of public assets.
const revision = '__SITE_REVISION__'
const files = /*__SITE_FILES__*/ []
const scope = self.registration.scope
const prefix = 'little-days-shell:' + encodeURIComponent(scope) + ':'
const cacheName = prefix + revision
const assets = new Set(files.map((file) => new URL(file, scope).href))
const indexURL = new URL('index.html', scope).href

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(cacheName)
    await cache.addAll([...assets].map((url) => new Request(url, {
      cache: 'reload',
      credentials: 'omit',
    })))
    await self.skipWaiting()
  })())
})

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) {
      if (key.startsWith(prefix) && key !== cacheName) await caches.delete(key)
    }
    await self.clients.claim()
  })())
})

self.addEventListener('fetch', (event) => {
  const request = event.request
  if (request.method !== 'GET' || request.headers.has('authorization') ||
      request.headers.has('x-api-key') || request.headers.has('range')) return
  const url = new URL(request.url)
  if (url.origin !== self.location.origin || url.search) return
  // Navigation requests may retain hash routes such as #home or #kitchen.
  url.hash = ''
  const key = url.href === scope ? indexURL : url.href
  // Only these exact release files are eligible. All sync and AI requests pass through.
  if (!assets.has(key)) return
  event.respondWith((async () => {
    const cache = await caches.open(cacheName)
    return (await cache.match(key)) || fetch(request)
  })())
})
