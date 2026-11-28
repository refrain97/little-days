// Only the static files named by this release can enter the offline shell.
const revision = '__SITE_REVISION__'
const documentVersion = '__DOCUMENT_VERSION__'
const files = /*__SITE_FILES__*/ []
const scope = self.registration.scope
const indexURL = new URL('index.html', scope).href
const assets = new Map(
  files.map(([name, digest]) => [new URL(name, scope).href, digest]),
)
const fontURLs = new Set(
  [...assets.keys()].filter((url) => url.endsWith('.woff2')),
)
const versionedPath = /\.[a-f0-9]{16}(?=\.[a-z0-9]+$)/
const stableURLs = new Map(
  [...assets.keys()]
    .filter((url) => versionedPath.test(url))
    .map((url) => [url.replace(versionedPath, ''), url]),
)
const assetRequests = new Map()
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
    const cached = await priorAsset(url, prior)
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
          const cached = prior && (await priorAsset(url, prior))
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

// A tab with an open draft can finish with its original asset graph. Its cache
// is reclaimed when the new document starts, or on the next launch after it closes.
async function maintainReleases(activating, currentClient) {
  const windows = await self.clients.matchAll({
    type: 'window',
    includeUncontrolled: true,
  })
  const live = new Set(
    windows.filter((tab) => tab.url.startsWith(scope)).map((tab) => tab.id),
  )
  const db = await database()
  const tx = db.transaction(['settings', 'assets'], 'readwrite')
  const done = finished(tx)
  const settings = tx.objectStore('settings')
  const previous = settings.get('active')
  const retained = settings.get('retired')
  retained.onsuccess = () => {
    if (!activating && previous.result !== revision) return
    const old = retained.result || []
    if (activating && previous.result && previous.result !== revision) {
      const alreadyRetired = new Set(old.flatMap((item) => item.clients))
      old.push({
        release: previous.result,
        clients: [...live].filter((id) => !alreadyRetired.has(id)),
      })
    }
    const remaining = []
    for (const { release, clients } of old) {
      if (release === revision) continue
      const ids = clients.filter((id) => live.has(id) && id !== currentClient)
      if (ids.length) remaining.push({ release, clients: ids })
      else
        tx.objectStore('assets').delete(
          IDBKeyRange.bound([release, ''], [release, []]),
        )
    }
    settings.put(remaining, 'retired')
    if (activating) settings.put(revision, 'active')
  }
  await done
}

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      await maintainReleases(true)
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

async function priorAsset(url, prior) {
  const cached = await cachedAsset(url, prior)
  // The release immediately before fingerprinted URLs stored the logical names.
  return (
    cached ||
    (versionedPath.test(url) &&
      (await cachedAsset(url.replace(versionedPath, ''), prior)))
  )
}

async function retiredAsset(url, clientId) {
  if (!clientId) return null
  const db = await database()
  const tx = db.transaction('settings')
  const done = finished(tx)
  const settings = tx.objectStore('settings')
  const active = settings.get('active')
  const retired = settings.get('retired')
  await done
  const old = (retired.result || []).find((item) =>
    item.clients.includes(clientId),
  )
  const source = old?.release || (active.result !== revision && active.result)
  return source && cachedAsset(url, source)
}

function loadImmutable(url) {
  if (!assetRequests.has(url)) {
    const request = (async () => {
      const cached = await cachedAsset(url).catch(() => null)
      if (cached) return cached
      const { url: key, ...entry } = await fetchReleaseAsset(
        url,
        assets.get(url),
      )
      try {
        const db = await database()
        const tx = db.transaction('assets', 'readwrite')
        const complete = finished(tx)
        tx.objectStore('assets').put(entry, [revision, key])
        await complete
      } catch {
        // A full offline store still permits the verified network asset to render.
      }
      return entry
    })().finally(() => assetRequests.delete(url))
    assetRequests.set(url, request)
  }
  return assetRequests.get(url)
}

self.addEventListener('message', (event) => {
  if (
    event.data?.type === 'current-document' &&
    event.data.version === documentVersion
  ) {
    event.waitUntil(maintainReleases(false, event.source?.id))
    return
  }
  if (event.data?.type !== 'used-fonts' || !Array.isArray(event.data.urls))
    return
  const known = [...fontURLs].filter((url) => event.data.urls.includes(url))
  event.waitUntil(Promise.allSettled(known.map(loadImmutable)))
})

function restored(entry) {
  return new Response(entry.bytes, { headers: entry.headers })
}

// Never store a new network HTML document alongside an older set of modules.
// The installer commits each verified offline document and its assets together.
async function networkFirst(request, offlineResponse) {
  try {
    return await fetch(request, { cache: 'no-store' })
  } catch (error) {
    const cached = await offlineResponse()
    if (cached) return cached
    throw error
  }
}

self.addEventListener('fetch', (event) => {
  const request = event.request
  if (
    request.method !== 'GET' ||
    request.headers.has('authorization') ||
    request.headers.has('x-api-key')
  )
    return
  const url = new URL(request.url)
  if (!url.href.startsWith(scope)) return
  url.hash = ''
  const address = url.href
  url.search = ''
  const key = url.href
  if (request.mode === 'navigate' || key === indexURL || key === scope) {
    event.respondWith(
      networkFirst(request, async () => {
        const entry = await cachedAsset(indexURL)
        return entry && restored(entry)
      }),
    )
    return
  }
  if (
    address !== key ||
    (request.headers.has('range') && !key.endsWith('.woff2'))
  )
    return
  if (assets.has(key) && versionedPath.test(key)) {
    event.respondWith(loadImmutable(key).then(restored))
    return
  }
  if (stableURLs.has(key) || assets.has(key)) {
    event.respondWith(
      networkFirst(request, async () => {
        const target = stableURLs.get(key) || key
        if (target !== key && key.endsWith('.js'))
          return new Response('export * from ' + JSON.stringify(target), {
            headers: { 'Content-Type': 'text/javascript' },
          })
        const entry = await cachedAsset(target)
        return entry && restored(entry)
      }),
    )
  } else if (versionedPath.test(key)) {
    // HTML from the network can already belong to the next release. Unknown
    // immutable URLs go to the network unless this is a still-open retired tab.
    event.respondWith(
      (async () => {
        const entry = await retiredAsset(key, event.clientId).catch(() => null)
        return entry ? restored(entry) : fetch(request)
      })(),
    )
  }
})
