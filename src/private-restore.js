import { createEntry } from './journal.js'
import { normalPlan } from './plans.js'

// Restoration uses local receipts so importing again updates the same private copy.
// Fresh IDs for absent/shared rows avoid reusing a previously published Git identity.
export function preparePrivateRestore(
  data,
  records,
  plans,
  receipts,
  ideas = [],
) {
  const existing = {
    entries: new Map(records.map((row) => [row.id, row])),
    freetime: new Map(plans.map((row) => [row.id, row])),
    breakfast: new Map(ideas.map((row) => [row.id, row])),
  }
  const previous = new Map(
    receipts.map((row) => [row.kind + ':' + row.from, row.to]),
  )
  const result = { records: [], plans: [], breakfast: [], receipts: [] }
  const ids = { entries: new Map(), freetime: new Map(), breakfast: new Map() }
  const reserved = {
    entries: new Set(),
    freetime: new Set(),
    breakfast: new Set(),
  }
  const fresh = () =>
    'private-' +
    (globalThis.crypto?.randomUUID?.() ||
      Date.now().toString(36) + '-' + Math.random().toString(36).slice(2))
  function choose(kind, original, linked) {
    const rows = existing[kind],
      saved = previous.get(kind + ':' + original)
    const inherited = [saved, original].find(
      (id) => rows.get(id)?.visibility === 'private' && !reserved[kind].has(id),
    )
    let id = linked || inherited
    if (
      !id ||
      rows.get(id)?.visibility === 'shared' ||
      reserved[kind].has(id)
    ) {
      do {
        id = (kind === 'breakfast' ? 'idea-' : '') + fresh()
      } while (rows.has(id) || reserved[kind].has(id))
    }
    reserve(kind, original, id)
    return id
  }
  function reserve(kind, original, id) {
    ids[kind].set(original, id)
    reserved[kind].add(id)
  }
  const byPlan = new Map()
  for (const row of data.records) {
    const match = /^plan-note-([^:]+)(:(?:task|prepare|day):\d*)$/u.exec(row.id)
    if (!match) continue
    try {
      const plan = decodeURIComponent(match[1])
      if (!byPlan.has(plan)) byPlan.set(plan, [])
      byPlan.get(plan).push({ row, suffix: match[2] })
    } catch {
      /* Historical IDs without an archive link remain standalone. */
    }
  }
  for (const plan of data.plans) {
    let to = choose('freetime', plan.id)
    const notes = byPlan.get(plan.id) || []
    const noteId = (suffix) => 'plan-note-' + encodeURIComponent(to) + suffix
    // An absent, previously shared archive note might still exist in the cloud.
    // Keep its Git identity out of the restore while preserving the plan-to-note link.
    if (
      existing.freetime.has(to) &&
      notes.some(
        ({ suffix }) =>
          existing.entries.get(noteId(suffix))?.visibility !== 'private',
      )
    ) {
      do {
        to = fresh()
      } while (existing.freetime.has(to) || reserved.freetime.has(to))
      reserve('freetime', plan.id, to)
    }
    for (const { row, suffix } of notes)
      choose('entries', row.id, noteId(suffix))
  }
  for (const row of data.records) {
    const id = ids.entries.get(row.id) || choose('entries', row.id)
    result.records.push(createEntry({ ...row, id, visibility: 'private' }))
  }
  const source = (row) =>
    ids.entries.get(row.sourceEntryId) || row.sourceEntryId
  for (const plan of data.plans) {
    const id = ids.freetime.get(plan.id)
    function moveStep(row) {
      const key =
        encodeURIComponent(id) + ':' + row.stage + ':' + (row.year ?? '')
      return {
        ...row,
        id: key,
        key,
        planId: id,
        sourceEntryId: source(row),
        visibility: 'private',
      }
    }
    result.plans.push(
      normalPlan({
        ...plan,
        id,
        sourceEntryId: source(plan),
        visibility: 'private',
        completions: plan.completions.map(moveStep),
        reopened: plan.reopened.map(moveStep),
      }),
    )
  }
  for (const idea of data.breakfast?.ideas || []) {
    const id = choose('breakfast', idea.id)
    result.breakfast.push({ ...idea, id, visibility: 'private' })
  }
  for (const [kind, mapping] of Object.entries(ids))
    for (const [from, to] of mapping) result.receipts.push({ kind, from, to })
  return result
}
