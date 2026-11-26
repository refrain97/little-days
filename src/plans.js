import {
  journalDatabase,
  requestDone,
  transactionDone,
  announce,
  onExternalChange,
  localAuthor,
  propagatePrivacy,
  setPrivacyMarker,
} from './storage.js'
import { authorship } from './journal.js'
const prefix = 'xiaorizi.plans.v1:'
const items = prefix + 'item:'
const steps = prefix + 'step:'
const linkedGeneration = prefix + 'linked-generation'
const kinds = ['wish', 'chore', 'birthday', 'anniversary']
const settings = ['home', 'out', 'any']
const isAnnual = (kind) => kind === 'birthday' || kind === 'anniversary'
const subscribers = new Set()
let notifying = false,
  unsubscribeUpdates

function notify() {
  if (notifying || !subscribers.size) return
  notifying = true
  queueMicrotask(() => {
    notifying = false
    for (const callback of subscribers) callback()
  })
}

function storageChanged(event) {
  if (event.key === null || event.key?.startsWith(prefix)) notify()
}

export function onPlansChange(callback) {
  if (!subscribers.size) {
    globalThis.addEventListener?.('storage', storageChanged)
    unsubscribeUpdates = onExternalChange((event) => {
      if (['plans', 'cloud', 'restore'].includes(event)) notify()
    })
  }
  subscribers.add(callback)
  return () => {
    subscribers.delete(callback)
    if (!subscribers.size) {
      globalThis.removeEventListener?.('storage', storageChanged)
      unsubscribeUpdates?.()
    }
  }
}

function store() {
  try {
    if (globalThis.localStorage) return globalThis.localStorage
  } catch {
    /* Some private windows deny access to the storage object. */
  }
  throw new Error('此浏览器暂时无法保存清单，请检查站点存储权限。')
}

function keysStartingWith(storage, start) {
  const keys = []
  for (let i = 0; i < storage.length; i++) {
    const key = storage.key(i)
    if (key?.startsWith(start)) keys.push(key)
  }
  return keys
}

const itemKey = (id) => items + encodeURIComponent(id)
const rowKey = (id, stage, year) =>
  encodeURIComponent(id) + ':' + stage + ':' + (year ?? '')

function withHistory(plan, history) {
  const visibility = plan.visibility === 'private' ? 'private' : 'shared'
  const pick = (obj, keys) =>
    Object.fromEntries(
      keys.filter((k) => obj[k] !== undefined).map((k) => [k, obj[k]]),
    )
  const rows = history.map((row) => ({
    ...pick(row, [
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
    ]),
    ...authorship(row),
    visibility,
  }))
  const completions = rows.filter((row) => row.doneAt)
  return {
    ...pick(plan, [
      'id',
      'title',
      'kind',
      'setting',
      'date',
      'sourceEntryId',
      'createdAt',
      'updatedAt',
    ]),
    ...authorship(plan),
    visibility,
    completions,
    reopened: rows.filter((row) => !row.doneAt),
    doneAt: completions.find((row) => row.stage === 'task')?.doneAt || '',
  }
}

export function legacyPlanSnapshot() {
  let storage
  try {
    storage = store()
  } catch {
    return { plans: [], generation: '', raw: new Map() }
  }
  const rows = [],
    history = new Map(),
    raw = new Map()
  for (const key of keysStartingWith(storage, prefix)) {
    if (!isPlanStorageKey(key)) continue
    const value = storage.getItem(key)
    raw.set(key, value)
    if (key === linkedGeneration || !value) continue
    const data = JSON.parse(value)
    if (key.startsWith(items)) rows.push(data)
    else {
      if (!history.has(data.planId)) history.set(data.planId, [])
      history.get(data.planId).push(data)
    }
  }
  return {
    plans: rows.map((p) => withHistory(p, history.get(p.id) || [])),
    generation: raw.get(linkedGeneration) || '',
    raw,
  }
}

export function normalPlan(plan) {
  return withHistory(plan, [
    ...(plan.completions || []),
    ...(plan.reopened || []),
  ])
}

export async function readPlans() {
  const { plans } = await exportPlanSnapshot()
  return plans
    .map(normalPlan)
    .sort(
      (a, b) =>
        b.createdAt.localeCompare(a.createdAt) || a.id.localeCompare(b.id),
    )
}

async function editPlans(operation) {
  const db = await journalDatabase()
  if (!db) {
    const write = () => {
      const previous = legacyPlanSnapshot()
      const change = operation(previous.plans, previous.generation)
      if (!change.put && !change.remove) return change.result
      if (change.put?.visibility === 'private')
        throw new Error('此浏览器未开放 IndexedDB，无法保存仅自己可见的清单。')
      const all = previous.plans.filter(
        (p) => p.id !== (change.put?.id || change.remove),
      )
      if (change.put) all.push(change.put)
      const next = planSnapshotEntries(
        all,
        change.generation ?? previous.generation,
      )
      const storage = store()
      const touched = new Set(
        [...previous.raw.keys(), ...next.keys()].filter(
          (key) => previous.raw.get(key) !== next.get(key),
        ),
      )
      try {
        for (const key of touched)
          if (next.has(key)) storage.setItem(key, next.get(key))
          else storage.removeItem(key)
      } catch (e) {
        for (const key of touched)
          if (previous.raw.has(key)) storage.setItem(key, previous.raw.get(key))
          else storage.removeItem(key)
        throw e
      }
      notify()
      announce('plans')
      return change.result
    }
    return globalThis.navigator?.locks
      ? navigator.locks.request('xiaorizi-local-journal', write)
      : write()
  }
  const tx = db.transaction(
      ['plans', 'records', 'places', 'settings'],
      'readwrite',
    ),
    done = transactionDone(tx)
  const plans = tx.objectStore('plans'),
    settings = tx.objectStore('settings')
  const read = plans.getAll(),
    generation = settings.get('plan-generation')
  let change, cause
  generation.onsuccess = () => {
    try {
      change = operation(read.result.map(normalPlan), generation.result || '')
      if (change.put) plans.put(change.put)
      if (change.remove) plans.delete(change.remove)
      const id = change.put?.id || change.remove
      if (id) {
        const prior = read.result.find((p) => p.id === id)
        if (
          change.put?.visibility === 'private' ||
          prior?.visibility === 'private'
        )
          setPrivacyMarker(
            tx,
            'freetime',
            id,
            change.put ? change.put.visibility === 'private' : true,
          )
        propagatePrivacy(tx, (scope) => {
          if (
            change.result &&
            typeof change.result === 'object' &&
            scope.freetime.has(id)
          )
            change.result.visibility = 'private'
        })
      }
      if (change.generation !== undefined)
        settings.put(change.generation, 'plan-generation')
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
  if (change.put || change.remove) {
    notify()
    announce('plans')
  }
  return change.result
}

function calendarDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || value.startsWith('0000'))
    return false
  const date = new Date(value + 'T12:00:00Z')
  return (
    Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value
  )
}

function localDay(value) {
  if (typeof value === 'string' && calendarDate(value)) return value
  const date = value instanceof Date ? value : new Date(value)
  if (!Number.isFinite(date.getTime())) throw new Error('日期无效。')
  return [
    String(date.getFullYear()).padStart(4, '0'),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-')
}

function shiftDay(day, delta) {
  // Arithmetic uses calendar dates, so a 23- or 25-hour local day still counts as one.
  const date = new Date(day + 'T12:00:00Z')
  date.setUTCDate(date.getUTCDate() + delta)
  return date.toISOString().slice(0, 10)
}

function annualDate(plan, year) {
  const occurrence = String(year).padStart(4, '0') + plan.date.slice(4)
  return calendarDate(occurrence)
    ? occurrence
    : String(year).padStart(4, '0') + '-02-28'
}

function nextYear(plan, today) {
  const year = Math.max(
    Number(today.slice(0, 4)),
    Number(plan.date.slice(0, 4)),
  )
  return annualDate(plan, year) < today ? year + 1 : year
}

function newId() {
  return (
    globalThis.crypto?.randomUUID?.() ||
    'plan-' +
      Date.now().toString(36) +
      '-' +
      Math.random().toString(36).slice(2)
  )
}

export async function putPlan(fields = {}, { editing = false } = {}) {
  return editPlans((plans) => {
    const current = plans.find((plan) => plan.id === fields.id)
    if (editing && !current) throw new Error('这件事已从清单移除。')
    const data = { ...current, ...fields }
    const title = String(data.title ?? '').trim(),
      kind = data.kind || 'wish',
      setting = data.setting || 'any'
    const date = String(data.date || '').trim(),
      sourceEntryId = String(data.sourceEntryId || '')
    if (!title) throw new Error('先写下这件事的名字。')
    if (!kinds.includes(kind) || !settings.includes(setting))
      throw new Error('清单类型或场景无效。')
    if (date && !calendarDate(date)) throw new Error('请选择有效日期。')
    if (!date && isAnnual(kind)) throw new Error('请选择生日或纪念日的日期。')
    if (!fields.id && sourceEntryId && !isAnnual(kind)) {
      const existing = plans.find(
        (plan) =>
          plan.sourceEntryId === sourceEntryId &&
          plan.kind === kind &&
          !plan.doneAt,
      )
      if (existing) return { result: existing }
    }
    const id = String(fields.id || newId()),
      now = new Date().toISOString()
    const plan = normalPlan({
      id,
      title,
      kind,
      setting,
      date,
      sourceEntryId,
      visibility: data.visibility === 'private' ? 'private' : 'shared',
      createdAt: current?.createdAt || now,
      updatedAt: now,
      ...localAuthor(current),
      completions: current?.completions || [],
      reopened: current?.reopened || [],
    })
    return { put: plan, result: plan }
  })
}

export async function deletePlan(id) {
  return editPlans((plans) =>
    plans.some((p) => p.id === id)
      ? { remove: id, result: true }
      : { result: false },
  )
}

function actionRow(plan, stage, year = null) {
  const key = rowKey(plan.id, stage, year)
  const eventDate = stage === 'task' ? '' : annualDate(plan, year)
  let title = plan.title
  if (stage === 'prepare')
    title += plan.kind === 'birthday' ? ' · 准备生日礼物' : ' · 为纪念日做准备'
  if (stage === 'day')
    title += plan.kind === 'birthday' ? ' · 送上生日祝福' : ' · 庆祝纪念日'
  return {
    id: key,
    ...authorship(plan),
    key,
    planId: plan.id,
    title,
    planTitle: plan.title,
    kind: plan.kind || 'wish',
    setting: plan.setting || 'any',
    visibility: plan.visibility === 'private' ? 'private' : 'shared',
    stage,
    year,
    date:
      stage === 'prepare'
        ? shiftDay(eventDate, -14)
        : eventDate || plan.date || '',
    eventDate,
    doneAt: '',
    sourceEntryId: plan.sourceEntryId || '',
  }
}

function requestedStep(plan, stage, year, today) {
  if (!isAnnual(plan.kind)) {
    if (stage && stage !== 'task') throw new Error('当前事项没有这个步骤。')
    return actionRow(plan, 'task')
  }
  const targetYear = year == null ? nextYear(plan, today) : Number(year)
  if (
    !Number.isInteger(targetYear) ||
    targetYear < Number(plan.date.slice(0, 4)) ||
    targetYear > 9999
  ) {
    throw new Error('周年年份无效。')
  }
  const target =
    stage || (today === annualDate(plan, targetYear) ? 'day' : 'prepare')
  if (target !== 'prepare' && target !== 'day')
    throw new Error('请选择准备或当天事项。')
  return actionRow(plan, target, targetYear)
}

function editStep(id, operation) {
  return editPlans((plans) => {
    const plan = plans.find((p) => p.id === id)
    if (!plan) throw new Error('这件事已经从清单移除。')
    return operation(plan)
  })
}

export async function finishPlan(id, stage, year) {
  return editStep(id, (plan) => {
    const key = stage && rowKey(id, stage, stage === 'task' ? null : year)
    const existing = [...plan.completions, ...plan.reopened].find(
      (r) => r.key === key,
    )
    const row =
      existing || requestedStep(plan, stage, year, localDay(new Date()))
    const previous = plan.completions.find((r) => r.key === row.key)
    if (previous) return { result: previous }
    const finished = {
      ...row,
      ...localAuthor(plan),
      doneAt: new Date().toISOString(),
    }
    return {
      put: normalPlan({
        ...plan,
        ...localAuthor(plan),
        updatedAt: finished.doneAt,
        completions: [...plan.completions, finished],
        reopened: plan.reopened.filter((r) => r.key !== row.key),
      }),
      result: finished,
    }
  })
}

export async function restorePlan(id, stage, year) {
  return editStep(id, (plan) => {
    const matches = (row) =>
      (!stage || row.stage === stage) &&
      (year == null || row.year === Number(year))
    const completed = plan.completions
      .filter(matches)
      .sort((a, b) => b.doneAt.localeCompare(a.doneAt))[0]
    if (!completed) return { result: plan.reopened.find(matches) || null }
    const reopened = { ...completed, doneAt: '' }
    return {
      put: normalPlan({
        ...plan,
        ...localAuthor(plan),
        updatedAt: new Date().toISOString(),
        completions: plan.completions.filter((r) => r.key !== completed.key),
        reopened:
          reopened.stage === 'task' && !isAnnual(plan.kind)
            ? plan.reopened
            : [...plan.reopened, reopened],
      }),
      result: reopened,
    }
  })
}

export function derivePlanLists(plans, now = new Date()) {
  const today = localDay(now)
  const open = []
  const upcoming = []
  const archive = []
  for (const plan of plans) {
    const completions = plan.completions || []
    const reopened = plan.reopened || []
    const handled = new Set([...completions, ...reopened].map((row) => row.key))
    archive.push(...completions)
    open.push(...reopened)
    if (!isAnnual(plan.kind)) {
      const row = actionRow(plan, 'task')
      if (!handled.has(row.key)) open.push(row)
      continue
    }
    if (!calendarDate(plan.date)) continue
    const year = nextYear(plan, today)
    if (year > 9999) continue
    const prepare = actionRow(plan, 'prepare', year)
    const day = actionRow(plan, 'day', year)
    if (prepare.date <= today && !handled.has(prepare.key)) open.push(prepare)
    if (day.date === today && !handled.has(day.key)) open.push(day)
    const finishedDays = new Set(
      completions.filter((row) => row.stage === 'day').map((row) => row.year),
    )
    let next = year
    while (next <= 9999 && finishedDays.has(next)) next++
    if (next <= 9999)
      upcoming.push(next === year ? day : actionRow(plan, 'day', next))
  }
  const priority = (row) =>
    row.stage === 'day' && row.date === today
      ? 0
      : row.date && row.date <= today
        ? 1
        : !row.date
          ? 2
          : 3
  open.sort((a, b) => priority(a) - priority(b) || a.date.localeCompare(b.date))
  upcoming.sort(
    (a, b) =>
      a.date.localeCompare(b.date) ||
      a.planTitle.localeCompare(b.planTitle, 'zh-CN'),
  )
  archive.sort(
    (a, b) => b.doneAt.localeCompare(a.doneAt) || a.key.localeCompare(b.key),
  )
  return { open, upcoming, archive }
}

// Snapshot both ordinary tasks and independent annual completion snapshots.
// The generation prevents a recreated task from reusing a deleted task's journal identity.
export async function exportPlanSnapshot(transaction) {
  const db = transaction ? null : await journalDatabase()
  if (!db && !transaction) {
    const { plans, generation } = legacyPlanSnapshot()
    return { plans, generation }
  }
  const tx = transaction || db.transaction(['plans', 'settings'])
  const [plans, generation] = await Promise.all([
    requestDone(tx.objectStore('plans').getAll()),
    requestDone(tx.objectStore('settings').get('plan-generation')),
  ])
  return { plans: plans.map(normalPlan), generation: generation || '' }
}
export function isPlanStorageKey(key) {
  return (
    key === linkedGeneration || key.startsWith(items) || key.startsWith(steps)
  )
}
export function planSnapshotEntries(plans, generation) {
  const result = new Map()
  if (generation) result.set(linkedGeneration, generation)
  for (const plan of plans) {
    const { completions, reopened, doneAt, ...fields } = plan
    result.set(itemKey(fields.id), JSON.stringify(fields))
    for (const row of [...completions, ...reopened])
      result.set(steps + row.key, JSON.stringify(row))
  }
  return result
}
export const notifyPlanRestore = notify
