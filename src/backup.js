import { CATEGORIES } from './journal.js'
import {
  exportRecords,
  replaceRecords,
  requestDone,
  normalizePlace,
} from './storage.js'
import {
  exportPlanSnapshot,
  planSnapshotEntries,
  isPlanStorageKey,
  notifyPlanRestore,
} from './plans.js'
import { dataMediaType } from './media-store.js'

const signature = 'little-days-backup'
const keys = [
  'recommendDining',
  'layout',
  'allowPicks',
  'samples',
  'mealHistory',
]
const prefKey = (key) => 'little.days.' + key
const scopes = ['private', 'shared']
const kinds = ['wish', 'chore', 'birthday', 'anniversary']
const settings = ['any', 'out', 'home']
const object = (x) => x !== null && typeof x === 'object' && !Array.isArray(x)
const string = (x) => typeof x === 'string'
const nonempty = (x) => string(x) && x.trim().length > 0
const bool = (x) => typeof x === 'boolean'
const listOfStrings = (x) => Array.isArray(x) && x.every(string)
const timestamp = (x) =>
  string(x) && /^\d{4}-\d\d-\d\dT/.test(x) && Number.isFinite(Date.parse(x))
const date = (x) => {
  if (!string(x) || !/^\d{4}-\d\d-\d\d$/.test(x) || x.startsWith('0000'))
    return false
  const parsed = new Date(x + 'T12:00:00Z')
  return (
    Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === x
  )
}
function requireValue(ok, field) {
  if (!ok) throw new Error('备份中的' + field + '无效，未能恢复。')
}
function validMedia(value, kind) {
  if (value === '') return true
  if (!string(value)) return false
  if (
    kind === 'image' &&
    /^\/images\/[A-Za-z0-9_-]+\.(?:jpg|jpeg|png|webp)$/i.test(value)
  )
    return true
  if (!dataMediaType(value, kind)) return false
  const start = value.indexOf(',') + 1
  const length = value.length - start
  if (!length || length % 4) return false
  return /^[A-Za-z0-9+/]+={0,2}$/.test(value.slice(start))
}
function uniqueIds(items, what) {
  const ids = new Set()
  for (const item of items) {
    requireValue(
      object(item) && nonempty(item.id) && !ids.has(item.id),
      what + '编号',
    )
    // IDs must safely round-trip as URL and storage keys.
    try {
      encodeURIComponent(item.id)
    } catch {
      throw new Error('备份中的编号无效。')
    }
    ids.add(item.id)
  }
}
function checkRecords(records) {
  requireValue(Array.isArray(records), '手记列表')
  uniqueIds(records, '手记')
  for (const r of records) {
    requireValue(
      nonempty(r.title) &&
        CATEGORIES.includes(r.category) &&
        timestamp(r.createdAt),
      '手记内容或日期',
    )
    requireValue(
      scopes.includes(r.visibility) && bool(r.favorite) && bool(r.isSample),
      '手记可见范围或收藏状态',
    )
    requireValue(
      ['', 'home', 'out'].includes(r.diningSource) && string(r.venueName),
      '用餐来源',
    )
    requireValue(
      Number.isInteger(r.rating) &&
        r.rating >= 0 &&
        r.rating <= 5 &&
        ['', '好吃', '一般', '不合口味'].includes(r.taste),
      '手记评价',
    )
    requireValue(
      ['text', 'photo', 'voice'].includes(r.source) &&
        ['text', 'notes', 'feeling'].every((k) => string(r[k])) &&
        listOfStrings(r.steps) &&
        listOfStrings(r.ingredients),
      '手记字段',
    )
    requireValue(
      (r.photoDescription === undefined || string(r.photoDescription)) &&
        (r.originalTextUnverified === undefined ||
          bool(r.originalTextUnverified)),
      '照片描述',
    )
    requireValue(
      validMedia(r.image, 'image') && validMedia(r.audio, 'audio'),
      '照片或录音',
    )
  }
}
function checkPlans(plans) {
  requireValue(Array.isArray(plans), '清单')
  uniqueIds(plans, '事项')
  let archived = 0
  for (const p of plans) {
    requireValue(
      nonempty(p.title) &&
        kinds.includes(p.kind) &&
        scopes.includes(p.visibility) &&
        settings.includes(p.setting),
      '事项内容',
    )
    requireValue(
      timestamp(p.createdAt) &&
        timestamp(p.updatedAt) &&
        (p.date === '' || date(p.date)) &&
        string(p.sourceEntryId),
      '事项日期或手记关联',
    )
    requireValue(
      !['birthday', 'anniversary'].includes(p.kind) || date(p.date),
      '重要日子',
    )
    requireValue(
      Array.isArray(p.completions) && Array.isArray(p.reopened),
      '归档记录',
    )
    const seen = new Set()
    for (const [rows, completed] of [
      [p.completions, true],
      [p.reopened, false],
    ])
      for (const row of rows) {
        requireValue(
          object(row) &&
            row.planId === p.id &&
            ['task', 'prepare', 'day'].includes(row.stage),
          '归档事项关联',
        )
        const annual = row.stage !== 'task'
        requireValue(
          annual
            ? Number.isInteger(row.year) &&
                row.year >= 1 &&
                row.year <= 9999 &&
                date(row.eventDate)
            : row.year === null && row.eventDate === '',
          '归档年份',
        )
        const key =
          encodeURIComponent(p.id) + ':' + row.stage + ':' + (row.year ?? '')
        requireValue(
          row.key === key && row.id === key && !seen.has(key),
          '归档编号',
        )
        seen.add(key)
        requireValue(
          kinds.includes(row.kind) &&
            settings.includes(row.setting) &&
            nonempty(row.title) &&
            nonempty(row.planTitle) &&
            string(row.sourceEntryId) &&
            (row.date === '' || date(row.date)),
          '归档内容',
        )
        requireValue(
          completed ? timestamp(row.doneAt) : row.doneAt === '',
          '归档时间',
        )
      }
    archived += p.completions.length
  }
  return archived
}
function checkPreferences(prefs) {
  requireValue(
    object(prefs) && Object.keys(prefs).every((k) => keys.includes(k)),
    '偏好设置',
  )
  const allows = {
    layout: (v) => ['grid', 'list'].includes(v),
    recommendDining: (v) => ['', 'home', 'out'].includes(v),
    allowPicks: bool,
    samples: bool,
    mealHistory: (v) =>
      Array.isArray(v) &&
      v.every(
        (row) =>
          object(row) &&
          nonempty(row.slot) &&
          nonempty(row.id) &&
          Number.isSafeInteger(row.turn) &&
          row.turn >= 0,
      ),
  }
  for (const [k, v] of Object.entries(prefs))
    requireValue(allows[k](v), '偏好设置')
}
export function validateBackup(data) {
  if (!object(data) || data.format !== signature)
    throw new Error('请选择「小日子」导出的 JSON 备份。')
  if (data.version !== 1) throw new Error('当前版本无法读取这种备份版本。')
  requireValue(
    timestamp(data.exportedAt) && string(data.generation),
    '备份信息',
  )
  checkRecords(data.records)
  const archived = checkPlans(data.plans)
  if (data.places !== undefined) {
    requireValue(Array.isArray(data.places), '店铺档案')
    uniqueIds(data.places, '店铺')
    for (const item of data.places)
      requireValue(
        nonempty(item.name) &&
          listOfStrings(item.aliases) &&
          item.visibility === 'shared',
        '店铺档案',
      )
  }
  checkPreferences(data.preferences)
  return { records: data.records.length, plans: data.plans.length, archived }
}
export async function exportBackup() {
  let planSnapshot, places
  const preferences = {}
  // Capture lightweight settings and plans alongside the records snapshot, before encoding media.
  const records = await exportRecords((tx) => {
    planSnapshot = exportPlanSnapshot(tx)
    places = tx
      ? requestDone(tx.objectStore('places').getAll())
      : Promise.resolve([])
    for (const key of keys) {
      const value = localStorage.getItem(prefKey(key))
      if (value !== null) preferences[key] = JSON.parse(value)
    }
  })
  const backup = {
    format: signature,
    version: 1,
    exportedAt: new Date().toISOString(),
    records,
    ...(await planSnapshot),
    places: await places,
    preferences,
  }
  validateBackup(backup)
  return backup
}
function replaceLocal(data, database) {
  const next = database
    ? new Map()
    : planSnapshotEntries(data.plans, data.generation)
  const prefs = new Set(keys.map(prefKey))
  for (const [key, value] of Object.entries(data.preferences))
    next.set(prefKey(key), JSON.stringify(value))
  const previous = new Map()
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i)
    if (key && (isPlanStorageKey(key) || prefs.has(key)))
      previous.set(key, localStorage.getItem(key))
  }
  const all = new Set([...previous.keys(), ...next.keys()])
  function apply(entries) {
    for (const key of all) localStorage.removeItem(key)
    for (const [k, v] of entries) localStorage.setItem(k, v)
  }
  try {
    apply(next)
  } catch (error) {
    apply(previous)
    throw error
  }
  return () => apply(previous)
}
export async function importBackup(data) {
  const summary = validateBackup(data)
  const notebook = {
    plans: data.plans,
    generation: data.generation,
    places: data.places?.map(normalizePlace),
  }
  await replaceRecords(
    data.records,
    (database) => replaceLocal(data, database),
    notebook,
  )
  notifyPlanRestore()
  return summary
}
