// Only the static files named by this release can enter the offline shell.
const revision = '__SITE_REVISION__'
const files = /*__SITE_FILES__*/ []
const scope = self.registration.scope
const indexURL = new URL('index.html', scope).href
const assets = new Set(files.map((file) => new URL(file, scope).href))
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

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      // Keep the previous release available if even one download or write fails.
      const entries = await Promise.all(
        [...assets].map(async (url) => {
          const response = await fetch(url, {
            cache: 'no-store',
            credentials: 'omit',
            redirect: 'error',
          })
          if (!response.ok) throw new Error('离线文件未能下载。')
          const headers = new Headers(response.headers)
          headers.delete('content-encoding')
          headers.delete('content-length')
          return {
            url,
            headers: [...headers],
            bytes: await response.arrayBuffer(),
          }
        }),
      )
      const db = await database()
      const tx = db.transaction('assets', 'readwrite')
      const complete = finished(tx)
      for (const { url, ...entry } of entries)
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

async function cachedAsset(url) {
  const db = await database()
  return new Promise((resolve, reject) => {
    const get = db
      .transaction('assets')
      .objectStore('assets')
      .get([revision, url])
    get.onsuccess = () => resolve(get.result)
    get.onerror = () => reject(get.error)
  })
}

self.addEventListener('fetch', (event) => {
  const request = event.request
  if (
    request.method !== 'GET' ||
    request.headers.has('authorization') ||
    request.headers.has('x-api-key') ||
    request.headers.has('range')
  )
    return
  const url = new URL(request.url)
  if (url.origin !== self.location.origin || url.search) return
  url.hash = ''
  const key = url.href === scope ? indexURL : url.href
  if (!assets.has(key)) return
  event.respondWith(
    (async () => {
      const entry = await cachedAsset(key).catch(() => null)
      return entry
        ? new Response(entry.bytes, { headers: entry.headers })
        : fetch(request)
    })(),
  )
})
