import assert from 'node:assert/strict'
import test from 'node:test'

// The journal modules broadcast browser changes; these pure tests need no other tab.
globalThis.BroadcastChannel = undefined
const { createEntry } = await import('../src/journal.js')
const { preparePrivateRestore } = await import('../src/private-restore.js')
const { validatePrivateBackup, privateBackupStatus, privateBackupTimeKey } =
  await import('../src/backup.js')
const stamp = '2026-01-01T12:00:00.000Z'
const privateEntry = (id, fields = {}) =>
  createEntry({
    id,
    title: '私人的回忆',
    text: '原话。',
    createdAt: stamp,
    visibility: 'private',
    ...fields,
  })
const privatePlan = (id, sourceEntryId) => {
  const title = '私人的想做',
    key = encodeURIComponent(id) + ':task:'
  const base = {
    title,
    kind: 'wish',
    setting: 'any',
    date: '',
    sourceEntryId,
    visibility: 'private',
  }
  const step = {
    ...base,
    id: key,
    key,
    planId: id,
    planTitle: title,
    stage: 'task',
    year: null,
    eventDate: '',
    doneAt: stamp,
  }
  return {
    ...base,
    id,
    createdAt: stamp,
    updatedAt: stamp,
    doneAt: stamp,
    completions: [step],
    reopened: [],
  }
}
const bundle = (records, plans = []) => ({
  format: 'little-days-private-backup',
  version: 1,
  exportedAt: stamp,
  records,
  plans,
})

test('private restore preserves archive links and makes repeat imports idempotent across shared ID collisions', () => {
  const origin = privateEntry('repeat')
  const wish = privatePlan('plan/1', origin.id)
  const archive = privateEntry('plan-note-' + wish.completions[0].id)
  const data = bundle([origin, archive], [wish])
  const shared = privateEntry(origin.id, {
    visibility: 'shared',
    title: '共享版本',
  })
  const sharedPlan = { ...wish, visibility: 'shared' }
  assert.deepEqual(validatePrivateBackup(data), {
    records: 2,
    plans: 1,
    archived: 1,
  })
  const restored = preparePrivateRestore(data, [shared], [sharedPlan], [])
  const [record, note] = restored.records,
    [plan] = restored.plans
  assert.notEqual(record.id, origin.id)
  assert.notEqual(plan.id, wish.id)
  assert.equal(plan.sourceEntryId, record.id)
  assert.equal(plan.completions[0].sourceEntryId, record.id)
  assert.equal(plan.completions[0].planId, plan.id)
  assert.equal(note.id, 'plan-note-' + plan.completions[0].key)
  assert.equal(shared.title, '共享版本')
  const again = preparePrivateRestore(
    data,
    [shared, ...restored.records],
    [sharedPlan, plan],
    restored.receipts,
  )
  assert.deepEqual(again, restored)
  const sharedCopy = { ...record, visibility: 'shared' }
  const third = preparePrivateRestore(
    data,
    [shared, sharedCopy, note],
    [sharedPlan, plan],
    restored.receipts,
  )
  assert.notEqual(third.records[0].id, record.id)
  assert.equal(third.plans[0].sourceEntryId, third.records[0].id)
})

test('a private file rejects mixed/shared rows and photos stored as URLs', () => {
  const entry = privateEntry('p')
  assert.throws(() =>
    validatePrivateBackup(bundle([{ ...entry, visibility: 'shared' }])),
  )
  assert.throws(() =>
    validatePrivateBackup(bundle([{ ...entry, image: '/images/walk.jpg' }])),
  )
  assert.throws(() =>
    validatePrivateBackup(
      bundle([{ ...entry, image: 'https://example.invalid/photo' }]),
    ),
  )
  const plan = privatePlan('plan', 'p')
  plan.completions[0].visibility = 'shared'
  assert.throws(() => validatePrivateBackup(bundle([entry], [plan])))
  assert.doesNotThrow(() =>
    validatePrivateBackup(
      bundle([
        {
          ...entry,
          image: 'data:image/png;base64,AQID',
          audio: 'data:audio/aac;base64,BAUG',
        },
      ]),
    ),
  )
})

test('backup reminders apply to devices with private content and start after 14 days', () => {
  let saved = null
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: { getItem: (key) => (key === privateBackupTimeKey ? saved : null) },
  })
  const first = Date.parse(stamp),
    limit = 14 * 86400000
  try {
    const record = privateEntry('local'),
      plan = privatePlan('wish', 'local')
    assert.equal(privateBackupStatus([record], [], first + limit).due, false)
    assert.equal(privateBackupStatus([], [plan], first + limit + 1).due, true)
    assert.equal(
      privateBackupStatus(
        [{ ...record, visibility: 'shared' }],
        [],
        first + 99 * limit,
      ).due,
      false,
    )
    saved = new Date(first + limit + 1).toISOString()
    assert.deepEqual(privateBackupStatus([record], [], first + 2 * limit + 1), {
      lastBackupAt: saved,
      due: false,
    })
    assert.equal(
      privateBackupStatus([record], [], first + 2 * limit + 2).due,
      true,
    )
    assert.equal(privateBackupStatus([], [], first + 3 * limit).due, false)
  } finally {
    delete globalThis.localStorage
  }
})
