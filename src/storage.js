import { restoreBreakfast } from './breakfast-model.js'
import { cleanReactions, stamps } from './stickers.js'
import { readProfile, stickerActor } from './cloud-profile.js'
import { prepareJournalPhoto, makeJournalThumbnail } from './device-ai.js'
import {
  createEntry,
  upgradeDiningRecords,
  SEED_ENTRIES,
  publicAuthor,
  authorship,
  venueKey,
} from './journal.js'
import {
  mediaPrefix,
  isLocalMedia,
  dataMediaBinary,
  binaryDataUrl,
  blobDataUrl,
  observeMedia,
  mediaAttributes,
  canDisplayMedia,
} from './media-store.js'
export { mediaAttributes }

const favoritePrefix = 'xiaorizi.favorite-toggle:'
const journalKey = 'xiaorizi.journal.v1'
const changeKey = 'xiaorizi.records-change'
const mealHistoryKey = 'meal-history'
const oldMealHistoryKey = 'little.days.mealHistory'
const channel =
  typeof BroadcastChannel === 'function'
    ? new BroadcastChannel('little-days-changes')
    : null
const listeners = new Set()
const newToken = () =>
  globalThis.crypto?.randomUUID?.() ||
  Date.now().toString(36) + '-' + Math.random().toString(36).slice(2)
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
  return authorship({
    author: previous?.author || actor,
    updatedBy: actor || previous?.updatedBy,
    stickerAuthor:
      previous?.stickerAuthor ||
      (!previous?.author || previous.author.nickname === actor?.nickname
        ? stickerActor()
        : undefined),
  })
}
export function isSharedMutation(event) {
  return (
    event !== 'cloud' && event !== 'local-only' && event !== 'private-restore'
  )
}
const dirtyTransactions = new WeakSet()
export function announceMutation(tx, event = 'updated') {
  announce(dirtyTransactions.has(tx) ? event : 'local-only')
}
export function announce(event = 'updated', local = false) {
  if (isSharedMutation(event)) signalCloudChange()
  if (channel) channel.postMessage(event)
  else
    try {
      localStorage.setItem(changeKey, JSON.stringify([event, newToken()]))
      localStorage.removeItem(changeKey)
    } catch {}
  if (local) for (const fn of listeners) fn(event)
}

// Each detail has an immutable local ID. A derived preview belongs to that
// exact version, including when an edit is racing a lazy thumbnail rebuild.
const thumbnailKey = (imageRef) => imageRef + '/thumbnail'

function deleteMedia(media, ref, kind) {
  if (!isLocalMedia(ref)) return
  media.delete(ref)
  if (kind === 'image') media.delete(thumbnailKey(ref))
}

export function writeSplit(stores, entry, previous, paths = {}) {
  const { records, media } = stores
  const meta = { ...entry }
  for (const kind of kinds) {
    const value = entry[kind] || ''
    const prior = previous?.[kind]
    const cloudPath = kind === 'image' ? 'cloudPhotoPath' : 'cloudAudioPath'
    if (paths[cloudPath]) meta[cloudPath] = paths[cloudPath]
    else if (prior && prior === value && previous?.[cloudPath])
      meta[cloudPath] = previous[cloudPath]
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
        if (
          !copy.result ||
          (entry.visibility === 'shared' &&
            (!owner.result || owner.result.visibility === 'private'))
        ) {
          media.transaction.abort()
          return
        }
        media.put(copy.result, meta[kind])
      }
    }
    deleteMedia(media, prior, kind)
  }
  records.put(meta)
  return meta
}
// The revision and the underlying edits commit together. The sync base retains
// identifiers for deletions, so the revision can cover multiple offline edits.
export function markOutbox(tx) {
  if (dirtyTransactions.has(tx)) return
  tx.objectStore('settings').put(newToken(), 'shared-outbox-revision')
  dirtyTransactions.add(tx)
}
export async function ackOutbox(revision) {
  if (!revision) return
  const db = await journalDatabase()
  const tx = db.transaction('settings', 'readwrite'),
    table = tx.objectStore('settings')
  const read = table.get('shared-outbox-revision')
  read.onsuccess = () => {
    if (read.result === revision) table.delete('shared-outbox-revision')
  }
  await transactionDone(tx)
}
function visibleRecord(row) {
  // Earlier notebooks may contain an external media link. Neither the view nor
  // the editor should turn a private repository URL into a public image request.
  for (const kind of kinds)
    if (row[kind] && !canDisplayMedia(row[kind])) row[kind] = ''
  return row
}
function storesFor(tx) {
  return { records: tx.objectStore('records'), media: tx.objectStore('media') }
}
function openDatabase() {
  if (opening) return opening
  opening = new Promise((resolve, reject) => {
    if (!globalThis.indexedDB) return reject(storageUnavailable())
    let req
    try {
      req = indexedDB.open('little-days', 4)
    } catch {
      return reject(storageUnavailable())
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
      const records = tx.objectStore('records')
      for (const path of ['cloudPhotoPath', 'cloudAudioPath']) {
        if (!records.indexNames.contains(path)) records.createIndex(path, path)
      }
      if (!db.objectStoreNames.contains('settings'))
        db.createObjectStore('settings')
      if (!db.objectStoreNames.contains('plans'))
        db.createObjectStore('plans', { keyPath: 'id' })
      if (!db.objectStoreNames.contains('places'))
        db.createObjectStore('places', { keyPath: 'id' })
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
        return reject(storageUnavailable())
      reject(upgradeError || req.error || new Error('本机手记未能打开。'))
    }
  })
  return opening.catch((error) => {
    opening = null
    throw error
  })
}
function storageUnavailable() {
  return new Error(
    '本机 IndexedDB 存储不可用。请允许此网站使用本地存储，再重试保存。',
  )
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
function validMealPicks(value) {
  return Array.isArray(value)
    ? value
        .filter(
          (row) =>
            row &&
            typeof row.slot === 'string' &&
            row.slot &&
            typeof row.id === 'string' &&
            row.id &&
            Number.isSafeInteger(row.turn) &&
            row.turn >= 0,
        )
        .map(({ slot, id, turn }) => ({ slot, id, turn }))
    : []
}
export function withMealPick(history, pick) {
  return [...history.filter((row) => row.slot !== pick.slot), pick].slice(-12)
}

export async function readMealHistory(transaction) {
  const tx = transaction || (await journalDatabase()).transaction('settings')
  return requestDone(tx.objectStore('settings').get(mealHistoryKey))
}

export async function rememberMealPick(pick) {
  const db = await journalDatabase()
  const tx = db.transaction('settings', 'readwrite'),
    table = tx.objectStore('settings')
  const previous = table.get(mealHistoryKey)
  previous.onsuccess = () =>
    table.put(withMealPick(previous.result || [], pick), mealHistoryKey)
  await transactionDone(tx)
}

export async function journalDatabase() {
  if (initialized) return initialized
  initialized = initialize().catch((error) => {
    initialized = null
    throw error
  })
  return initialized
}

// Keep settings and media changes in one transaction with every migrated row.
// A short-lived receipt makes a reload between commit and legacy cleanup idempotent.
async function initialize() {
  const db = await openDatabase()
  const { legacyPlanSnapshot, normalPlan } = await import('./plans.js')
  const journal = legacySnapshot(),
    plans = legacyPlanSnapshot()
  const sources = [...(journal || []), ...plans.raw].filter(
    ([, v]) => v !== null,
  )
  const stamp = sources.length
    ? JSON.stringify(sources.sort(([a], [b]) => a.localeCompare(b)))
    : ''
  const tx = db.transaction(recordStores, 'readwrite')
  const done = transactionDone(tx),
    stores = storesFor(tx),
    settings = tx.objectStore('settings')
  let oldMealHistory
  try {
    oldMealHistory = localStorage.getItem(oldMealHistoryKey)
  } catch {}
  if (typeof oldMealHistory === 'string') {
    let legacy = []
    try {
      legacy = validMealPicks(JSON.parse(oldMealHistory))
    } catch {}
    const read = settings.get(mealHistoryKey)
    read.onsuccess = () => {
      // A previous migration or another tab may already hold newer picks.
      const merged = new Map()
      for (const row of [...legacy, ...validMealPicks(read.result)]) {
        merged.delete(row.slot)
        merged.set(row.slot, row)
      }
      settings.put([...merged.values()].slice(-12), mealHistoryKey)
    }
  }
  const started = settings.get('initialized'),
    plansReady = settings.get('plans-migrated')
  const diningReady = settings.get('dining-examples-v1'),
    privacyReady = settings.get('privacy-initialized-v1')
  const receipt = settings.get('legacy-import-receipt')
  let importError
  receipt.onsuccess = () => {
    if (
      started.result &&
      plansReady.result &&
      diningReady.result &&
      privacyReady.result &&
      (!stamp || stamp === receipt.result)
    )
      return
    const records = stores.records.getAll(),
      table = tx.objectStore('plans'),
      existingPlans = table.getAll()
    existingPlans.onsuccess = () => {
      try {
        const copying = stamp && stamp !== receipt.result
        const established = Boolean(started.result || records.result.length)
        const oldEntries =
          copying && journal?.get(journalKey)
            ? entriesFromSnapshot(journal)
            : []
        const knownRecords = new Map(records.result.map((row) => [row.id, row]))
        const knownPlans = new Map(
          existingPlans.result.map((row) => [row.id, row]),
        )
        const recordIds = new Map(),
          planIds = new Map()
        // A separate old notebook can exist beside a newer IndexedDB notebook.
        // Keep differing edits as private recoveries; do not overwrite a newer record.
        for (const row of oldEntries) {
          const current = knownRecords.get(row.id)
          if (
            current &&
            (row.isSample ||
              JSON.stringify(createEntry(current)) ===
                JSON.stringify(createEntry(row)))
          )
            continue
          const id =
            established && !row.isSample
              ? 'legacy-recovery-' + newToken()
              : row.id
          recordIds.set(row.id, id)
        }
        for (const row of copying ? plans.plans : []) {
          const current = knownPlans.get(row.id)
          if (
            current &&
            JSON.stringify(normalPlan(current)) ===
              JSON.stringify(normalPlan(row))
          )
            continue
          planIds.set(
            row.id,
            plansReady.result || current ? 'legacy-plan-' + newToken() : row.id,
          )
        }
        // Completed tasks use their plan ID in their journal link. Retain this
        // relationship inside the recovered notebook without reusing a cloud ID.
        for (const id of recordIds.keys()) {
          const related = /^plan-note-([^:]+)(:(?:task|prepare|day):\d*)$/.exec(
            id,
          )
          if (!related) continue
          let planId
          try {
            planId = decodeURIComponent(related[1])
          } catch {
            continue
          }
          const restoredPlan = planIds.get(planId)
          if (restoredPlan && restoredPlan !== planId)
            recordIds.set(
              id,
              'plan-note-' + encodeURIComponent(restoredPlan) + related[2],
            )
        }
        for (const row of oldEntries) {
          if (!recordIds.has(row.id)) continue
          const entry = createEntry({
            ...row,
            id: recordIds.get(row.id),
            visibility:
              established && !row.isSample ? 'private' : row.visibility,
          })
          writeSplit(stores, entry)
          if (entry.visibility === 'shared' && !entry.isSample) markOutbox(tx)
        }
        for (const row of plans.plans) {
          if (!planIds.has(row.id)) continue
          const id = planIds.get(row.id),
            visibility = plansReady.result ? 'private' : row.visibility
          const source = (oldId) => recordIds.get(oldId) || oldId
          const steps = (list) =>
            list.map((step) => {
              const key =
                encodeURIComponent(id) +
                ':' +
                step.stage +
                ':' +
                (step.year ?? '')
              return {
                ...step,
                id: key,
                key,
                planId: id,
                visibility,
                sourceEntryId: source(step.sourceEntryId),
              }
            })
          table.put({
            ...row,
            id,
            visibility,
            sourceEntryId: source(row.sourceEntryId),
            completions: steps(row.completions),
            reopened: steps(row.reopened),
          })
          if (visibility === 'shared') markOutbox(tx)
        }
        if (copying && !journal?.get(journalKey)) {
          for (const key of favoriteBitsFromKeys(journal?.keys() || [])) {
            const row = knownRecords.get(decodeURIComponent(key))
            if (row) {
              stores.records.put({ ...row, favorite: !row.favorite })
              if (row.visibility === 'shared' && !row.isSample) markOutbox(tx)
            }
          }
        }
        if (!established && !journal?.get(journalKey)) {
          for (const row of SEED_ENTRIES) writeSplit(stores, createEntry(row))
        }
        if (!plansReady.result)
          settings.put(plans.generation, 'plan-generation')
        if (!diningReady.result) {
          const all = stores.records.getAll()
          all.onsuccess = () => {
            const rows = upgradeDiningRecords(all.result, true)
            if (rows !== all.result)
              for (const row of rows) stores.records.put(row)
            propagatePrivacy(tx)
          }
        } else propagatePrivacy(tx)
        settings.put(true, 'initialized')
        settings.put(true, 'plans-migrated')
        settings.put(true, 'places-initialized')
        settings.put(true, 'dining-examples-v1')
        settings.put(true, 'privacy-initialized-v1')
        if (stamp) settings.put(stamp, 'legacy-import-receipt')
      } catch (error) {
        importError = error
        tx.abort()
      }
    }
  }
  try {
    await done
  } catch (error) {
    throw importError || error
  }
  if (typeof oldMealHistory === 'string') {
    try {
      if (localStorage.getItem(oldMealHistoryKey) === oldMealHistory)
        localStorage.removeItem(oldMealHistoryKey)
    } catch {}
  }
  // If an older page changes a key during migration, keep it for the next import.
  if (stamp) {
    try {
      if (!sources.every(([key, value]) => localStorage.getItem(key) === value))
        return db
      for (const [key] of sources) localStorage.removeItem(key)
    } catch {
      return db
    }
  }
  if (stamp || receipt.result) {
    const cleanup = db.transaction('settings', 'readwrite'),
      table = cleanup.objectStore('settings')
    const read = table.get('legacy-import-receipt')
    read.onsuccess = () => {
      if (read.result === (stamp || receipt.result))
        table.delete('legacy-import-receipt')
    }
    await transactionDone(cleanup)
  }
  return db
}
export async function readRecords() {
  const db = await journalDatabase()
  const rows = await requestDone(
    db.transaction('records').objectStore('records').getAll(),
  )
  return rows
    .map((row) => visibleRecord(createEntry(row)))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}
async function mediaBlob(db, ref) {
  const value = await requestDone(
    db.transaction('media').objectStore('media').get(ref),
  )
  return !value || value instanceof Blob
    ? value
    : new Blob([value.bytes], { type: value.type })
}

async function cacheThumbnail(db, ref, blob) {
  const bytes = await blob.arrayBuffer()
  const tx = db.transaction('media', 'readwrite')
  const media = tx.objectStore('media')
  const current = media.getKey(ref)
  current.onsuccess = () => {
    if (current.result !== undefined)
      media.put({ bytes, type: blob.type }, thumbnailKey(ref))
  }
  await transactionDone(tx)
}

const thumbnailJobs = new Map()
let thumbnailQueue = Promise.resolve()

async function rebuildThumbnail(db, ref) {
  const original = await mediaBlob(db, ref)
  if (!original) return null
  let thumbnail
  try {
    thumbnail = await makeJournalThumbnail(original)
  } catch {
    // Older backups can contain media that the platform can display but cannot re-encode.
    return original
  }
  // Quota pressure on a derived cache must never hide a readable photo.
  await cacheThumbnail(db, ref, thumbnail).catch(() => {})
  return thumbnail
}

async function loadThumbnail(db, ref) {
  const cached = await mediaBlob(db, thumbnailKey(ref))
  if (cached) return cached
  // Restored phone photos may be several megapixels. Decode only one at a time.
  const job = thumbnailQueue.then(() => rebuildThumbnail(db, ref))
  thumbnailQueue = job.then(
    () => {},
    () => {},
  )
  return job
}

async function readMediaBlob(ref, size) {
  if (!isLocalMedia(ref)) return null
  const db = await journalDatabase()
  if (size !== 'thumbnail') return mediaBlob(db, ref)
  if (!thumbnailJobs.has(ref)) {
    thumbnailJobs.set(
      ref,
      loadThumbnail(db, ref).finally(() => thumbnailJobs.delete(ref)),
    )
  }
  return thumbnailJobs.get(ref)
}

export function observeLocalMedia() {
  return observeMedia(readMediaBlob)
}

async function fullRecords(id, onSnapshot, acceptRecord) {
  const db = await journalDatabase()
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
    rows = (id == null ? head.result : head.result ? [head.result] : [])
      .filter((row) => !acceptRecord || acceptRecord(row))
      .map(createEntry)
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
  const row = (await fullRecords(id))[0]
  return row ? visibleRecord(row) : null
}
export function exportRecords(onSnapshot, acceptRecord) {
  return fullRecords(null, onSnapshot, acceptRecord)
}

export async function putRecord(fields, original) {
  const draft = createEntry(fields),
    before = original ? createEntry(original) : null
  const db = await journalDatabase()
  let thumbnail = null
  if (draft.image.startsWith('data:') && draft.image !== before?.image) {
    if (
      fields.photoThumbnail instanceof Blob &&
      fields.photoThumbnail.type === 'image/jpeg'
    ) {
      thumbnail = fields.photoThumbnail
    } else {
      const prepared = await prepareJournalPhoto(draft.image)
      draft.image = prepared.image
      thumbnail = prepared.thumbnail
    }
  }
  function merge(prior) {
    if (before && !prior)
      throw new Error('这篇手记已被移除，请重新打开手记列表。')
    if (!before) return createEntry({ ...draft, ...localAuthor(prior) })
    const merged = { ...prior }
    for (const key of new Set([
      ...Object.keys(before),
      ...Object.keys(draft),
    ])) {
      if (
        ['id', 'author', 'updatedBy', 'stickerAuthor', 'reactions'].includes(
          key,
        )
      )
        continue
      const a = before[key],
        b = draft[key]
      if (
        a === b ||
        (Array.isArray(a) &&
          Array.isArray(b) &&
          a.length === b.length &&
          a.every((value, i) => value === b[i]))
      )
        continue
      if (b === undefined) delete merged[key]
      else merged[key] = b
    }
    return createEntry({ ...merged, ...localAuthor(prior) })
  }
  let result = draft
  const tx = db.transaction(recordStores, 'readwrite'),
    stores = storesFor(tx)
  const prior = stores.records.get(draft.id)
  let issue
  prior.onsuccess = () => {
    try {
      const entry = merge(prior.result)
      result = writeSplit(stores, entry, prior.result)
      if (
        !entry.isSample &&
        (entry.visibility === 'shared' || prior.result?.visibility === 'shared')
      )
        markOutbox(tx)
      if (
        entry.visibility === 'private' ||
        prior.result?.visibility === 'private' ||
        entry.id.startsWith('plan-note-')
      ) {
        if (
          entry.visibility === 'private' ||
          prior.result?.visibility === 'private'
        )
          setPrivacyMarker(
            tx,
            'entries',
            entry.id,
            entry.visibility === 'private',
          )
        propagatePrivacy(tx, (scope) => {
          if (scope.entries.has(entry.id)) result.visibility = 'private'
        })
      } else if (
        entry.diningSource === 'out' ||
        prior.result?.diningSource === 'out'
      )
        reconcilePlaces(tx)
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
  if (thumbnail && isLocalMedia(result.image)) {
    await cacheThumbnail(db, result.image, thumbnail).catch(() => {})
  }
  announceMutation(tx)
  return result
}
function favoriteKeys(storage) {
  return Object.keys(storage).filter((k) => k.startsWith(favoritePrefix))
}
export async function removeRecord(id) {
  const db = await journalDatabase()
  const tx = db.transaction(recordStores, 'readwrite'),
    stores = storesFor(tx)
  const req = stores.records.get(id)
  req.onsuccess = () => {
    for (const kind of kinds)
      deleteMedia(stores.media, req.result?.[kind], kind)
    stores.records.delete(id)
    if (req.result?.visibility === 'shared' && !req.result.isSample)
      markOutbox(tx)
    if (req.result?.visibility === 'private') {
      setPrivacyMarker(tx, 'entries', id, true)
      propagatePrivacy(tx)
    } else if (req.result?.diningSource === 'out') reconcilePlaces(tx)
  }
  await transactionDone(tx)
  announceMutation(tx)
}
export async function toggleStamp(id, stamp) {
  if (!Object.hasOwn(stamps, stamp)) throw new Error('这枚贴纸暂不可用。')
  const actor = stickerActor()
  const db = await journalDatabase()
  const tx = db.transaction('records', 'readwrite')
  const table = tx.objectStore('records')
  let saved
  const req = table.get(id)
  req.onsuccess = () => {
    const row = req.result
    if (row?.visibility !== 'shared') return
    const reactions = cleanReactions(row.reactions)
    const current = reactions.find((reaction) => reaction.actor.id === actor.id)
    const next = {
      actor,
      stamp: current?.stamp === stamp ? null : stamp,
      at: new Date().toISOString(),
    }
    saved = {
      ...row,
      reactions: [
        ...reactions.filter((reaction) => reaction.actor.id !== actor.id),
        next,
      ],
    }
    table.put(saved)
  }
  await transactionDone(tx)
  if (!saved) throw new Error('这篇手记已移除或改为仅自己。')
  announce('local-only')
  return createEntry(saved)
}

export async function toggleRecordFavorite(id) {
  const db = await journalDatabase()
  let updated
  const tx = db.transaction(['records', 'settings'], 'readwrite'),
    store = tx.objectStore('records')
  const req = store.get(id)
  req.onsuccess = () => {
    if (req.result) {
      updated = createEntry({
        ...req.result,
        ...localAuthor(req.result),
        favorite: !req.result.favorite,
      })
      store.put({ ...req.result, ...updated })
      if (updated.visibility === 'shared' && !updated.isSample) markOutbox(tx)
    }
  }
  await transactionDone(tx)
  if (!updated) throw new Error('这篇手记已被删除。')
  announceMutation(tx)
  return updated
}

// The synchronous side-effect stages plans/preferences just before the database commits.
// If storage quota or the transaction fails, the caller-supplied rollback restores them.
export async function replaceRecords(rows, applyLocal, notebook) {
  const db = await journalDatabase()
  await lock(async () => {
    let undo
    const tx = db.transaction(recordStores, 'readwrite'),
      stores = storesFor(tx),
      settings = tx.objectStore('settings')
    const done = transactionDone(tx)
    let issue
    try {
      // Record withdrawals in the same replacement transaction, including rows absent from the backup.
      const oldRecords = stores.records.getAll()
      const oldPlans = tx.objectStore('plans').getAll()
      oldPlans.onsuccess = () => {
        for (const [kind, old, next] of [
          ['entries', oldRecords.result, rows],
          ['freetime', oldPlans.result, notebook?.plans || oldPlans.result],
        ]) {
          const present = new Map(next.map((row) => [row.id, row]))
          for (const row of old)
            if (row.visibility === 'private' && !present.has(row.id))
              setPrivacyMarker(tx, kind, row.id, true)
          for (const row of next)
            setPrivacyMarker(tx, kind, row.id, row.visibility === 'private')
        }
        propagatePrivacy(tx)
      }
      markOutbox(tx)
      stores.records.clear()
      stores.media.clear()
      for (const row of rows) writeSplit(stores, createEntry(row))
      if (notebook) {
        const plans = tx.objectStore('plans'),
          places = tx.objectStore('places')
        plans.clear()
        places.clear()
        for (const plan of notebook.plans) plans.put(plan)
        for (const place of notebook.places || []) places.put(place)
        settings.put(notebook.generation, 'plan-generation')
        if (notebook.breakfast) restoreBreakfast(settings, notebook.breakfast)
        if (Object.hasOwn(notebook, 'mealHistory')) {
          if (notebook.mealHistory === undefined)
            settings.delete(mealHistoryKey)
          else settings.put(notebook.mealHistory, mealHistoryKey)
        }
        if (notebook.places) {
          const represented = new Set(
            notebook.places
              .flatMap((place) => [place.name, ...place.aliases])
              .map(venueKey),
          )
          const missing = rows
            .filter(
              (row) =>
                row.visibility !== 'private' &&
                !row.isSample &&
                row.diningSource === 'out' &&
                row.venueName,
            )
            .map((row) => venueKey(row.venueName))
            .filter((key) => !represented.has(key))
          settings.put([...new Set(missing)], 'removed-place-keys')
        }
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
    const alias = String(value).trim(),
      key = venueKey(alias)
    if (key && key !== venueKey(name)) aliases.set(key, alias)
  }
  return {
    id: String(fields.id || 'place-' + venueKey(name)),
    name,
    aliases: [...aliases.values()],
    visibility: 'shared',
    ...authorship(fields),
    ...(fields.automatic === true ? { automatic: true } : {}),
  }
}

const privacyPrefix = 'privacy-withdraw:'
function readWithdrawals(tx) {
  return tx
    .objectStore('settings')
    .getAll(IDBKeyRange.bound(privacyPrefix, privacyPrefix + '\uffff'))
}
export function localPrivacy(records, plans, withdrawals = []) {
  const entries = new Set(
    records.filter((row) => row.visibility === 'private').map((row) => row.id),
  )
  const freetime = new Set(
    plans
      .filter((plan) => plan.visibility === 'private')
      .map((plan) => plan.id),
  )
  for (const mark of withdrawals) {
    if (mark.kind === 'entries') entries.add(mark.id)
    if (mark.kind === 'freetime') freetime.add(mark.id)
  }
  // A plan can point at a journal made from another plan. Resolve until both sets stabilize.
  let count
  do {
    count = entries.size + freetime.size
    for (const plan of plans) {
      const sources = [
        plan,
        ...(plan.completions || []),
        ...(plan.reopened || []),
      ]
      if (sources.some((row) => entries.has(row.sourceEntryId)))
        freetime.add(plan.id)
    }
    for (const record of records) {
      const match = /^plan-note-([^:]+):/.exec(record.id)
      if (match)
        try {
          if (freetime.has(decodeURIComponent(match[1]))) entries.add(record.id)
        } catch {}
    }
  } while (count !== entries.size + freetime.size)
  return { entries, freetime, places: new Set() }
}
export function setPrivacyMarker(tx, kind, id, restricted) {
  const table = tx.objectStore('settings'),
    key = privacyPrefix + kind + ':' + encodeURIComponent(id)
  if (restricted) table.put({ kind, id }, key)
  else table.delete(key)
}
// Preserve restrictions even when a source and its linked archive are removed while offline.
export function propagatePrivacy(tx, after) {
  const records = tx.objectStore('records'),
    plans = tx.objectStore('plans')
  const rows = records.getAll(),
    tasks = plans.getAll(),
    marks = readWithdrawals(tx)
  marks.onsuccess = () => {
    const scope = localPrivacy(rows.result, tasks.result, marks.result)
    const known = new Set(marks.result.map((m) => m.kind + ':' + m.id))
    for (const kind of ['entries', 'freetime'])
      for (const id of scope[kind])
        if (!known.has(kind + ':' + id)) setPrivacyMarker(tx, kind, id, true)
    for (const row of rows.result)
      if (scope.entries.has(row.id) && row.visibility !== 'private') {
        records.put({ ...row, visibility: 'private' })
        markOutbox(tx)
      }
    for (const plan of tasks.result)
      if (scope.freetime.has(plan.id)) {
        const history = [...(plan.completions || []), ...(plan.reopened || [])]
        if (
          plan.visibility === 'private' &&
          history.every((row) => row.visibility === 'private')
        )
          continue
        const privateRows = (rows) =>
          rows.map((row) => ({ ...row, visibility: 'private' }))
        if (plan.visibility === 'shared') markOutbox(tx)
        plans.put({
          ...plan,
          visibility: 'private',
          completions: privateRows(plan.completions || []),
          reopened: privateRows(plan.reopened || []),
        })
      }
    reconcilePlaces(tx)
    after?.(scope)
  }
}
function reconcilePlaces(tx) {
  const meta = tx.objectStore('settings'),
    suppress = meta.get('removed-place-keys'),
    withdrawal = meta.get('withdrawn-places')
  const records = tx.objectStore('records').getAll(),
    places = tx.objectStore('places'),
    profiles = places.getAll()
  profiles.onsuccess = () => {
    const known = new Map(),
      used = new Set(),
      privateNames = new Set(),
      withdrawn = new Set(withdrawal.result || [])
    for (const place of profiles.result)
      for (const name of [place.name, ...place.aliases])
        known.set(venueKey(name), place)
    for (const record of records.result) {
      if (
        record.visibility === 'private' &&
        record.diningSource === 'out' &&
        record.venueName
      )
        privateNames.add(venueKey(record.venueName))
      if (
        record.visibility === 'private' ||
        record.isSample ||
        String(record.id).startsWith('sample-') ||
        record.diningSource !== 'out' ||
        !record.venueName
      )
        continue
      const key = venueKey(record.venueName)
      let place = known.get(key)
      if (!place) {
        if ((suppress.result || []).includes(key)) continue
        place = normalizePlace({
          name: record.venueName,
          author: record.author,
          automatic: true,
        })
        places.put(place)
        markOutbox(tx)
        known.set(key, place)
      }
      used.add(place.id)
    }
    for (const id of used) withdrawn.delete(id)
    for (const place of profiles.result)
      if (place.automatic && !used.has(place.id)) {
        if (
          [place.name, ...place.aliases].some((n) =>
            privateNames.has(venueKey(n)),
          )
        )
          withdrawn.add(place.id)
        places.delete(place.id)
        markOutbox(tx)
      }
    meta.put([...withdrawn], 'withdrawn-places')
  }
}

export async function readPlaceProfiles() {
  const db = await journalDatabase()
  return requestDone(db.transaction('places').objectStore('places').getAll())
}

export async function putPlaceProfile(fields, { editing = false } = {}) {
  const db = await journalDatabase()
  const tx = db.transaction(['places', 'settings'], 'readwrite'),
    table = tx.objectStore('places'),
    done = transactionDone(tx)
  let result, error
  const all = table.getAll()
  all.onsuccess = () => {
    try {
      const id = fields.id || 'place-' + venueKey(fields.name)
      const prior = all.result.find((p) => p.id === id)
      if (editing && !prior)
        throw new Error('这家店铺的档案已移除，请重新打开店铺列表。')
      const aliases = fields.aliases ?? prior?.aliases ?? []
      result = normalizePlace({
        ...prior,
        ...fields,
        id,
        aliases:
          prior && fields.name && prior.name !== fields.name
            ? [...aliases, prior.name]
            : aliases,
        automatic: false,
        ...localAuthor(prior),
      })
      const keys = new Set([result.name, ...result.aliases].map(venueKey))
      for (const other of all.result) {
        if (
          other.id === result.id ||
          ![other.name, ...other.aliases].some((n) => keys.has(venueKey(n)))
        )
          continue
        result = normalizePlace({
          ...result,
          aliases: [...result.aliases, other.name, ...other.aliases],
        })
        table.delete(other.id)
      }
      table.put(result)
      markOutbox(tx)
    } catch (e) {
      error = e
      tx.abort()
    }
  }
  try {
    await done
  } catch (e) {
    throw error || e
  }
  announce('places', true)
  return result
}

function suppressPlace(tx, place) {
  const settings = tx.objectStore('settings'),
    read = settings.get('removed-place-keys')
  read.onsuccess = () =>
    settings.put(
      [
        ...new Set([
          ...(read.result || []),
          ...[place.name, ...place.aliases].map(venueKey),
        ]),
      ],
      'removed-place-keys',
    )
}

export async function deletePlaceProfile(id) {
  const db = await journalDatabase()
  const tx = db.transaction(['places', 'settings'], 'readwrite'),
    places = tx.objectStore('places')
  const prior = places.get(id)
  prior.onsuccess = () => {
    if (prior.result) {
      suppressPlace(tx, prior.result)
      markOutbox(tx)
    }
    places.delete(id)
  }
  await transactionDone(tx)
  announce('places', true)
}

export async function sharedLocalState() {
  const db = await journalDatabase()
  const actor = publicAuthor(readProfile())
  const tx = db.transaction(
    ['records', 'plans', 'places', 'settings'],
    actor ? 'readwrite' : 'readonly',
  )
  const outbox = tx.objectStore('settings').get('shared-outbox-revision')
  const withdrawals = readWithdrawals(tx)
  const withdrawn = tx.objectStore('settings').get('withdrawn-places')
  const all = ['records', 'plans', 'places'].map((name) => {
    const table = tx.objectStore(name),
      read = table.getAll()
    read.onsuccess = () => {
      for (const row of read.result) {
        if (
          actor &&
          !row.author &&
          row.visibility !== 'private' &&
          !row.isSample &&
          !String(row.id).startsWith('sample-')
        ) {
          row.author = actor
          table.put(row)
        }
      }
    }
    return read
  })
  await transactionDone(tx)
  return {
    entries: all[0].result,
    freetime: all[1].result,
    places: all[2].result,
    withdrawn: withdrawn.result || [],
    withdrawals: withdrawals.result,
    outboxRevision: outbox.result || '',
  }
}

// Re-check the expected metadata and any private relations in the same transaction
// that replaces the item. Downloading an attachment can take longer than a local edit.
export async function applyCloudObject(kind, id, value, accepts, paths = {}) {
  const db = await journalDatabase()
  const tableName = { entries: 'records', freetime: 'plans', places: 'places' }[
    kind
  ]
  if (!tableName) throw new Error('不支持的同步内容。')
  const tx = db.transaction(recordStores, 'readwrite'),
    done = transactionDone(tx)
  const table = tx.objectStore(tableName),
    current = table.get(id)
  const withdrawals = readWithdrawals(tx)
  const withdrawn = tx.objectStore('settings').get('withdrawn-places'),
    records = tx.objectStore('records').getAll(),
    plans = tx.objectStore('plans').getAll()
  let accepted = false,
    cause
  plans.onsuccess = () => {
    try {
      if (
        !accepts(
          current.result || null,
          records.result,
          plans.result,
          withdrawn.result || [],
          withdrawals.result,
        )
      )
        return
      if (kind === 'entries' && value) {
        const previous = current.result
        const next = createEntry({
          ...value,
          stickerAuthor: previous?.stickerAuthor,
          reactions: previous?.reactions,
          isBreakfast: previous?.isBreakfast,
          breakfastKind: previous?.breakfastKind,
        })
        if (paths.keepPhoto && current.result?.image)
          next.image = current.result.image
        if (paths.keepAudio && current.result?.audio)
          next.audio = current.result.audio
        writeSplit(storesFor(tx), next, current.result, paths)
      } else if (value) {
        const previous = current.result
        const next = { ...value }
        if (previous?.stickerAuthor) next.stickerAuthor = previous.stickerAuthor
        if (kind === 'freetime') {
          for (const key of ['completions', 'reopened']) {
            const authors = new Map(
              (previous?.[key] || []).map((row) => [
                row.key,
                row.stickerAuthor,
              ]),
            )
            next[key] = (next[key] || []).map((row) =>
              authors.get(row.key)
                ? { ...row, stickerAuthor: authors.get(row.key) }
                : row,
            )
          }
        }
        table.put(next)
      } else {
        if (kind === 'entries')
          for (const key of kinds)
            deleteMedia(tx.objectStore('media'), current.result?.[key], key)
        if (kind === 'places' && current.result)
          suppressPlace(tx, current.result)
        table.delete(id)
      }
      accepted = true
    } catch (e) {
      cause = e
      tx.abort()
    }
  }
  try {
    await done
  } catch (e) {
    throw cause || e
  }
  if (accepted) announce('cloud', true)
  return accepted
}

export async function readSharedAttachment(id, kind, expectedRef) {
  const db = await journalDatabase()
  if (!kinds.includes(kind)) throw new Error('共享附件不可用。')
  const tx = db.transaction(['records', 'media']),
    read = tx.objectStore('records').get(id)
  let result, ref
  read.onsuccess = () => {
    const entry = read.result
    if (
      !entry ||
      entry.isSample ||
      entry.visibility === 'private' ||
      entry[kind] !== expectedRef
    )
      return
    ref = entry[kind]
    if (isLocalMedia(ref)) result = tx.objectStore('media').get(ref)
  }
  await transactionDone(tx)
  if (!ref || (isLocalMedia(ref) && !result?.result))
    throw new Error('附件或可见范围已改变，请重新同步。')
  if (!isLocalMedia(ref)) return ref
  const value = result.result
  return value instanceof Blob
    ? value
    : new Blob([value.bytes], { type: value.type })
}

// Resolve only content-addressed media already downloaded by a shared record.
// This index avoids reading private attachments or scanning every journal entry.
export async function readCachedAttachment(path, type) {
  const photo = /^shared\/photos\/[a-f0-9]{40}\.jpg$/.test(path)
  if (!photo && !/^shared\/audio\/[a-f0-9]{40}\.bin$/.test(path)) return null
  const db = await journalDatabase(),
    tx = db.transaction(['records', 'media'])
  const table = tx.objectStore('records'),
    media = tx.objectStore('media')
  const cursor = table
    .index(photo ? 'cloudPhotoPath' : 'cloudAudioPath')
    .openCursor(IDBKeyRange.only(path))
  let data
  cursor.onsuccess = () => {
    const next = cursor.result
    if (!next) return
    const row = next.value,
      ref = row[photo ? 'image' : 'audio']
    if (row.visibility !== 'shared' || row.isSample || !isLocalMedia(ref)) {
      next.continue()
      return
    }
    const read = media.get(ref)
    read.onsuccess = () => {
      if (read.result) data = read.result
      else next.continue()
    }
  }
  await transactionDone(tx)
  if (!data) return null
  const stored =
    data instanceof Blob ? data : new Blob([data.bytes], { type: data.type })
  return blobDataUrl(
    stored.type === type ? stored : new Blob([stored], { type }),
  )
}
