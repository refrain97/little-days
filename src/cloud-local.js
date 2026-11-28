import { createEntry, publicAuthor } from './journal.js'
import { normalPlan } from './plans.js'
import {
  sharedLocalState,
  readSharedAttachment,
  applyCloudObject,
  normalizePlace,
  onExternalChange,
  localPrivacy,
  isSharedMutation,
  ackOutbox,
  readCachedAttachment,
} from './storage.js'
import { isLocalMedia, blobDataUrl, dataMediaType } from './media-store.js'
import { assetPath } from './paths.js'
import { compressJournalPhoto } from './device-ai.js'
import { validateBackup } from './backup.js'

const recordFields = [
  'id',
  'visibility',
  'isSample',
  'title',
  'category',
  'diningSource',
  'venueName',
  'createdAt',
  'text',
  'notes',
  'rating',
  'taste',
  'favorite',
  'ingredients',
  'steps',
  'feeling',
  'source',
  'photoDescription',
  'originalTextUnverified',
]
const planFields = [
  'id',
  'visibility',
  'title',
  'kind',
  'setting',
  'date',
  'sourceEntryId',
  'createdAt',
  'updatedAt',
  'doneAt',
]
const stepFields = [
  'id',
  'key',
  'planId',
  'title',
  'planTitle',
  'kind',
  'setting',
  'date',
  'stage',
  'year',
  'eventDate',
  'doneAt',
  'sourceEntryId',
  'visibility',
]
const placeFields = ['id', 'visibility', 'name', 'aliases', 'automatic']
const sample = (id) =>
  typeof id === 'string' && (id.startsWith('sample-') || id.startsWith('idea-'))
const builtInPhoto = (path) =>
  /^\/images\/[a-zA-Z0-9_-]+\.(?:webp|jpe?g|png)$/i.test(path)
const pick = (obj, fields) =>
  Object.fromEntries(
    fields.filter((f) => obj[f] !== undefined).map((f) => [f, obj[f]]),
  )

// Animal identities and stamps belong to the local notebook in this release.
function authorship(row) {
  const author = publicAuthor(row?.author),
    updatedBy = publicAuthor(row?.updatedBy)
  return { ...(author ? { author } : {}), ...(updatedBy ? { updatedBy } : {}) }
}
function cleanStep(row) {
  return { ...pick(row, stepFields), ...authorship(row), visibility: 'shared' }
}
function metadata(kind, row) {
  if (kind === 'entries')
    return {
      ...pick(createEntry(row), recordFields),
      ...authorship(row),
      visibility: 'shared',
      isSample: false,
    }
  if (kind === 'places')
    return {
      ...pick(normalizePlace(row), placeFields),
      ...authorship(row),
      visibility: 'shared',
    }
  const p = normalPlan(row)
  return {
    ...pick(p, planFields),
    ...authorship(row),
    visibility: 'shared',
    completions: p.completions.map(cleanStep),
    reopened: p.reopened.map(cleanStep),
  }
}
function entity(kind, row) {
  const result = { kind, id: row.id, data: metadata(kind, row) }
  if (kind === 'entries') {
    if (isLocalMedia(row.image) || builtInPhoto(row.image))
      result.photoKey = row.image
    if (isLocalMedia(row.audio)) result.audioKey = row.audio
  }
  return result
}
function same(a, b) {
  if (a === b) return true
  if (!a || !b || typeof a !== 'object' || typeof b !== 'object') return false
  const keys = Object.keys(a)
  return (
    keys.length === Object.keys(b).length &&
    keys.every((k) => Object.hasOwn(b, k) && same(a[k], b[k]))
  )
}

export function onCloudLocalChange(callback) {
  let pending = false
  const signal = () => {
    if (!pending) {
      pending = true
      queueMicrotask(() => {
        pending = false
        callback()
      })
    }
  }
  globalThis.addEventListener?.('little-days-local-edit', signal)
  const stop = onExternalChange((event) => {
    if (isSharedMutation(event)) signal()
  })
  return () => {
    stop()
    globalThis.removeEventListener?.('little-days-local-edit', signal)
  }
}

export function createCloudAdapter() {
  async function snapshot() {
    const state = await sharedLocalState(),
      restricted = localPrivacy(
        state.entries,
        state.freetime,
        state.withdrawals,
      )
    const entities = [],
      privateKeys = []
    for (const kind of ['entries', 'places', 'freetime']) {
      for (const row of state[kind]) {
        if (row.isSample || sample(row.id)) continue
        if (!restricted[kind].has(row.id)) entities.push(entity(kind, row))
      }
    }
    for (const kind of ['entries', 'freetime'])
      for (const id of restricted[kind])
        if (!sample(id)) privateKeys.push({ kind, id })
    const visiblePlaces = new Set(state.places.map((p) => p.id))
    for (const id of state.withdrawn)
      if (!visiblePlaces.has(id)) privateKeys.push({ kind: 'places', id })
    return { entities, privateKeys, outboxRevision: state.outboxRevision }
  }
  async function requireCurrent(expected) {
    const { entities } = await snapshot()
    if (
      !same(
        entities.find((v) => v.kind === expected.kind && v.id === expected.id),
        expected,
      )
    )
      throw new Error('共享内容在读取时已改变，请重新同步。')
  }
  async function attachment(expected, kind) {
    if (expected.kind !== 'entries') return null
    const key = kind === 'image' ? expected.photoKey : expected.audioKey
    if (!key) return null
    await requireCurrent(expected)
    let value = await readSharedAttachment(expected.id, kind, key)
    if (typeof value === 'string' && builtInPhoto(value)) {
      const response = await fetch(assetPath(value))
      if (!response.ok) throw new Error('无法读取内置照片。')
      value = await response.blob()
    }
    const data =
      kind === 'image'
        ? await compressJournalPhoto(value)
        : value instanceof Blob
          ? await blobDataUrl(value)
          : value
    if (!dataMediaType(data, kind)) throw new Error('共享附件格式无效。')
    await requireCurrent(expected)
    return data
  }
  async function apply({
    kind,
    id,
    data,
    photoPath,
    audioPath,
    readPhoto,
    readAudio,
    expected,
    keepPhoto = false,
    keepAudio = false,
  }) {
    if (
      !['entries', 'places', 'freetime'].includes(kind) ||
      typeof id !== 'string' ||
      !id ||
      sample(id)
    )
      return false
    const accepts = (current, records, plans, withdrawn, withdrawals) => {
      if (kind === 'places' && !current && withdrawn.includes(id)) return false
      const restricted = localPrivacy(records, plans, withdrawals)
      if (
        current?.isSample ||
        current?.visibility === 'private' ||
        restricted[kind].has(id)
      )
        return false
      if (value && kind !== 'places') {
        const nextRecords =
          kind === 'entries'
            ? [...records.filter((r) => r.id !== id), value]
            : records
        const nextPlans =
          kind === 'freetime'
            ? [...plans.filter((p) => p.id !== id), value]
            : plans
        if (localPrivacy(nextRecords, nextPlans, withdrawals)[kind].has(id))
          return false
      }
      return same(current ? entity(kind, current) : null, expected || null)
    }
    let value = null
    if (data != null) {
      if (
        data.visibility !== 'shared' ||
        data.isSample ||
        (data.id && data.id !== id)
      )
        return false
      const wire = { ...data, id, visibility: 'shared' }
      if (kind === 'entries') {
        keepPhoto = Boolean(keepPhoto && photoPath && expected?.photoKey)
        keepAudio = Boolean(keepAudio && audioPath && expected?.audioKey)
        const image = photoPath && !keepPhoto ? await readPhoto() : '',
          audio = audioPath && !keepAudio ? await readAudio() : ''
        if (
          (photoPath && !keepPhoto && !dataMediaType(image, 'image')) ||
          (audioPath && !keepAudio && !dataMediaType(audio, 'audio'))
        )
          throw new Error('云端附件尚未完整读取。')
        value = {
          ...pick(wire, recordFields),
          ...authorship(wire),
          isSample: false,
          image,
          audio,
        }
      } else if (kind === 'freetime') {
        if (!Array.isArray(wire.completions) || !Array.isArray(wire.reopened))
          throw new Error('云端清单格式无效。')
        value = {
          ...pick(wire, planFields),
          ...authorship(wire),
          completions: wire.completions.map(cleanStep),
          reopened: wire.reopened.map(cleanStep),
        }
      } else
        value = normalizePlace({
          ...pick(wire, placeFields),
          ...authorship(wire),
        })
      validateBackup({
        format: 'little-days-backup',
        version: 1,
        exportedAt: new Date().toISOString(),
        preferences: {},
        generation: '',
        records: kind === 'entries' ? [value] : [],
        places: kind === 'places' ? [value] : [],
        plans: kind === 'freetime' ? [value] : [],
      })
    }
    return applyCloudObject(kind, id, value, accepts, {
      cloudPhotoPath: photoPath,
      cloudAudioPath: audioPath,
      keepPhoto,
      keepAudio,
    })
  }
  return {
    snapshot,
    apply,
    ackOutbox,
    readCachedAttachment,
    readPhoto: (item) => attachment(item, 'image'),
    readAudio: (item) => attachment(item, 'audio'),
  }
}
