import {
  announce,
  announceMutation,
  markOutbox,
  setPrivacyMarker,
  journalDatabase,
  localAuthor,
  requestDone,
  transactionDone,
} from './storage.js'
import {
  breakfastChoiceKey,
  breakfastIdeaKey,
  breakfastIdeaRange,
  breakfastKinds,
} from './breakfast-model.js'

export async function readBreakfast(transaction) {
  const tx = transaction || (await journalDatabase()).transaction('settings')
  const table = tx.objectStore('settings')
  const [ideas, choice] = await Promise.all([
    requestDone(table.getAll(breakfastIdeaRange())),
    requestDone(table.get(breakfastChoiceKey)),
  ])
  return {
    ideas: ideas.sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    choice: choice || null,
  }
}

function breakfastFields(title, kind, visibility) {
  title = String(title || '').trim()
  if (!title || title.length > 80 || !Object.hasOwn(breakfastKinds, kind))
    throw new Error('写下早餐名字，再选一个做法吧。')
  if (!['shared', 'private'].includes(visibility))
    throw new Error('请选择可见范围。')
  return { title, kind, visibility }
}

export async function addBreakfast(title, kind, visibility = 'shared') {
  const fields = breakfastFields(title, kind, visibility)
  const db = await journalDatabase()
  const idea = {
    id:
      'idea-' +
      (globalThis.crypto?.randomUUID?.() ||
        Date.now().toString(36) + Math.random().toString(36).slice(2)),
    ...fields,
    ...localAuthor(),
    createdAt: new Date().toISOString(),
  }
  const tx = db.transaction('settings', 'readwrite')
  tx.objectStore('settings').add(idea, breakfastIdeaKey(idea.id))
  if (visibility === 'shared') markOutbox(tx)
  else setPrivacyMarker(tx, 'breakfast', idea.id, true)
  await transactionDone(tx)
  announceMutation(tx)
  return idea
}

async function changeBreakfast(id, edit) {
  const db = await journalDatabase()
  const tx = db.transaction('settings', 'readwrite'),
    table = tx.objectStore('settings')
  const key = breakfastIdeaKey(id),
    req = table.get(key)
  let saved, issue
  req.onsuccess = () => {
    const previous = req.result
    if (!previous) return
    try {
      saved = edit ? edit(previous) : null
      if (saved) table.put(saved, key)
      else table.delete(key)
      if (saved?.visibility === 'shared' || previous.visibility === 'shared')
        markOutbox(tx)
      setPrivacyMarker(
        tx,
        'breakfast',
        id,
        (saved || previous).visibility === 'private',
      )
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
  if (saved === undefined) throw new Error('这个早餐点子已被移除。')
  announceMutation(tx)
  return saved
}

export function updateBreakfast(id, title, kind, visibility, original) {
  return changeBreakfast(id, (previous) => {
    const fields = breakfastFields(
      title,
      kind,
      visibility ?? previous.visibility,
    )
    const changed = Object.entries(fields).filter(
      ([k, v]) => !original || original[k] !== v,
    )
    return {
      ...previous,
      ...Object.fromEntries(changed),
      ...localAuthor(previous),
    }
  })
}

export function removeBreakfast(id) {
  return changeBreakfast(id)
}

export async function chooseBreakfast(id, day) {
  const choice = { id, day }
  const db = await journalDatabase()
  const tx = db.transaction('settings', 'readwrite')
  tx.objectStore('settings').put(choice, breakfastChoiceKey)
  await transactionDone(tx)
  announce('local-only')
  return choice
}
