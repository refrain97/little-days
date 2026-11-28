import {
  animalIcon,
  animals,
  cleanStickerAuthor,
  esc,
  legacyAnimal,
} from './stickers.js'

const key = 'little.days.cloud.profile'

const characters = (text) =>
  typeof Intl.Segmenter === 'function'
    ? Array.from(
        new Intl.Segmenter('zh', { granularity: 'grapheme' }).segment(text),
        (part) => part.segment,
      )
    : Array.from(text)

export function profileFrom(nickname, initial) {
  const name = String(nickname || '').trim()
  if (!name || characters(name).length > 24)
    throw new Error('请填写 1 至 24 个字的昵称。')
  return {
    nickname: name,
    initial: characters(String(initial || '').trim() || name)[0],
  }
}
let profileText, cachedProfile
export function readProfile() {
  try {
    const raw = localStorage.getItem(key)
    if (raw !== profileText) {
      const saved = JSON.parse(raw)
      cachedProfile = saved ? profileFrom(saved.nickname, saved.initial) : null
      profileText = raw
    }
    return cachedProfile
  } catch {
    return null
  }
}
export function saveProfile(profile) {
  if (profile)
    localStorage.setItem(
      key,
      JSON.stringify(profileFrom(profile.nickname, profile.initial)),
    )
  else localStorage.removeItem(key)
}

const stickerKey = 'little.days.sticker-person'
let sessionActor, actorText
export function stickerActor() {
  try {
    const raw = localStorage.getItem(stickerKey)
    if (raw !== actorText) {
      sessionActor = cleanStickerAuthor(JSON.parse(raw))
      actorText = raw
    }
  } catch {}
  if (!sessionActor) {
    const id =
      globalThis.crypto?.randomUUID?.() ||
      Math.random().toString(36).slice(2) + Date.now().toString(36)
    sessionActor = { id, animal: 'cat', name: '手账主人' }
    try {
      localStorage.setItem(stickerKey, JSON.stringify(sessionActor))
    } catch {}
  }
  return { ...sessionActor, name: readProfile()?.nickname || '手账主人' }
}

export function chooseAnimal(animal) {
  if (!Object.hasOwn(animals, animal)) throw new Error('请选择列表中的动物。')
  const actor = { ...stickerActor(), animal }
  localStorage.setItem(stickerKey, JSON.stringify(actor))
  sessionActor = actor
}

export function authorBadge(item) {
  if (!item || item.visibility !== 'shared') return ''
  const author = cleanStickerAuthor(item.stickerAuthor)
  const current = stickerActor()
  const own = author?.id === current.id
  const name = own
    ? current.name
    : author?.name ||
      item.author?.nickname ||
      (item.isSample ? '示例手记' : '记录者')
  const animal = own
    ? current.animal
    : author?.animal || legacyAnimal(item.author?.nickname || item.id || name)
  return `<span class="author-mark" data-animal="${animal}" title="${esc(name)} · ${animals[animal]}" aria-label="记录者 ${esc(name)}，${animals[animal]}">${animalIcon(animal, 22)}</span>`
}
