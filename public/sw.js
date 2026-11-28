// Only the static files named by this release can enter the offline shell.
const revision = '__SITE_REVISION__'
const files = /*__SITE_FILES__*/ []
const scope = self.registration.scope
const indexURL = new URL('index.html', scope).href
const assets = new Map(
  files.map(([name, digest]) => [new URL(name, scope).href, digest]),
)
const fontURLs = new Set(
  [...assets.keys()].filter((url) => url.endsWith('.woff2')),
)
const fontRequests = new Map()
let connection

function database() {
  if (!connection)
    connection = new Promise((resolve, reject) => {
      const open = indexedDB.open('little-days-shell:' + scope, 1)
      open.onupgradeneeded = () => {
        open.result.createObjectStore('assets')
        open.result.createObjectStore('settings')
      }
      open.onsuccess = () => {
        const db = open.result
        db.onversionchange = () => {
          db.close()
          connection = null
        }
        resolve(db)
      }
      open.onerror = () => {
        connection = null
        reject(open.error)
      }
    })
  return connection
}

function finished(transaction) {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = resolve
    transaction.onabort = () => reject(transaction.error)
  })
}

async function fetchReleaseAsset(url, digest, prior) {
  if (prior) {
    const cached = await cachedAsset(url, prior)
    if (cached?.digest === digest) return { url, ...cached }
  }
  // First revalidate the normal URL to reuse the browser's initial page load.
  // A versioned retry covers an edge cache serving files from the previous release.
  for (const address of [url, url + '?v=' + digest.slice(0, 16)]) {
    const response = await fetch(address, {
      cache: 'no-cache',
      credentials: 'omit',
      redirect: 'error',
    })
    if (!response.ok) continue
    const bytes = await response.arrayBuffer()
    const actual = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))
    if (
      Array.from(actual, (byte) => byte.toString(16).padStart(2, '0')).join(
        '',
      ) !== digest
    )
      continue
    const headers = new Headers(response.headers)
    headers.delete('content-encoding')
    headers.delete('content-length')
    return { url, headers: [...headers], bytes, digest }
  }
  throw new Error('离线文件尚未全部更新。')
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const db = await database()
      const prior = await new Promise((resolve, reject) => {
        const get = db
          .transaction('settings')
          .objectStore('settings')
          .get('active')
        get.onsuccess = () => resolve(get.result)
        get.onerror = () => reject(get.error)
      })
      const entries = await Promise.all(
        [...assets].map(async ([url, digest]) => {
          if (!fontURLs.has(url)) return fetchReleaseAsset(url, digest, prior)
          // Keep previously used glyph ranges, but don't download unused ranges during installation.
          const cached = prior && (await cachedAsset(url, prior))
          return cached?.digest === digest ? { url, ...cached } : null
        }),
      )
      const tx = db.transaction('assets', 'readwrite')
      const complete = finished(tx)
      for (const { url, ...entry } of entries.filter(Boolean))
        tx.objectStore('assets').put(entry, [revision, url])
      await complete
      await self.skipWaiting()
    })(),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const db = await database()
      const tx = db.transaction(['settings', 'assets'], 'readwrite')
      const complete = finished(tx)
      const settings = tx.objectStore('settings')
      const prior = settings.get('active')
      prior.onsuccess = () => {
        if (prior.result && prior.result !== revision) {
          tx.objectStore('assets').delete(
            IDBKeyRange.bound([prior.result, ''], [prior.result, []]),
          )
        }
        settings.put(revision, 'active')
      }
      await complete
      await self.clients.claim()
      // Versions before the IndexedDB shell used Cache Storage. Remove only this site's copies.
      if (self.caches) {
        const prefix = 'little-days-shell:' + encodeURIComponent(scope) + ':'
        for (const name of await caches.keys())
          if (name.startsWith(prefix)) await caches.delete(name)
      }
    })(),
  )
})

async function cachedAsset(url, version = revision) {
  const db = await database()
  return new Promise((resolve, reject) => {
    const get = db
      .transaction('assets')
      .objectStore('assets')
      .get([version, url])
    get.onsuccess = () => resolve(get.result)
    get.onerror = () => reject(get.error)
  })
}

function loadFont(url) {
  if (!fontRequests.has(url)) {
    const request = (async () => {
      const cached = await cachedAsset(url)
      if (cached) return cached
      const { url: key, ...font } = await fetchReleaseAsset(
        url,
        assets.get(url),
      )
      const db = await database()
      const tx = db.transaction('assets', 'readwrite')
      const complete = finished(tx)
      tx.objectStore('assets').put(font, [revision, key])
      await complete
      return font
    })().finally(() => fontRequests.delete(url))
    fontRequests.set(url, request)
  }
  return fontRequests.get(url)
}

self.addEventListener('message', (event) => {
  if (event.data?.type !== 'used-fonts' || !Array.isArray(event.data.urls))
    return
  const known = [...fontURLs].filter((url) => event.data.urls.includes(url))
  event.waitUntil(Promise.allSettled(known.map(loadFont)))
})

self.addEventListener('fetch', (event) => {
  const request = event.request
  if (
    request.method !== 'GET' ||
    request.headers.has('authorization') ||
    request.headers.has('x-api-key') ||
    (request.headers.has('range') && !fontURLs.has(request.url))
  )
    return
  const url = new URL(request.url)
  if (url.origin !== self.location.origin || url.search) return
  url.hash = ''
  const key = url.href === scope ? indexURL : url.href
  if (!assets.has(key)) return
  event.respondWith(
    (async () => {
      const entry = await (
        fontURLs.has(key) ? loadFont(key) : cachedAsset(key)
      ).catch(() => null)
      return entry
        ? new Response(entry.bytes, { headers: entry.headers })
        : fetch(request)
    })(),
  )
})
