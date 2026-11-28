export const breakfastKinds = {
  quick: { label: '5分钟快手', icon: 'bolt' },
  slow: { label: '慢慢做一顿', icon: 'chef' },
  buy: { label: '出门顺路买', icon: 'store' },
}

export function breakfastPeriod(now = new Date()) {
  return now.getHours() * 60 + now.getMinutes() < 630 ? 'breakfast' : 'main'
}

export function breakfastKind(entry) {
  if (Object.hasOwn(breakfastKinds, entry.breakfastKind))
    return entry.breakfastKind
  if (entry.diningSource === 'out') return 'buy'
  const content = [entry.title, entry.text, ...(entry.steps || [])].join(' ')
  const minutes = content.match(/(\d+)\s*(?:分钟|分鍾)/u)
  if (minutes) return Number(minutes[1]) <= 5 ? 'quick' : 'slow'
  if (/慢慢|烤箱|熬粥|小火炖|半小时|蒸熟/u.test(content)) return 'slow'
  return /吐司|土司|香蕉|酸奶|燕麦片|隔夜燕麦|饭团|快手|冲泡/u.test(content)
    ? 'quick'
    : 'slow'
}

export function breakfastFields(fields) {
  const tagged =
    fields.isBreakfast ??
    (fields.id === 'sample-breakfast' && fields.isSample !== false)
  if (tagged === true)
    return { isBreakfast: true, breakfastKind: breakfastKind(fields) }
  // Keep an explicitly removed tag on the original sample across reloads.
  return fields.id === 'sample-breakfast' ? { isBreakfast: false } : {}
}

const ideaPrefix = 'breakfast-idea:'
const choiceKey = 'breakfast-choice'
export const breakfastIdeaKey = (id) => ideaPrefix + id
export const breakfastChoiceKey = choiceKey
export const breakfastIdeaRange = () =>
  IDBKeyRange.bound(ideaPrefix, ideaPrefix + '\uffff')

export function restoreBreakfast(table, snapshot) {
  table.delete(breakfastIdeaRange())
  table.delete(choiceKey)
  for (const idea of snapshot?.ideas || [])
    table.put(idea, breakfastIdeaKey(idea.id))
  if (snapshot?.choice) table.put(snapshot.choice, choiceKey)
}
