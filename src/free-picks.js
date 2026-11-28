import {
  INSPIRATIONS,
  inferDining,
  isLikedEntry,
  recommendVenues,
  recommendationQuote,
  venueKey,
} from './journal.js'

const negative =
  /不(?:太|怎么|是很|那么)?(?:开心|高兴|愉快|舒服|喜欢|好玩|好吃|好喝|满意|合口味)|不想再|再也不|不值得|不推荐|没(?:有)?意思|难吃|难喝|难受|难过|很难熬|糟糕|伤心|痛苦|悲伤|崩溃|失望|踩雷|焦虑|害怕|生病|住院|摔伤|被骗|被偷|吵架|去世|葬礼|噩耗|后悔|讨厌|无聊|差评|倒霉|失恋|受伤|摔倒|发烧|丢(?:了|失)(?:钱包|手机|钥匙)|压力很大/u
const positive =
  /喜欢|开心|快乐|惬意|美好|好玩|有趣|治愈|舒服|放松|享受|很棒|太棒|惊喜|值得再|还想再|好吃|好喝|美味/u
const transaction =
  /付款|支付|账单|报销|收据|下单|缴费|还款|买了|消费|花了.{0,9}(?:元|块|钱)/u
const recreation =
  /散步|漫步|远足|野餐|爬山|徒步|骑行|看展|逛展|看书|阅读|画画|绘画|摄影|拍照|电影|演出|唱歌|跳舞|弹琴|手作|烘焙|品尝|尝了|喝了|吃了/u
const atHome = /在家(?:里|中)?|家里|家中|客厅|厨房|自家阳台|宅家/u
const outside =
  /户外|郊外|出游|公园|河畔|海边|山顶|看展|逛展|电影院|图书馆|书店|漫步|散步|徒步|骑行|露营|野餐/u

const sameTitle = (value) =>
  String(value || '')
    .normalize('NFKC')
    .trim()
    .toLowerCase()
const datePart = (value) => String(value).padStart(2, '0')
function localDay(date) {
  return [
    date.getFullYear(),
    datePart(date.getMonth() + 1),
    datePart(date.getDate()),
  ].join('-')
}

const isDining = (entry) => ['美食', '饮品'].includes(entry.category)
const contentOf = (entry) =>
  [entry.title, entry.text, entry.notes, entry.feeling]
    .filter(Boolean)
    .join('。')
const homeIdeas = new Set(INSPIRATIONS.map((idea) => idea.id))

export function settingForMemory(entry = {}) {
  if (homeIdeas.has(entry.id)) return 'home'
  const content = contentOf(entry)
  if (isDining(entry)) {
    if (Object.hasOwn(entry, 'diningSource')) return entry.diningSource || 'any'
    return entry.venueName ? 'out' : inferDining(content).diningSource || 'any'
  }
  if (['home', 'out'].includes(entry.setting)) return entry.setting
  const home = atHome.test(content)
  const out = outside.test(content)
  return home === out ? 'any' : home ? 'home' : 'out'
}

function isPositive(entry, dining, content) {
  if (entry.rating > 0 && entry.rating < 4) return false
  if (['一般', '不合口味'].includes(entry.taste) || negative.test(content))
    return false
  if (!dining && transaction.test(content) && !recreation.test(content))
    return false
  return Boolean(
    isLikedEntry(entry) || entry.favorite || positive.test(content),
  )
}

const isSample = (item) =>
  item.isSample ?? String(item.id || '').startsWith('sample-')
const normalTask = (row) =>
  ['wish', 'chore'].includes(row.kind) && (!row.stage || row.stage === 'task')

function planSuggestion(row, source) {
  const wish = row.kind === 'wish'
  const context =
    row.setting === 'home' ? '居家' : row.setting === 'out' ? '外出' : ''
  return {
    author: row.author,
    stickerAuthor: row.stickerAuthor,
    visibility: row.visibility,
    key: 'plan/' + (row.key || row.planId),
    title: row.title,
    detail:
      recommendationQuote(source) ||
      (source
        ? '来自手记「' + source.title + '」。'
        : row.date
          ? '清单里安排在 ' + row.date + '。'
          : wish
            ? '留给有空时做的小愿望。'
            : '清单里还有这件事等着做。'),
    label: [context, wish ? '小愿望' : '待办杂事'].filter(Boolean).join(' · '),
    image: source?.image || '',
    action: 'view-plan',
    value: row.planId,
  }
}

function activityKey(entry) {
  if (entry.venueName && isDining(entry) && settingForMemory(entry) === 'out')
    return 'venue/' + venueKey(entry.venueName)
  return 'title/' + sameTitle(entry.title)
}

function personalMemories(
  entries,
  { mood, excludedIds, excludedTitles, excludedActivities, profiles },
) {
  const placesByEntry = new Map()
  for (const place of recommendVenues(entries, profiles)) {
    for (const entry of place.entries) placesByEntry.set(entry.id, place)
  }
  const memories = []
  for (const entry of entries) {
    if (
      !entry.id ||
      !entry.title ||
      excludedIds.has(entry.id) ||
      excludedTitles.has(sameTitle(entry.title))
    )
      continue
    const identity = activityKey(entry)
    if (excludedActivities.has(identity)) continue
    const dining = isDining(entry)
    const content = contentOf(entry)
    if (!isPositive(entry, dining, content)) continue
    const setting = settingForMemory(entry)
    if (mood !== 'any' && mood !== setting) continue

    const out = dining && setting === 'out' && entry.venueName
    const place = out && placesByEntry.get(entry.id)?.name
    if (out && !place && entry.visibility !== 'private') continue
    const homeDish = dining && setting === 'home'
    let label = '手记回顾'
    let title = entry.title
    let fallback = '翻开这条手记，重温当时的片刻。'
    if (place) {
      label = '回访店铺'
      title = '再去' + place
      fallback = '手记里记下了「' + entry.title + '」。'
    } else if (homeDish) {
      label = '自制好味道'
      fallback = '再做一次手记里的「' + entry.title + '」。'
    } else if (entry.category === '灵感') {
      label = '手记里的灵感'
    }
    const detail = recommendationQuote(entry) || fallback
    if (excludedTitles.has(sameTitle(title))) continue
    memories.push({
      author: entry.author,
      stickerAuthor: entry.stickerAuthor,
      visibility: entry.visibility,
      isSample: isSample(entry),
      identity,
      key: place ? 'venue/' + venueKey(place) : 'entry/' + entry.id,
      title,
      detail,
      label: isSample(entry) ? '示例 · ' + label : label,
      image: entry.image || '',
      action: place ? 'open-venue' : 'detail',
      value: place ? venueKey(place) : entry.id,
      priority: (entry.favorite ? 8 : 0) + (Number(entry.rating) || 0),
      date: entry.createdAt,
    })
  }
  memories.sort(
    (a, b) =>
      b.priority - a.priority ||
      b.date.localeCompare(a.date) ||
      a.key.localeCompare(b.key),
  )
  const seen = new Set()
  return memories.flatMap(({ priority, date, identity, ...suggestion }) => {
    if (seen.has(identity)) return []
    seen.add(identity)
    return [suggestion]
  })
}

// Enumerate pairs from two different pools without materializing their cross-product.
function mixedPair(a, b, offset) {
  const index = offset % a.length
  const otherIndex = (index + Math.floor(offset / a.length)) % b.length
  return {
    suggestions: [a[index], b[otherIndex]],
    canShuffle: a.length > 1 || b.length > 1,
  }
}

export function pickFreeTime({
  entries = [],
  profiles = [],
  open = [],
  archive = [],
  mood = 'any',
  offset = 0,
  now = new Date(),
} = {}) {
  const today = localDay(now)
  const cutoff = new Date(now)
  cutoff.setDate(cutoff.getDate() - 6)
  const firstDay = localDay(cutoff)
  const excludedIds = new Set()
  const excludedTitles = new Set()
  const excludedActivities = new Set()
  const byId = new Map(entries.map((entry) => [entry.id, entry]))
  function excludeEntry(id) {
    if (!id) return
    excludedIds.add(id)
    if (byId.has(id)) excludedActivities.add(activityKey(byId.get(id)))
  }
  function excludeSource(row) {
    excludeEntry(row.sourceEntryId)
    if (!byId.has(row.sourceEntryId) && row.title)
      excludedTitles.add(sameTitle(row.title))
  }
  for (const row of archive) {
    if (!row.doneAt) continue
    const finished = localDay(new Date(row.doneAt))
    if (finished < firstDay || finished > today) continue
    if (row.key) excludeEntry('plan-note-' + row.key)
    if (normalTask(row)) excludeSource(row)
  }

  const pending = open.filter(
    (row) =>
      normalTask(row) &&
      row.planId &&
      row.title &&
      !row.doneAt &&
      !row.archived,
  )
  // Even an activity scheduled for a later day already has a place on the user's calendar.
  for (const row of pending) excludeSource(row)
  const usedTasks = new Set()
  const tasks = pending.filter((row) => {
    if (
      (row.date && row.date > today) ||
      (mood !== 'any' && row.setting !== mood)
    )
      return false
    const source = byId.get(row.sourceEntryId)
    const identity = source
      ? activityKey(source)
      : 'title/' + sameTitle(row.title)
    if (usedTasks.has(identity)) return false
    usedTasks.add(identity)
    return true
  })
  const suggest = (row) =>
    planSuggestion(
      row,
      byId.get(row.sourceEntryId) ||
        INSPIRATIONS.find((idea) => idea.id === row.sourceEntryId),
    )
  const wishes = tasks.filter((row) => row.kind === 'wish').map(suggest)
  const chores = tasks.filter((row) => row.kind === 'chore').map(suggest)
  // Once there is personal material, do not fill an empty scene or a skipped negative memory with examples.
  const personal =
    entries.some((entry) => !isSample(entry)) || open.length || archive.length
  const eligible = entries
    .filter((entry) => !personal || !isSample(entry))
    .map((entry) => ({ ...entry, createdAt: String(entry.createdAt || '') }))
  const memories = personalMemories(eligible, {
    profiles,
    mood,
    excludedIds,
    excludedTitles,
    excludedActivities,
  })
  const turn = Number.isFinite(Number(offset))
    ? Math.max(0, Math.trunc(Number(offset)))
    : 0
  const plans = [...wishes, ...chores]
  if (plans.length && memories.length) return mixedPair(plans, memories, turn)
  if (wishes.length && chores.length) return mixedPair(wishes, chores, turn)
  const pool = plans.length ? plans : memories
  if (pool.length <= 2) return { suggestions: pool, canShuffle: false }
  const first = turn % pool.length
  return {
    suggestions: [pool[first], pool[(first + 1) % pool.length]],
    canShuffle: true,
  }
}
