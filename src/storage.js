import {readProfile} from './cloud-profile.js'
import {
  loadEntries,
  saveEntries,
  createEntry,
  upgradeDiningRecords,
  SEED_ENTRIES,
  publicAuthor, authorship, venueKey,
} from './journal.js'
import {
  mediaPrefix,
  isLocalMedia,
  dataMediaBinary,
  binaryDataUrl,
  blobDataUrl,
  observeMedia,
  mediaAttributes,
} from './media-store.js'
export { mediaAttributes }

const favoritePrefix = 'xiaorizi.favorite-toggle:'
const journalKey = 'xiaorizi.journal.v1'
const changeKey = 'xiaorizi.records-change'
const channel =
  typeof BroadcastChannel === 'function'
    ? new BroadcastChannel('little-days-changes')
    : null
const listeners = new Set()
const newToken = () =>
  globalThis.crypto?.randomUUID?.() ||
  Date.now().toString(36) + '-' + Math.random().toString(36).slice(2)
const tabId = newToken()
const kinds = ['image', 'audio']
const recordStores = ['records', 'media', 'settings', 'plans', 'places']
const lock = (fn) =>
  globalThis.navigator?.locks
    ? navigator.locks.request('xiaorizi-local-journal', fn)
    : fn()
let opening, initialized

export function requestDone(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}
export function transactionDone(tx) {
  return new Promise((resolve, reject) => {
    tx.oncomplete = resolve
    tx.onabort = () =>
      reject(tx.error || new Error('读取或保存未完成，请检查设备的可用空间。'))
  })
}
export function signalCloudChange() {
  globalThis.dispatchEvent?.(new Event('little-days-local-edit'))
}
export function localAuthor(previous) {
  const actor = publicAuthor(readProfile())
  return authorship({author: previous?.author || actor, updatedBy: actor || previous?.updatedBy})
}
export function announce(event = 'updated', local = false) {
  if (event !== 'cloud') signalCloudChange()
  if (channel) channel.postMessage(event)
  else
    try {
      localStorage.setItem(changeKey, JSON.stringify([event, newToken()]))
    } catch {}
  if (local) for (const fn of listeners) fn(event)
}

function writeSplit(stores, entry, previous, paths = {}) {
  const { records, media } = stores
  const meta = { ...entry }
  for (const kind of kinds) {
    const value = entry[kind] || ''
    const prior = previous?.[kind]
    const cloudPath = kind === 'image' ? 'cloudPhotoPath' : 'cloudAudioPath'
    if (paths[cloudPath]) meta[cloudPath] = paths[cloudPath]
    else if (prior && prior === value && previous?.[cloudPath]) meta[cloudPath]=previous[cloudPath]
    if (prior === value && isLocalMedia(prior)) continue
    const key = () =>
      mediaPrefix + encodeURIComponent(entry.id) + '/' + kind + '/' + newToken()
    if (value.startsWith('data:')) {
      meta[kind] = key()
      // ArrayBuffer is also supported by ephemeral WebKit stores that reject Blob writes.
      media.put(dataMediaBinary(value, kind), meta[kind])
    } else if (isLocalMedia(value)) {
      // A newly created entry can reuse another record's media. Give it its own lifetime.
      meta[kind] = key()
      const ownerKey = value.slice(mediaPrefix.length).split('/')[0]
      const owner = records.get(decodeURIComponent(ownerKey))
      const copy = media.get(value)
      copy.onsuccess = () => {
        if (!copy.result || (entry.visibility === 'shared' && (!owner.result || owner.result.visibility === 'private'))) {
          media.transaction.abort()
          return
        }
        media.put(copy.result, meta[kind])
      }
    }
    if (isLocalMedia(prior)) media.delete(prior)
  }
  records.put(meta)
  return meta
}
function storesFor(tx) {
  return { records: tx.objectStore('records'), media: tx.objectStore('media') }
}
function openDatabase() {
  if (opening) return opening
  opening = new Promise((resolve, reject) => {
    if (!globalThis.indexedDB) return resolve(null)
    let req
    try {
      req = indexedDB.open('little-days', 3)
    } catch {
      return resolve(null)
    }
    let upgradeError
    let blocked = false
    req.onblocked = () => {
      blocked = true
      reject(
        new Error(
          '另一页旧版「小日子」仍在使用手记。请关闭旧页面后重试，本机记录仍然保留。',
        ),
      )
    }
    req.onupgradeneeded = () => {
      const db = req.result,
        tx = req.transaction
      if (!db.objectStoreNames.contains('records'))
        db.createObjectStore('records', { keyPath: 'id' })
      if (!db.objectStoreNames.contains('settings'))
        db.createObjectStore('settings')
      if (!db.objectStoreNames.contains('plans')) db.createObjectStore('plans', {keyPath:'id'})
      if (!db.objectStoreNames.contains('places')) db.createObjectStore('places', {keyPath:'id'})
      if (db.objectStoreNames.contains('media')) return
      db.createObjectStore('media')
      const stores = storesFor(tx)
      // Upgrade in one transaction. At most one legacy record is decoded by this cursor at a time.
      const cursor = stores.records.openCursor()
      cursor.onsuccess = () => {
        const current = cursor.result
        if (!current) return
        try {
          if (kinds.some((k) => current.value[k]?.startsWith('data:')))
            writeSplit(stores, current.value)
          current.continue()
        } catch (error) {
          upgradeError = error
          tx.abort()
        }
      }
    }
    req.onsuccess = () => {
      const db = req.result
      db.onversionchange = () => {
        db.close()
        opening = null
        initialized = null
      }
      if (blocked) {
        opening = Promise.resolve(db)
        queueMicrotask(() => {
          for (const fn of listeners) fn('storage-ready')
        })
      }
      resolve(db)
    }
    req.onerror = () => {
      opening = null
      if (
        !upgradeError &&
        ['SecurityError', 'InvalidStateError'].includes(req.error?.name)
      )
        return resolve(null)
      reject(upgradeError || req.error || new Error('本机手记未能打开。'))
    }
  })
  return opening
}

function favoriteBits(storage) {
  return favoriteBitsFromKeys(favoriteKeys(storage))
}
function favoriteBitsFromKeys(keys) {
  const odd = new Set()
  for (const key of keys) {
    if (!key?.startsWith(favoritePrefix)) continue
    const id = key.slice(favoritePrefix.length, key.lastIndexOf(':'))
    if (odd.has(id)) odd.delete(id)
    else odd.add(id)
  }
  return odd
}
function readFallbackEntries() {
  const entries = loadEntries()
  let bits
  try {
    bits = favoriteBits(localStorage)
  } catch {
    return entries
  }
  return entries.map((entry) =>
    bits.has(encodeURIComponent(entry.id))
      ? { ...entry, favorite: !entry.favorite }
      : entry,
  )
}
function entriesFromSnapshot(snapshot) {
  const raw = snapshot?.get(journalKey)
  const entries = raw ? JSON.parse(raw) : SEED_ENTRIES
  if (!Array.isArray(entries)) throw new Error('旧手记格式无效，已保留原数据。')
  const rows = upgradeDiningRecords(
    entries,
    !snapshot?.get('xiaorizi.dining-examples.v1'),
  )
  const bits = favoriteBitsFromKeys(snapshot?.keys() || [])
  return rows.map((row) =>
    bits.has(encodeURIComponent(row.id))
      ? { ...row, favorite: !row.favorite }
      : row,
  )
}
function legacySnapshot() {
  try {
    const keys = [
      journalKey,
      'xiaorizi.dining-examples.v1',
      ...favoriteKeys(localStorage),
    ]
    return new Map(keys.map((key) => [key, localStorage.getItem(key)]))
  } catch {
    return null
  }
}
function clearCopiedLegacy(copy) {
  if (!copy) return
  try {
    const after = legacySnapshot()
    if (
      !after ||
      after.size !== copy.size ||
      [...copy].some(([k, v]) => after.get(k) !== v)
    )
      return
    for (const key of copy.keys()) localStorage.removeItem(key)
  } catch {
    /* The committed database is authoritative even if cleanup is unavailable. */
  }
}
export async function journalDatabase() {
  if (initialized) return initialized
  initialized = initialize().catch((error) => {
    initialized = null
    throw error
  })
  return initialized
}
async function initialize() {
  const db = await openDatabase()
  if (!db) return null
  const { legacyPlanSnapshot, isPlanStorageKey } = await import('./plans.js')
  const tx = db.transaction(recordStores, 'readwrite')
  const done = transactionDone(tx),
    stores = storesFor(tx),
    settings = tx.objectStore('settings')
  let importError
  let copiedLegacy, copiedPlans
  const plansInitialized = settings.get('plans-migrated')
  plansInitialized.onsuccess = () => {
    if (plansInitialized.result) return
    try {
      const previous = legacyPlanSnapshot()
      copiedPlans = previous.raw
      for (const plan of previous.plans) tx.objectStore('plans').put(plan)
      settings.put(previous.generation, 'plan-generation')
      settings.put(true, 'plans-migrated')
    } catch (error) { importError = error; tx.abort() }
  }
  function upgradeDining() {
    const initializedPlaces = settings.get('places-initialized')
    initializedPlaces.onsuccess = () => {
      if (!initializedPlaces.result) { reconcilePlaces(tx); settings.put(true,'places-initialized') }
    }
    const mig = settings.get('dining-examples-v1')
    mig.onsuccess = () => {
      if (mig.result) return
      const read = stores.records.getAll()
      read.onsuccess = () => {
        const prev = read.result,
          result = upgradeDiningRecords(prev, true)
        if (result !== prev)
          for (const entry of result) stores.records.put(entry)
        settings.put(true, 'dining-examples-v1')
      }
    }
  }
  const started = settings.get('initialized')
  started.onsuccess = () => {
    if (started.result) {
      upgradeDining()
      return
    }
    const count = stores.records.count()
    count.onsuccess = () => {
      try {
        if (!count.result) {
          copiedLegacy = legacySnapshot()
          for (const entry of entriesFromSnapshot(copiedLegacy))
            writeSplit(stores, createEntry(entry))
        }
        settings.put(true, 'initialized')
        upgradeDining()
      } catch (err) {
        importError = err
        tx.abort()
      }
    }
  }
  try {
    await done
  } catch (error) {
    throw importError || error
  }
  // Only remove source data this initialization actually copied. An old localStorage
  // snapshot beside an established database may contain unmerged edits from an older browser.
  clearCopiedLegacy(copiedLegacy)
  if (copiedPlans) for (const [key,value] of copiedPlans) {
    if (isPlanStorageKey(key) && localStorage.getItem(key) === value) localStorage.removeItem(key)
  }
  return db
}

export async function readRecords() {
  const db = await journalDatabase()
  const rows = db
    ? await requestDone(
        db.transaction('records').objectStore('records').getAll(),
      )
    : readFallbackEntries()
  return rows
    .map(createEntry)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}
async function readMediaBlob(ref) {
  const db = await journalDatabase()
  if (!db || !isLocalMedia(ref)) return null
  const value = await requestDone(
    db.transaction('media').objectStore('media').get(ref),
  )
  return !value || value instanceof Blob
    ? value
    : new Blob([value.bytes], { type: value.type })
}
export function observeLocalMedia() {
  return observeMedia(readMediaBlob)
}

async function fullRecords(id, onSnapshot) {
  const db = await journalDatabase()
  if (!db) {
    const all = readFallbackEntries()
    onSnapshot?.()
    return (id == null ? all : all.filter((e) => e.id === id)).map(createEntry)
  }
  const tx = db.transaction(onSnapshot ? recordStores : ['records', 'media']),
    stores = storesFor(tx)
  const head = id == null ? stores.records.getAll() : stores.records.get(id)
  let rows = []
  const mediaRefs = [],
    oldBlobs = []
  const done = transactionDone(tx)
  let snapshotError
  head.onsuccess = () => {
    try {
      onSnapshot?.(tx)
    } catch (error) {
      snapshotError = error
      tx.abort()
      return
    }
    rows = (id == null ? head.result : head.result ? [head.result] : []).map(
      createEntry,
    )
    for (const row of rows)
      for (const kind of kinds)
        if (isLocalMedia(row[kind])) mediaRefs.push({ row, kind })
    // Keep one binary attachment in flight within a consistent readonly snapshot.
    function readNext() {
      const next = mediaRefs.pop()
      if (!next) return
      const { row, kind } = next
      const req = stores.media.get(row[kind])
      req.onsuccess = () => {
        try {
          if (!req.result) throw new Error('有一份照片或原声暂时无法读取。')
          if (req.result instanceof Blob)
            oldBlobs.push({ row, kind, blob: req.result })
          else row[kind] = binaryDataUrl(req.result)
          readNext()
        } catch (error) {
          snapshotError = error
          tx.abort()
        }
      }
    }
    readNext()
  }
  try {
    await done
  } catch (error) {
    throw snapshotError || error
  }
  for (const { row, kind, blob } of oldBlobs)
    row[kind] = await blobDataUrl(blob)
  return rows
}
export async function readRecordWithMedia(id) {
  if (!id) return null
  return (await fullRecords(id))[0] || null
}
export function exportRecords(onSnapshot) {
  return fullRecords(null, onSnapshot)
}

export async function putRecord(fields, original) {
  const draft = createEntry(fields), before = original ? createEntry(original) : null
  const db = await journalDatabase()
  function merge(prior) {
    if (before && !prior) throw new Error('这篇手记已被移除，请重新打开手记列表。')
    if (!before) return createEntry({...draft, ...localAuthor(prior)})
    const merged={...prior}
    for(const key of new Set([...Object.keys(before), ...Object.keys(draft)])) {
      if (['id','author','updatedBy'].includes(key)) continue
      const a=before[key], b=draft[key]
      if (a === b || (Array.isArray(a) && Array.isArray(b) && a.length===b.length && a.every((value,i)=>value===b[i]))) continue
      if (b === undefined) delete merged[key]
      else merged[key]=b
    }
    return createEntry({...merged,...localAuthor(prior)})
  }
  let result = draft
  if (db) {
    const tx = db.transaction(['records', 'media', 'places', 'settings'], 'readwrite'),
      stores = storesFor(tx)
    const prior = stores.records.get(draft.id)
    let issue
    prior.onsuccess = () => {
      try {
        const entry=merge(prior.result)
        result = writeSplit(stores, entry, prior.result)
        if (entry.diningSource === 'out' || prior.result?.diningSource === 'out') reconcilePlaces(tx)
      } catch (e) {
        issue = e
        tx.abort()
      }
    }
    try {
      await transactionDone(tx)
    } catch (e) {
      throw issue || e
    }
  } else {
    await lock(() => {
      const previous=loadEntries(),entry=merge(previous.find(e=>e.id===draft.id))
      if (entry.visibility === 'private') throw new Error('此浏览器未开放 IndexedDB，无法保存仅自己可见的内容。')
      result=entry
      const others = previous.filter((e) => e.id !== entry.id)
      const flipped = favoriteBits(localStorage).has(
        encodeURIComponent(entry.id),
      )
      if (kinds.some((k) => isLocalMedia(entry[k])))
        throw new Error('请重新打开手记后再保存。')
      saveEntries([
        { ...entry, favorite: flipped ? !entry.favorite : entry.favorite },
        ...others,
      ])
    })
  }
  announce()
  return result
}
function favoriteKeys(storage) {
  return Object.keys(storage).filter((k) => k.startsWith(favoritePrefix))
}
export async function removeRecord(id) {
  const db = await journalDatabase()
  if (db) {
    const tx = db.transaction(['records', 'media', 'places', 'settings'], 'readwrite'),
      stores = storesFor(tx)
    const req = stores.records.get(id)
    req.onsuccess = () => {
      for (const kind of kinds)
        if (isLocalMedia(req.result?.[kind]))
          stores.media.delete(req.result[kind])
      stores.records.delete(id)
      if (req.result?.diningSource === 'out') reconcilePlaces(tx)
    }
    await transactionDone(tx)
  } else {
    await lock(() => {
      saveEntries(loadEntries().filter((e) => e.id !== id))
      for (const k of favoriteKeys(localStorage))
        if (k.startsWith(favoritePrefix + encodeURIComponent(id) + ':'))
          localStorage.removeItem(k)
    })
  }
  announce()
}
export async function toggleRecordFavorite(id) {
  const db = await journalDatabase()
  let updated
  if (db) {
    const tx = db.transaction('records', 'readwrite'),
      store = tx.objectStore('records')
    const req = store.get(id)
    req.onsuccess = () => {
      if (req.result) {
        updated = createEntry({ ...req.result, ...localAuthor(req.result), favorite: !req.result.favorite })
        store.put(updated)
      }
    }
    await transactionDone(tx)
  } else {
    await lock(() => {
      const current = loadEntries().find((e) => e.id === id)
      if (!current) return
      const encoded = encodeURIComponent(id),
        key = favoritePrefix + encoded + ':' + tabId
      if (localStorage.getItem(key)) localStorage.removeItem(key)
      else localStorage.setItem(key, '1')
      updated = createEntry({
        ...current,
        favorite: favoriteBits(localStorage).has(encoded)
          ? !current.favorite
          : current.favorite,
      })
    })
  }
  if (!updated) throw new Error('这篇手记已被删除。')
  announce()
  return updated
}

// The synchronous side-effect stages plans/preferences just before the database commits.
// If storage quota or the transaction fails, the caller-supplied rollback restores them.
export async function replaceRecords(rows, applyLocal, notebook) {
  const db = await journalDatabase()
  await lock(async () => {
    let undo
    if (db) {
      const tx = db.transaction(recordStores, 'readwrite'),
        stores = storesFor(tx),
        settings = tx.objectStore('settings')
      const done = transactionDone(tx)
      let issue
      try {
        stores.records.clear()
        stores.media.clear()
        for (const row of rows) writeSplit(stores, createEntry(row))
        if (notebook) {
          const plans = tx.objectStore('plans'), places = tx.objectStore('places')
          plans.clear(); places.clear()
          for (const plan of notebook.plans) plans.put(plan)
          for (const place of notebook.places || []) places.put(place)
          settings.put(notebook.generation, 'plan-generation')
          reconcilePlaces(tx)
        }
        settings.put(true, 'initialized')
        const last = settings.put(true, 'dining-examples-v1')
        last.onsuccess = () => {
          try {
            undo = applyLocal(true)
          } catch (e) {
            issue = e
            tx.abort()
          }
        }
      } catch (e) {
        issue = e
        tx.abort()
      }
      try {
        await done
      } catch (e) {
        undo?.()
        throw issue || e
      }
    } else {
      if (rows.some(r => r.visibility === 'private') || notebook?.plans.some(p => p.visibility === 'private')) throw new Error('恢复私密内容需要可用的 IndexedDB。')
      const backup = new Map(
        [
          journalKey,
          'xiaorizi.dining-examples.v1',
          ...favoriteKeys(localStorage),
        ].map((k) => [k, localStorage.getItem(k)]),
      )
      try {
        undo = applyLocal()
        for (const k of favoriteKeys(localStorage)) localStorage.removeItem(k)
        saveEntries(rows)
        localStorage.setItem('xiaorizi.dining-examples.v1', '1')
      } catch (e) {
        localStorage.removeItem(journalKey)
        undo?.()
        for (const [k, v] of backup)
          if (v === null) localStorage.removeItem(k)
          else localStorage.setItem(k, v)
        throw e
      }
    }
  })
  announce('restore', true)
}
export function onExternalChange(callback) {
  listeners.add(callback)
  const message = (event) => callback(event.data)
  const storage = (event) => {
    if (event.key === changeKey && event.newValue) {
      try {
        callback(JSON.parse(event.newValue)[0])
      } catch {}
    } else if (
      event.key === journalKey ||
      event.key?.startsWith(favoritePrefix)
    )
      callback()
  }
  channel?.addEventListener('message', message)
  globalThis.addEventListener?.('storage', storage)
  return () => {
    listeners.delete(callback)
    channel?.removeEventListener('message', message)
    globalThis.removeEventListener?.('storage', storage)
  }
}

export function normalizePlace(fields) {
  const name = String(fields?.name || '').trim()
  if (!name) throw new Error('请填写店铺名称。')
  const aliases = new Map()
  for (const value of fields.aliases || []) {
    const alias = String(value).trim(), key = venueKey(alias)
    if (key && key !== venueKey(name)) aliases.set(key, alias)
  }
  return {id:String(fields.id || 'place-' + venueKey(name)), name, aliases:[...aliases.values()],
    visibility:'shared', ...authorship(fields), ...(fields.automatic === true ? {automatic:true} : {})}
}

function reconcilePlaces(tx) {
  const meta=tx.objectStore('settings'), suppress=meta.get('removed-place-keys'), withdrawal=meta.get('withdrawn-places')
  const records = tx.objectStore('records').getAll(), places = tx.objectStore('places'), profiles = places.getAll()
  profiles.onsuccess = () => {
    const known = new Map(), used = new Set(), privateNames=new Set(), withdrawn=new Set(withdrawal.result||[])
    for (const place of profiles.result) for (const name of [place.name, ...place.aliases]) known.set(venueKey(name), place)
    for (const record of records.result) {
      if (record.visibility==='private' && record.diningSource==='out' && record.venueName) privateNames.add(venueKey(record.venueName))
      if (record.visibility === 'private' || record.isSample || String(record.id).startsWith('sample-') || record.diningSource !== 'out' || !record.venueName) continue
      const key = venueKey(record.venueName)
      let place = known.get(key)
      if (!place) {
        if ((suppress.result || []).includes(key)) continue
        place = normalizePlace({name:record.venueName, author:record.author, automatic:true})
        places.put(place); known.set(key, place)
      }
      used.add(place.id)
    }
    for(const id of used) withdrawn.delete(id)
    for (const place of profiles.result) if (place.automatic && !used.has(place.id)) {
      if ([place.name,...place.aliases].some(n=>privateNames.has(venueKey(n)))) withdrawn.add(place.id)
      places.delete(place.id)
    }
    meta.put([...withdrawn],'withdrawn-places')
  }
}

export async function readPlaceProfiles() {
  const db = await journalDatabase()
  return db ? await requestDone(db.transaction('places').objectStore('places').getAll()) : []
}

export async function putPlaceProfile(fields) {
  const db = await journalDatabase()
  if (!db) throw new Error('保存共享店铺档案需要可用的 IndexedDB。')
  const tx = db.transaction('places', 'readwrite'), table = tx.objectStore('places'), done = transactionDone(tx)
  let result, error
  const all = table.getAll()
  all.onsuccess = () => {
    try {
      const id = fields.id || 'place-' + venueKey(fields.name)
      const prior = all.result.find(p => p.id === id)
      const aliases = fields.aliases ?? prior?.aliases ?? []
      result = normalizePlace({...prior, ...fields, id, aliases: prior && fields.name && prior.name !== fields.name ? [...aliases, prior.name] : aliases, automatic:false, ...localAuthor(prior)})
      const keys = new Set([result.name,...result.aliases].map(venueKey))
      for (const other of all.result) {
        if (other.id === result.id || ![other.name,...other.aliases].some(n=>keys.has(venueKey(n)))) continue
        result = normalizePlace({...result,aliases:[...result.aliases,other.name,...other.aliases]})
        table.delete(other.id)
      }
      table.put(result)
    } catch(e) { error = e; tx.abort() }
  }
  try { await done } catch(e) { throw error || e }
  announce('places', true)
  return result
}

function suppressPlace(tx,place) {
  const settings=tx.objectStore('settings'), read=settings.get('removed-place-keys')
  read.onsuccess=()=>settings.put([...new Set([...(read.result||[]),...[place.name,...place.aliases].map(venueKey)])],'removed-place-keys')
}

export async function deletePlaceProfile(id) {
  const db = await journalDatabase()
  if (!db) return
  const tx = db.transaction(['places','settings'],'readwrite'), places = tx.objectStore('places')
  const prior = places.get(id)
  prior.onsuccess=()=>{ if(prior.result) suppressPlace(tx,prior.result); places.delete(id) }
  await transactionDone(tx); announce('places',true)
}

export async function sharedLocalState() {
  const db = await journalDatabase()
  if (!db) throw new Error('同步需要可用的 IndexedDB。')
  const actor = publicAuthor(readProfile())
  const tx = db.transaction(['records','plans','places','settings'], actor ? 'readwrite' : 'readonly')
  const withdrawn = tx.objectStore('settings').get('withdrawn-places')
  const all = ['records','plans','places'].map(name => {
    const table = tx.objectStore(name), read = table.getAll()
    read.onsuccess = () => {
      for (const row of read.result) {
        if (actor && !row.author && row.visibility !== 'private' && !row.isSample && !String(row.id).startsWith('sample-')) {
          row.author = actor
          table.put(row)
        }
      }
    }
    return read
  })
  await transactionDone(tx)
  return {entries:all[0].result, freetime:all[1].result, places:all[2].result,withdrawn:withdrawn.result||[]}
}

// Re-check the expected metadata and any private relations in the same transaction
// that replaces the item. Downloading an attachment can take longer than a local edit.
export async function applyCloudObject(kind, id, value, accepts, paths={}) {
  const db = await journalDatabase()
  if (!db) throw new Error('同步需要可用的 IndexedDB。')
  const tableName = {entries:'records',freetime:'plans',places:'places'}[kind]
  if (!tableName) throw new Error('不支持的同步内容。')
  const tx = db.transaction(recordStores,'readwrite'), done = transactionDone(tx)
  const table = tx.objectStore(tableName), current = table.get(id)
  const withdrawn = tx.objectStore('settings').get('withdrawn-places'), records = tx.objectStore('records').getAll(), plans = tx.objectStore('plans').getAll()
  let accepted = false, cause
  plans.onsuccess = () => {
    try {
      if (!accepts(current.result || null, records.result, plans.result,withdrawn.result||[])) return
      if (kind === 'entries' && value) {
        const next=createEntry(value)
        if (paths.keepPhoto && current.result?.image) next.image=current.result.image
        if (paths.keepAudio && current.result?.audio) next.audio=current.result.audio
        writeSplit(storesFor(tx),next,current.result,paths)
      }
      else if (value) table.put(value)
      else {
        if (kind === 'entries') for (const key of kinds) if (isLocalMedia(current.result?.[key])) tx.objectStore('media').delete(current.result[key])
        if(kind === 'places' && current.result) suppressPlace(tx,current.result)
        table.delete(id)
      }
      accepted = true
    } catch(e) { cause = e; tx.abort() }
  }
  try { await done } catch(e) { throw cause || e }
  if (accepted) announce('cloud', true)
  return accepted
}

export async function readSharedAttachment(id, kind, expectedRef) {
  const db = await journalDatabase()
  if (!db || !kinds.includes(kind)) throw new Error('共享附件不可用。')
  const tx = db.transaction(['records','media']), read = tx.objectStore('records').get(id)
  let result, ref
  read.onsuccess = () => {
    const entry=read.result
    if (!entry || entry.isSample || entry.visibility==='private' || entry[kind]!==expectedRef) return
    ref=entry[kind]
    if (isLocalMedia(ref)) result=tx.objectStore('media').get(ref)
  }
  await transactionDone(tx)
  if (!ref || (isLocalMedia(ref) && !result?.result)) throw new Error('附件或可见范围已改变，请重新同步。')
  if (!isLocalMedia(ref)) return ref
  const value=result.result
  return value instanceof Blob ? value : new Blob([value.bytes],{type:value.type})
}
