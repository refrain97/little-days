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
export function readProfile() {
  try {
    const saved = JSON.parse(localStorage.getItem(key))
    return saved ? profileFrom(saved.nickname, saved.initial) : null
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

export function authorBadge(item) {
  if (!item || item.isSample || item.visibility !== 'shared') return ''
  const author = item.author || readProfile()
  const name = author?.nickname || '本机记录'
  const initial =
    characters(String(author?.initial || author?.nickname || '我'))[0] || '我'
  const escape = (s) =>
    String(s).replace(
      /[&<>"']/g,
      (ch) =>
        ({
          '&': '&amp;',
          '<': '&lt;',
          '>': '&gt;',
          '"': '&quot;',
          "'": '&#39;',
        })[ch],
    )
  return `<span class="author-mark" title="${escape(name)}" aria-label="记录者 ${escape(name)}">${escape(initial)}</span>`
}
