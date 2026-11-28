// Stable keys are also used by backups. The artwork stays in the application shell.
export const animals = {
  cat: '小猫',
  dog: '小狗',
  bear: '小熊',
  rabbit: '小兔',
  fox: '小狐狸',
}
export const stamps = {
  taste: '我也想吃！',
  aroma: '看起来好香',
  chef: '厨神附体',
  visit: '下次带我去',
}
const faces = {
  cat: [
    '#f3c48b',
    '<path d="M7 20 6 7q1-3 4-1l8 6q5-2 9 0l7-6q3-2 3 1l-1 14q2 13-15 14Q4 35 7 20Z"/><path class="fur" d="m11 10 4 4-5 2zm21 0-4 4 5 2z"/><path d="m18 13 1 4m4-4v3" fill="none"/>',
  ],
  dog: [
    '#edc09b',
    '<path d="M8 19q0-12 14-12t14 13v3q0 12-14 12T8 23Z"/><path fill="#bc876d" d="M12 9q-6-3-9 8-3 8 2 9 5 0 8-14Zm20 0q6-3 9 8 3 8-2 9-5 0-8-14Z"/>',
  ],
  bear: [
    '#c99673',
    '<circle cx="9" cy="10" r="6.1"/><circle cx="34" cy="10" r="6.1"/><path d="M6 22Q6 8 21 8t16 14q0 13-16 13T6 22Z"/><ellipse cx="21.5" cy="26" rx="7" ry="5" fill="#f4ddc4" stroke="none"/>',
  ],
  rabbit: [
    '#f7e4db',
    '<path d="M11 17Q5 1 10 1q5-1 9 12h4Q25 0 30 1q6 1 0 16 6 4 5 10-1 9-14 9T7 27q-1-6 4-10Z"/><path d="m11 5 4 8m13-8-2 8" stroke="#e5a5a0" stroke-width="2.8"/>',
  ],
  fox: [
    '#e6a16c',
    '<path d="M6 18 5 6q0-3 4-1l9 7q4-2 8 0l9-7q3-1 3 2l-3 13 3 4q-4 7-16 12Q8 32 4 25Z"/><path fill="#fff0d7" stroke="none" d="M6 23q10 0 16 8 6-8 14-8-3 7-14 11Q11 31 6 23Z"/>',
  ],
}
export const esc = (s) =>
  String(s ?? '').replace(
    /[&<>"']/g,
    (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[
        c
      ],
  )
const owns = (obj, key) => typeof key === 'string' && Object.hasOwn(obj, key)
export function animalIcon(animal, size = 30) {
  const [color, body] = faces[owns(faces, animal) ? animal : 'cat']
  return `<svg class="animal-icon" width="${size}" height="${size}" viewBox="0 0 44 40" aria-hidden="true"><g stroke="#6d4b3b" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round" fill="${color}">${body}<g fill="#704f40" stroke="none"><ellipse cx="15.8" cy="21.8" rx="1.55" ry="1.85"/><ellipse cx="27.2" cy="21.8" rx="1.55" ry="1.85"/><path d="M19.5 25q2-1.2 4 0l-2 2.2Z"/></g><path d="M21.5 27q-1.4 2.3-3 1m3-1q1.4 2.3 3 1" fill="none" stroke-width="1.15"/><g fill="#df9b8f" stroke="none" opacity=".8"><ellipse cx="11" cy="25" rx="2.8" ry="1.35"/><ellipse cx="32" cy="25" rx="2.8" ry="1.35"/></g></g></svg>`
}

export function cleanStickerAuthor(value) {
  if (
    !value ||
    typeof value.id !== 'string' ||
    !/^[a-z\d_-]{1,80}$/i.test(value.id) ||
    !owns(animals, value.animal)
  )
    return null
  return {
    id: value.id,
    animal: value.animal,
    name: String(value.name || '手账主人').slice(0, 48),
  }
}

export function cleanReactions(value) {
  if (!Array.isArray(value)) return []
  const byActor = new Map()
  for (const row of value) {
    const actor = cleanStickerAuthor(row?.actor)
    if (
      !actor ||
      (row.stamp !== null && !owns(stamps, row.stamp)) ||
      typeof row.at !== 'string' ||
      !Number.isFinite(Date.parse(row.at))
    )
      continue
    if (!byActor.has(actor.id) || byActor.get(actor.id).at <= row.at)
      byActor.set(actor.id, { actor, stamp: row.stamp, at: row.at })
  }
  return Array.from(byActor.values())
}

export function legacyAnimal(name) {
  let hash = 0
  for (const ch of String(name)) hash = (hash * 31 + ch.codePointAt(0)) >>> 0
  return Object.keys(animals)[hash % Object.keys(animals).length]
}

export function stampButtons(entry, actor, icon) {
  if (entry?.visibility !== 'shared') return ''
  const active = cleanReactions(entry.reactions).filter((row) => row.stamp)
  const mine = active.find((row) => row.actor.id === actor.id)?.stamp
  const stamp =
    mine || (['美食', '饮品'].includes(entry.category) ? 'taste' : 'visit')
  const others = active.filter((row) => row.actor.id !== actor.id)
  const label = others
    .map((row) => row.actor.name + '盖了「' + stamps[row.stamp] + '」')
    .join('，')
  return `<div class="card-stamps"><button class="quick-stamp" type="button" data-act-stamp="${stamp}" data-note="${esc(entry.id)}" aria-pressed="${Boolean(mine)}" aria-label="${esc(stamps[stamp])}">${icon(mine ? 'heart' : 'sparkle', 14)}<span>${stamps[stamp]}</span></button><button class="choose-stamp" type="button" data-action="choose-stamp" data-value="${esc(entry.id)}" aria-label="选择回应贴纸" aria-haspopup="dialog">${others.length ? `<span title="${esc(label)}">${animalIcon(others[0].actor.animal, 17)} ${others.length}</span>` : '···'}</button></div>`
}
