import {
  announce,
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

export async function addBreakfast(title, kind) {
  title = String(title || '').trim()
  if (!title || title.length > 80 || !Object.hasOwn(breakfastKinds, kind))
    throw new Error('写下早餐名字，再选一个做法吧。')
  const db = await journalDatabase()
  const idea = {
    id:
      'idea-' +
      (globalThis.crypto?.randomUUID?.() ||
        Date.now().toString(36) + Math.random().toString(36).slice(2)),
    title,
    kind,
    visibility: 'shared',
    ...localAuthor(),
    createdAt: new Date().toISOString(),
  }
  const tx = db.transaction('settings', 'readwrite')
  tx.objectStore('settings').add(idea, breakfastIdeaKey(idea.id))
  await transactionDone(tx)
  announce('local-only')
  return idea
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
