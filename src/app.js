import { fitDialogViewport, usesMobileShell } from './dialog-viewport.js'
import {
  CATEGORIES,
  INSPIRATIONS as recipes,
  recommendEntries,
  groupVenues,
  isLikedEntry,
  recommendVenues,
  venueKey,
  recommendationQuote,
} from './journal.js'
import {
  readRecords,
  readMealHistory,
  rememberMealPick,
  withMealPick,
  putRecord,
  removeRecord,
  toggleRecordFavorite,
  onExternalChange,
  observeLocalMedia,
  mediaAttributes,
  readRecordWithMedia,
  readPlaceProfiles,
  putPlaceProfile,
  deletePlaceProfile,
} from './storage.js'
import { photoAttributes, observeGallery } from './gallery.js'
import { registerOfflineShell } from './offline-shell.js'
import { bundledPhotoPath } from './paths.js'
import { authorBadge } from './cloud-profile.js'
import { createCloudAdapter, onCloudLocalChange } from './cloud-local.js'
import { createGitHubSync } from './github-sync.js'
import {
  bindCloudControls,
  cloudControls,
  paintSpaceStatus,
} from './cloud-controls.js'
import {
  backupControls,
  bindBackupControls,
  refreshPrivateBackupStatus,
} from './backup-ui.js'
import { privateBackupStatus } from './backup.js'
import { icon, flower, flourish, kitchenSketch } from './icons.js'
import { openCapture, attitudeLabel } from './capture.js'
import {
  readPlans,
  putPlan,
  deletePlan,
  finishPlan,
  restorePlan,
  derivePlanLists,
  onPlansChange,
} from './plans.js'
import { pickFreeTime, settingForMemory } from './free-picks.js'
import { renderFreeTime, openPlanEditor } from './free-time.js'
import {
  renderVenues,
  renderVenueCards,
  renderVenueResults,
  venuePhoto,
} from './venues.js'

const recipePhotos = {
  'idea-tomato-noodles': '/images/idea-tomato-noodles.webp',
  'idea-honey-toast': '/images/breakfast.webp',
  'idea-lemon-noodles': '/images/idea-lemon-noodles.webp',
}
const INSPIRATIONS = recipes.map((recipe) => ({
  ...recipe,
  image: recipePhotos[recipe.id],
}))
const sections = [
  ['home', 'book', '手记'],
  ['kitchen', 'chef', '吃点啥'],
  ['free', 'sprout', '有空'],
]
const categories = {
  美食: ['food', 'food'],
  饮品: ['cup', 'drink'],
  灵感: ['bulb', 'idea'],
  回忆: ['memory', 'memory'],
}
const html = (value) =>
  String(value ?? '').replace(
    /[&<>"']/g,
    (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[
        c
      ],
  )
const action = (name, value = '') =>
  'data-action="' + name + '" data-value="' + html(value) + '"'
const getPreference = (key, fallback) => {
  try {
    return JSON.parse(localStorage.getItem('little.days.' + key)) ?? fallback
  } catch {
    return fallback
  }
}
function setPreference(key, value) {
  try {
    localStorage.setItem('little.days.' + key, JSON.stringify(value))
  } catch {}
}
function localDate(input) {
  return new Date(input).toLocaleDateString('zh-CN', {
    month: 'long',
    day: 'numeric',
  })
}
function time(input) {
  return new Date(input).toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
}
function dayKey(date) {
  const d = new Date(date)
  return [
    d.getFullYear(),
    String(d.getMonth() + 1).padStart(2, '0'),
    String(d.getDate()).padStart(2, '0'),
  ].join('-')
}
function relativeDate(input) {
  const now = new Date()
  if (dayKey(input) === dayKey(now)) return '今天'
  now.setDate(now.getDate() - 1)
  return dayKey(input) === dayKey(now) ? '昨天' : localDate(input)
}
function mealNow() {
  const hour = new Date().getHours()
  return hour >= 4 && hour < 11 ? '早餐' : '晚餐'
}
let meal = mealNow()
let mealHistory = []
let entries = [],
  section = 'home',
  category = '全部',
  query = '',
  findOpen = false,
  suggestionIndex = 0
let plans = [],
  placeProfiles = []
let storageError = ''
let freeMood = 'any',
  freeOffset = 0
let preferredDining = getPreference('recommendDining', '')
let diningFilter = 'all',
  selectedVenueKey = '',
  venueQuery = '',
  venueFilter = 'all'
let layout = getPreference('layout', 'grid'),
  allowPicks = getPreference('allowPicks', true),
  showSamples = getPreference('samples', true)
let activeDetail = '',
  previousFocus,
  toastTimer
const app = document.querySelector('#app'),
  overlay = document.querySelector('#overlay')
let lastSyncNotice = ''
const cloud = createGitHubSync({
  adapter: createCloudAdapter(),
  onStatus(status) {
    paintSpaceStatus(overlay, status)
    updateSyncNotice(status)
    const issue = status.needsToken
      ? 'token'
      : status.pending && ['error', 'offline'].includes(status.phase)
        ? status.phase
        : ''
    if (issue && issue !== lastSyncNotice) {
      lastSyncNotice = issue
      toast(
        issue === 'token'
          ? 'GitHub 授权失效，请更新 Token。手记已留在本机。'
          : '暂时无法同步，改动已留在本机。',
      )
    } else if (!status.connected || (status.phase === 'idle' && !issue))
      lastSyncNotice = ''
    if (status.connected) app.querySelector('.space-invite')?.remove()
  },
})
const pool = () => entries.filter((e) => showSamples || !e.isSample)
const catIcon = (cat) => categories[cat]?.[0] || 'book'
const catClass = (cat) => categories[cat]?.[1] || 'idea'
const catTag = (cat) =>
  '<span class="cat-tag ' +
  catClass(cat) +
  '">' +
  icon(catIcon(cat), 13) +
  html(cat) +
  '</span>'
const img = (src, alt, options) =>
  `<img ${photoAttributes(src, options)} alt="${html(alt)}" draggable="false">`
function toast(text) {
  const el = document.querySelector('#notice')
  el.textContent = text
  el.classList.add('visible')
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => el.classList.remove('visible'), 2300)
}
function updateSyncNotice(status) {
  const container = app.querySelector('[data-sync-notice]')
  if (!container) return
  const needsToken = status.connected && status.needsToken
  const failed =
    status.connected &&
    status.pending > 0 &&
    ['error', 'offline'].includes(status.phase)
  container.hidden = !needsToken && !failed
  if (container.hidden) return
  const message = needsToken
    ? 'GitHub 授权已失效。更新 Token 后，会自动补传本机的共享改动。'
    : status.phase === 'offline'
      ? '共享改动已存进本机队列，联网后会自动补传。'
      : '共享改动已存进本机队列。可到设置查看同步情况。'
  const actionButton = container.querySelector('button')
  container.querySelector('span').textContent = message
  actionButton.dataset.action = needsToken ? 'renew-space' : 'settings'
  actionButton.textContent = needsToken ? '更新 Token' : '查看同步'
}

function updateBackupReminder() {
  const reminder = app.querySelector('[data-private-backup-reminder]')
  if (reminder) reminder.hidden = !privateBackupStatus(entries, plans).due
  refreshPrivateBackupStatus(overlay, entries, plans)
}
function listSuggestions() {
  const ranked = recommendEntries(pool(), { limit: 12, meal })
  const own = ranked.filter((entry) => !entry.isSample)
  const known = own.length ? own : ranked
  const ideas = INSPIRATIONS.filter((idea) => idea.meal === meal)
  const choices = [
    known[0],
    ideas[0],
    ...known.slice(1),
    ...ideas.slice(1),
  ].filter(Boolean)
  const slot = dayKey(new Date()) + meal
  const recent = mealHistory
  const existing = recent.find((entry) => entry.slot === slot)
  let first = choices.find((entry) => entry.id === existing?.id)
  if (!first) {
    const previousIds = new Set(recent.slice(-2).map((entry) => entry.id))
    const turn = existing?.turn ?? (recent.at(-1)?.turn || 0) + 1
    const freshTurn = turn % 3 === 0
    const primary = freshTurn || !known.length ? ideas : known
    first =
      primary.find((entry) => !previousIds.has(entry.id)) ||
      primary[0] ||
      choices[0]
    if (first && first.visibility !== 'private') {
      const pick = { slot, id: first.id, turn }
      mealHistory = withMealPick(recent, pick)
      // Remembering the rotation is optional; the current pick is already visible.
      rememberMealPick(pick).catch(() => {})
    }
  }
  return first
    ? [first, ...choices.filter((entry) => entry.id !== first.id)]
    : []
}
function diningMode() {
  if (preferredDining === 'out' || preferredDining === 'home')
    return preferredDining
  const places = recommendVenues(pool(), placeProfiles)
  if (!places.length) return 'home'
  const personalHome = recommendEntries(
    pool().filter((entry) => !entry.isSample),
    { limit: 1 },
  )
  const personalOut = places.find((place) =>
    place.entries.some((entry) => !entry.isSample),
  )
  if (!personalHome.length) return 'out'
  return personalOut && personalOut.lastVisit > personalHome[0].createdAt
    ? 'out'
    : 'home'
}
function venues() {
  return groupVenues(pool(), placeProfiles)
}
function canonicalPlaceKey(name) {
  const key = venueKey(name)
  const profile = placeProfiles.find((p) =>
    [p.name, ...p.aliases].some((n) => venueKey(n) === key),
  )
  return profile ? venueKey(profile.name) : key
}
function startEntry(options = {}) {
  openCapture({
    onSave: (entry) =>
      saveFromCapture(entry, options.record?.id ? options.record : null),
    venues: venues().map((place) => place.name),
    ...options,
  })
}
function sourceLabel(entry, link = false) {
  if (!['美食', '饮品'].includes(entry.category) || !entry.diningSource)
    return ''
  const out = entry.diningSource === 'out'
  const name = out ? entry.venueName || '出去吃' : '自己做'
  const content =
    icon(out ? 'store' : 'chef', 13) + '<span>' + html(name) + '</span>'
  const key = canonicalPlaceKey(name)
  return link &&
    out &&
    entry.venueName &&
    venues().some((place) => place.key === key)
    ? `<button class="origin-badge origin-link" ${action('open-venue', key)}>${content}${icon('next', 12)}</button>`
    : `<span class="origin-badge">${content}</span>`
}
function navMarkup(mobile = false) {
  const current = section === 'venues' ? 'kitchen' : section
  return sections
    .map(
      ([id, symbol, label]) =>
        `<button ${action('nav', id)} class="nav-item${current === id ? ' active' : ''}" ${current === id ? 'aria-current="page"' : ''}>${icon(symbol, mobile ? 21 : 20)}<span>${label}</span></button>`,
    )
    .join('')
}
function sidebar() {
  return (
    '<aside class="sidebar"><button class="brand" ' +
    action('nav', 'home') +
    ' aria-label="小日子首页">' +
    flower() +
    '<span><strong>小日子</strong><em>Little Days</em></span></button><div class="sidebar-body"><div class="side-label">我的空间</div><nav aria-label="主导航">' +
    navMarkup() +
    '</nav><div class="side-rule"></div><div class="side-label category-label">手记分类</div><div class="side-categories">' +
    CATEGORIES.map(
      (c) =>
        '<button ' +
        action('side-cat', c) +
        ' class="' +
        (category === c && section === 'home' ? 'selected' : '') +
        '"><i class="dot ' +
        catClass(c) +
        '"></i>' +
        c +
        '<small>' +
        pool().filter((e) => e.category === c).length +
        '</small></button>',
    ).join('') +
    '</div></div><div class="side-bottom">' +
    kitchenSketch +
    '<button class="personal" ' +
    action('settings') +
    '><span class="avatar">' +
    icon('sprout', 21) +
    '</span><span><b>我的小天地</b><small>本机手记本</small></span>' +
    icon('settings', 17) +
    '</button></div></aside>'
  )
}
function heading() {
  const title = {
    home: '生活手记',
    free: '现在有空',
    kitchen: '吃点啥',
    venues: '我的店铺',
  }[section]
  const now = new Date()
  const date = now.toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
  const weekday = now.toLocaleDateString('zh-CN', { weekday: 'long' })
  let add = action('capture', 'text'),
    label = '记一笔'
  if (section === 'venues')
    add = action(
      selectedVenueKey ? 'add-at-venue' : 'add-out',
      selectedVenueKey,
    )
  if (section === 'free') {
    add = action('start-plan', 'wish')
    label = '记个想做'
  }
  return `<header class="page-header">
    <div><div class="today">${icon('calendar', 15)}<time>${date}</time><i></i>${weekday}</div>
      <h1>${title}${flourish}</h1></div>
    <div class="header-actions">
      <button class="new-entry" ${add}>${icon('plus', 19)}${label}</button>
    </div></header>`
}
function homePick() {
  const list = listSuggestions()
  const entry = list[suggestionIndex % list.length]
  if (!entry) return null
  const fresh = entry.id.startsWith('idea-')
  const drink = entry.category === '饮品'
  const description =
    recommendationQuote(entry, { inspiration: fresh }) ||
    (fresh ? '可以从这份做法开始。' : '翻开这篇手记，重温当时的做法。')
  return {
    title: entry.title,
    description,
    photo:
      bundledPhotoPath(entry.image) === '/images/tomato-eggs.webp'
        ? '/images/hero.webp'
        : entry.image,
    ticket: fresh ? '新灵感' : drink ? '自制饮品' : '拿手菜',
    fresh,
    button: fresh ? '看看做法' : drink ? '翻开这杯饮品' : '翻开这道菜',
    target: action('detail', entry.id),
    more: list.length > 1,
  }
}
function outsidePick() {
  const ranked = recommendVenues(pool(), placeProfiles)
  const place = ranked[suggestionIndex % ranked.length]
  if (!place) {
    const hasPlaces = venues().length > 0
    return {
      title: hasPlaces ? '今天，去哪家？' : '记下第一家店',
      description: hasPlaces
        ? '给喜欢的菜或饮品打个分，下次就能在这里挑一家。'
        : '记下店名和喜欢的味道，下次出门就有了主意。',
      button: hasPlaces ? '翻翻我的店铺' : '记一次外食',
      target: action(hasPlaces ? 'all-venues' : 'add-out'),
      ticket: '',
      photo: '',
      more: false,
    }
  }
  const visits = place.entries
  const quoted = visits
    .filter(isLikedEntry)
    .map((entry) => recommendationQuote(entry))
    .find(Boolean)
  const description =
    quoted ||
    visits.map((entry) => recommendationQuote(entry)).find(Boolean) ||
    '翻开以前的到店手记，看看点过什么。'
  return {
    title: place.name,
    description,
    photo: venuePhoto(visits),
    alt: place.name,
    ticket:
      (place.rating ? place.rating.toFixed(1) + ' 分 · ' : '') +
      visits.length +
      ' 条手记',
    ticketIcon: place.rating ? 'star' : 'book',
    button: '看看这家店',
    target: action('open-venue', place.key),
    more: ranked.length > 1,
  }
}
function hero(mode = diningMode()) {
  const out = mode === 'out'
  const pick = out ? outsidePick() : homePick()
  if (!pick) return ''
  const switches = [
    ['home', 'chef', '自己做'],
    ['out', 'store', '出去吃'],
  ]
    .map(
      ([value, symbol, label]) =>
        `<button ${action('recommend-mode', value)} aria-pressed="${mode === value}">${icon(symbol, 14)}${label}</button>`,
    )
    .join('')
  return `<section class="hero ${out ? 'dining-out-hero' : ''}" aria-label="今日饮食推荐">
    <svg class="clip-defs" width="0" height="0" aria-hidden="true"><defs><clipPath id="paper-edge" clipPathUnits="objectBoundingBox">
      <path d="M.025 0 C.055 .08 .014 .14 .026 .22 S.057 .32 .024 .43 S.013 .55 .029 .64 S.054 .74 .024 .86 S.023 .95 .033 1 H1 V0Z"/>
    </clipPath></defs></svg>
    <div class="hero-copy">
      <div class="dining-switch" role="group" aria-label="推荐方式">${switches}</div>
      <h2>${html(pick.title)}</h2><p>${html(pick.description)}</p>
      <div class="hero-actions">
        <button class="recipe-btn" ${pick.target}>${pick.button}${icon('arrow', 16)}</button>
        ${pick.more ? `<button class="shuffle" ${action('shuffle')}>${icon('refresh', 14)}${out ? '换一家' : '换一个'}</button>` : ''}
      </div>
      <svg class="hero-scribble" viewBox="0 0 71 37" aria-hidden="true"><path d="M3 23c13 10 40 7 39-7-1-9-15-8-13 1 3 10 19 11 36-5m-10 1 10-2-1 10" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>
    </div>
    <div class="hero-photo ${pick.photo ? '' : 'hero-no-photo'}">${pick.photo ? img(pick.photo, pick.alt || pick.ticket, { thumbnail: true, lazy: false, priority: true }) : icon(out ? 'store' : 'chef', 90)}</div>
    ${pick.ticket ? `<div class="dish-ticket">${icon(pick.ticketIcon || (pick.fresh ? 'sparkle' : 'star'), 14)}${html(pick.ticket)}</div>` : ''}
  </section>`
}
function card(entry, eager = false) {
  const excerpt = entry.text || entry.notes || entry.feeling
  const cover = entry.image
    ? img(entry.image, entry.title, { thumbnail: true, lazy: !eager })
    : `<div class="no-photo ${catClass(entry.category)}">${excerpt ? `<span class="paper-line">${html(excerpt)}</span>` : icon(catIcon(entry.category), 40)}</div>`
  return (
    '<article class="entry-card"><button class="card-open" ' +
    action('detail', entry.id) +
    ' aria-label="查看' +
    html(entry.title) +
    '"><div class="card-cover">' +
    cover +
    catTag(entry.category) +
    authorBadge(entry) +
    '</div><div class="card-body"><div class="card-date">' +
    icon('clock', 12) +
    relativeDate(entry.createdAt) +
    '<span>·</span>' +
    time(entry.createdAt) +
    '</div><h3>' +
    html(entry.title) +
    '</h3><p>' +
    html(
      entry.text ||
        entry.feeling ||
        entry.notes ||
        (entry.audio ? '听听这一刻的声音' : '查看这篇手记'),
    ) +
    '</p><div class="card-rating">' +
    (entry.rating
      ? icon('star', 15) + '<b>' + entry.rating.toFixed(1) + '</b>'
      : '') +
    (entry.taste
      ? '<span>' + html(attitudeLabel(entry.taste)) + '</span>'
      : '') +
    sourceLabel(entry) +
    '</div></div></button><button class="heart-btn ' +
    (entry.favorite ? 'hearted' : '') +
    '" ' +
    action('favorite', entry.id) +
    ' aria-label="' +
    (entry.favorite ? '取消收藏' : '收藏') +
    html(entry.title) +
    '" aria-pressed="' +
    entry.favorite +
    '">' +
    icon('heart', 16) +
    '</button></article>'
  )
}
function filters() {
  return (
    '<div class="filters" role="group" aria-label="按分类查看">' +
    ['全部', ...CATEGORIES, '收藏']
      .map(
        (c) =>
          '<button ' +
          action('filter', c) +
          ' class="filter ' +
          (category === c ? 'chosen' : '') +
          '" aria-pressed="' +
          (category === c) +
          '">' +
          (c === '收藏' ? icon('heart', 14) : '') +
          c +
          '</button>',
      )
      .join('') +
    '</div>'
  )
}
function diningFilterControl() {
  if (!['全部', '美食', '饮品'].includes(category)) return ''
  const choices = venues()
  const option = (value, label) =>
    `<option value="${html(value)}" ${diningFilter === value ? 'selected' : ''}>${html(label)}</option>`
  return `<label class="source-filter ${diningFilter === 'all' ? '' : 'is-active'}" title="筛选来源或店铺">
    ${icon('store', 15)}<select id="dining-filter" aria-label="筛选来源或店铺">
      ${option('all', '所有来源')}${option('home', '自己做')}${option('out', '出去吃')}
      ${choices.length ? `<optgroup label="按店铺">${choices.map((place) => option('venue:' + place.key, place.name)).join('')}</optgroup>` : ''}
    </select>${icon('down', 12)}</label>`
}
function filteredEntries() {
  const q = query.trim().toLowerCase()
  return pool().filter(
    (e) =>
      (category === '全部' ||
        (category === '收藏' ? e.favorite : e.category === category)) &&
      (diningFilter === 'all' ||
        e.diningSource === diningFilter ||
        (e.venueName &&
          'venue:' + canonicalPlaceKey(e.venueName) === diningFilter)) &&
      (!q ||
        [
          e.title,
          e.venueName,
          e.text,
          e.category,
          e.notes,
          e.feeling,
          ...e.ingredients,
        ]
          .join(' ')
          .toLowerCase()
          .includes(q)),
  )
}
function cardArea() {
  const list = filteredEntries()
  if (!list.length)
    return (
      '<div class="empty">' +
      icon(category === '收藏' ? 'heart' : 'book', 33) +
      '<h3>' +
      (query
        ? '没有找到相关手记'
        : category === '收藏'
          ? '这里还没有收藏'
          : '这里还没有手记') +
      '</h3><p>' +
      (query
        ? '试试其他关键词。'
        : category === '收藏'
          ? '点一下手记上的爱心，就能在这里重温。'
          : '记下这个分类里的第一个瞬间。') +
      '</p></div>'
    )
  if (layout === 'list') {
    const groups = Map.groupBy
      ? Map.groupBy(list, (e) => dayKey(e.createdAt))
      : list.reduce((m, e) => {
          const k = dayKey(e.createdAt)
          if (!m.has(k)) m.set(k, [])
          m.get(k).push(e)
          return m
        }, new Map())
    return (
      '<div class="timeline">' +
      [...groups.values()]
        .map(
          (group, groupIndex) =>
            '<section><h3><i></i>' +
            localDate(group[0].createdAt) +
            ' <small>' +
            new Date(group[0].createdAt).toLocaleDateString('zh-CN', {
              weekday: 'long',
              year: 'numeric',
            }) +
            '</small></h3><div class="entry-grid list">' +
            group.map((entry, i) => card(entry, groupIndex === 0 && i < 2)).join('') +
            '</div></section>',
        )
        .join('') +
      '</div>'
    )
  }
  return `<div class="entry-grid">${list.map((entry, i) => card(entry, i < 2)).join('')}</div>`
}
function journal() {
  const count = filteredEntries().length
  const views = [
    ['grid', 'grid', '卡片'],
    ['list', 'clock', '时光轴'],
  ]
  const buttons = views
    .map(
      ([id, symbol, name]) =>
        `<button ${action('layout', id)} aria-pressed="${layout === id}" class="${layout === id ? 'active' : ''}">${icon(symbol, 16)}${name}</button>`,
    )
    .join('')
  return `<section class="journal journal-index" id="journal" aria-label="手记">
    <div class="journal-heading"><div class="layout-switch" role="group" aria-label="手记视图">${buttons}</div>
      <span class="entry-count" id="journal-count">${count} 篇</span>
      <div class="view-controls">${diningFilterControl()}<button ${action('search')} class="search-toggle ${findOpen ? 'active' : ''}" aria-label="查找手记" aria-expanded="${findOpen}">${icon('search', 17)}</button></div>
    </div>
    ${findOpen ? `<label class="search-field">${icon('search', 17)}<input id="search" autocomplete="off" value="${html(query)}" placeholder="搜索店名、菜名或手记内容" aria-label="搜索手记"></label>` : ''}
    ${filters()}<div id="results">${cardArea()}</div></section>`
}
function kitchen() {
  const places = venues()
  const known = recommendEntries(pool(), { limit: Infinity })
  const mode = diningMode()
  return `${allowPicks ? hero(mode) : `<button class="add-visit" ${action('enable-picks')}>${icon('sparkle', 16)}展开饮食推荐</button>`}
    ${
      allowPicks && mode === 'home'
        ? `<div class="meal-tabs meal-purpose" role="group" aria-label="推荐时段">${[
            '早餐',
            '晚餐',
          ]
            .map(
              (v) =>
                `<button ${action('meal', v)} class="filter ${meal === v ? 'chosen' : ''}" aria-pressed="${meal === v}">${v}</button>`,
            )
            .join('')}</div>`
        : ''
    }
    <section class="journal"><div class="journal-heading"><h2>我的店铺</h2><span class="entry-count">${places.length} 家</span>
      <button class="browse-venues" ${action('all-venues')}>全部店铺${icon('next', 13)}</button></div>
      <div class="kitchen-places">${places.length ? renderVenueCards(places.slice(0, 3)) : `<button class="add-visit" ${action('add-out')}>${icon('plus', 17)}记下第一家店</button>`}</div>
    </section>
    <section class="journal"><div class="journal-heading"><h2>拿手菜</h2><span class="entry-count">${known.length} 篇</span></div>
      ${known.length ? `<div class="entry-grid kitchen-grid">${known.map((entry) => card(entry)).join('')}</div>` : '<p class="empty">把自己做过的菜或饮品标成「下次再来」，就会出现在这里。</p>'}
    </section>
    <section class="journal"><div class="journal-heading"><h2>换个新口味</h2></div><div class="ideas">
      ${INSPIRATIONS.filter((e) => e.meal === meal)
        .map(
          (e) =>
            `<button ${action('detail', e.id)}><span class="idea-icon">${icon('chef', 23)}</span><span><strong>${html(e.title)}</strong><small>${html(e.ingredients.join(' · '))}</small></span>${icon('next', 16)}</button>`,
        )
        .join('')}
    </div></section>`
}
function freePage() {
  const now = new Date()
  const lists = derivePlanLists(plans, now)
  const picks = pickFreeTime({
    entries: pool(),
    profiles: placeProfiles,
    open: lists.open,
    archive: lists.archive,
    mood: freeMood,
    offset: freeOffset,
    now,
  })
  const noteIds = new Set(entries.map((entry) => entry.id))
  const archive = lists.archive.map((row) => ({
    ...row,
    hasJournal: noteIds.has(planNoteId(row)),
  }))
  return renderFreeTime({
    ...picks,
    mood: freeMood,
    lists: { ...lists, archive },
    plans,
  })
}

async function refreshPlans() {
  plans = await readPlans()
  render()
}

function editPlanForm(plan, prefill = {}) {
  closeOverlay()
  openPlanEditor({
    plan,
    prefill,
    privateOnly:
      entryForPlan((plan || prefill).sourceEntryId)?.visibility === 'private',
    onSave: async (fields) => {
      const changes = plan
        ? Object.fromEntries(
            Object.entries(fields).filter(
              ([k, v]) => k === 'id' || v !== plan[k],
            ),
          )
        : fields
      await putPlan(changes, { editing: Boolean(plan) })
      toast(plan ? '已保存修改' : '已放进清单')
    },
    onDelete: async (id) => {
      await deletePlan(id)
      toast('已从清单移除')
    },
  })
}

function entryForPlan(id) {
  return (
    entries.find((entry) => entry.id === id) ||
    INSPIRATIONS.find((entry) => entry.id === id)
  )
}

function planFromMemory(id) {
  const entry = entryForPlan(id)
  if (!entry) return
  const lists = derivePlanLists(plans)
  const place =
    entry.diningSource === 'out' && canonicalPlaceKey(entry.venueName)
  const existing = lists.open.find((row) => {
    if (row.stage !== 'task') return false
    if (row.sourceEntryId === id) return true
    const prior = place && entryForPlan(row.sourceEntryId)
    return (
      prior?.diningSource === 'out' &&
      canonicalPlaceKey(prior.venueName) === place
    )
  })
  if (existing) {
    viewPlan(existing.planId)
    return
  }
  const setting = settingForMemory(entry)
  const title = entry.venueName ? '再去' + entry.venueName : entry.title
  editPlanForm(null, {
    title,
    kind: 'wish',
    setting,
    sourceEntryId: id,
    visibility: entry.visibility,
  })
}

async function visitToday(key) {
  const place = venues().find((item) => item.key === key)
  if (!place) return
  const today = dayKey(new Date())
  const id = 'venue-visit-' + today + '-' + key
  const { open, archive } = derivePlanLists(await readPlans())
  const samePlace = (row) =>
    row.stage === 'task' &&
    (row.planId === id ||
      canonicalPlaceKey(entryForPlan(row.sourceEntryId)?.venueName) === key)
  const scheduled = open.find((row) => samePlace(row) && row.date === today)
  const finished = archive.find(
    (row) =>
      samePlace(row) && row.date === today && dayKey(row.doneAt) === today,
  )
  if (!scheduled && !finished) {
    const undated = open.find((row) => samePlace(row) && !row.date)
    if (undated) await putPlan({ id: undated.planId, date: today })
    else {
      const source = place.entries[0]
      await putPlan({
        id,
        title: '去' + place.name,
        kind: 'wish',
        setting: 'out',
        date: today,
        sourceEntryId: source?.id,
        visibility: source?.visibility || 'shared',
      })
    }
  }
  plans = await readPlans()
  navigate('free')
  toast(
    finished
      ? '今天这次已归档'
      : scheduled
        ? '已在今日打算中'
        : '已加入今日打算',
  )
}

function planNoteId(row) {
  return 'plan-note-' + row.key
}

function noteFromPlan(row) {
  const id = planNoteId(row)
  if (entries.some((entry) => entry.id === id)) {
    showDetail(id)
    return
  }
  const source = entryForPlan(row.sourceEntryId)
  const draft = {
    title: row.title,
    createdAt: row.doneAt,
    visibility:
      row.visibility ||
      plans.find((p) => p.id === row.planId)?.visibility ||
      'shared',
    category:
      source && ['美食', '饮品'].includes(source.category)
        ? source.category
        : '',
    diningSource:
      source && ['美食', '饮品'].includes(source.category)
        ? { home: 'home', out: 'out' }[settingForMemory(source)] || ''
        : '',
    venueName: source?.venueName || '',
  }
  startEntry({
    mode: 'text',
    record: draft,
    privateOnly: draft.visibility === 'private',
    onSave: (entry) => saveFromCapture({ ...entry, id }),
  })
}

function viewPlan(value) {
  const lists = derivePlanLists(plans)
  const row = [...lists.open, ...lists.upcoming, ...lists.archive].find(
    (item) => item.key === value,
  )
  const plan = plans.find((item) => item.id === (row?.planId || value))
  if (!plan) {
    toast('这件事已从清单移除')
    return
  }
  const task = lists.open.find((item) =>
    row
      ? item.key === row.key
      : item.planId === plan.id && item.stage === 'task',
  )
  const source = entryForPlan(plan.sourceEntryId)
  const kind = {
    wish: '想做的事',
    chore: '生活小事',
    birthday: '生日',
    anniversary: '纪念日',
  }[plan.kind]
  const setting = { home: '在家', out: '出门', any: '都可以' }[plan.setting]
  const where = plan.kind === 'wish' || plan.kind === 'chore' ? setting : '每年'
  const title = row?.title || plan.title
  const date = row?.eventDate || row?.date || plan.date
  lockOverlay(
    `<button class="close-sheet" ${action('close')} aria-label="关闭">${icon('x', 19)}</button>
    ${source?.image ? `<div class="detail-photo">${img(source.image, source.title)}</div>` : ''}
    <div class="detail-content plan-detail">
      <div class="detail-meta"><small>${kind} · ${where} · ${plan.visibility === 'private' ? '仅自己' : '一起看'}</small></div>
      <h2>${html(title)}</h2>
      ${date ? `<p class="detail-text">${icon('calendar', 14)} ${html(date)}</p>` : ''}
      ${source ? `<button class="plan-source" ${action('detail', source.id)}>${icon('book', 15)}<span>翻开原手记 · ${html(source.title)}</span>${icon('next', 14)}</button>` : ''}
      <div class="detail-footer">
        ${task ? `<button class="solid" ${action('finish-plan', task.key)}>${icon('check', 16)}做完了</button>` : ''}
        <button ${action('edit-plan', plan.id)}>${icon('pen', 15)}编辑</button>
      </div>
    </div>`,
    title,
  )
}

function render({ resetScroll = false } = {}) {
  const scrollTop = resetScroll ? 0 : app.querySelector('#main')?.scrollTop || 0
  const archiveOpen =
    section === 'free' && app.querySelector('.ft-archive')?.open
  if (
    section === 'venues' &&
    selectedVenueKey &&
    !venues().some((place) => place.key === selectedVenueKey)
  ) {
    selectedVenueKey = ''
    history.replaceState(null, '', '#venues')
  }
  if (
    diningFilter.startsWith('venue:') &&
    !venues().some((place) => 'venue:' + place.key === diningFilter)
  )
    diningFilter = 'all'
  app.innerHTML =
    sidebar() +
    '<main id="main"><div class="mobile-brand"><button ' +
    action('nav', 'home') +
    '>' +
    flower() +
    '<b>小日子</b><em>Little Days</em></button><button class="mobile-settings" ' +
    action('settings') +
    ' aria-label="偏好设置">' +
    icon('settings', 20) +
    '</button></div><div class="page">' +
    heading() +
    '<aside class="local-status" data-sync-notice hidden role="status"><span></span><button type="button"></button></aside>' +
    (section === 'home'
      ? `<aside class="local-status backup-nudge" data-private-backup-reminder hidden><span>私人内容已有两周未备份。</span><button type="button" ${action('private-backup')}>备份到文件</button></aside>`
      : '') +
    (section === 'home' &&
    !cloud.status().connected &&
    !getPreference('spaceInviteDismissed', false)
      ? `<aside class="space-invite"><button ${action('connect-space')}>${icon('book', 17)}连接双人云空间${icon('next', 13)}</button><button ${action('hide-space-invite')} aria-label="收起云空间提示">${icon('x', 14)}</button></aside>`
      : '') +
    (storageError
      ? `<div class="storage-error" role="alert"><p>${html(storageError)}</p><button ${action('retry-storage')}>重新读取</button></div>`
      : '') +
    (section === 'home'
      ? journal()
      : section === 'free'
        ? freePage()
        : section === 'kitchen'
          ? kitchen()
          : (selectedVenueKey
              ? ''
              : `<button class="vn-back kitchen-back" ${action('nav', 'kitchen')}>${icon('back', 15)}吃点啥</button>`) +
            renderVenues({
              venues: venues(),
              selectedKey: selectedVenueKey,
              query: venueQuery,
              filter: venueFilter,
              renderCard: card,
            })) +
    '</div></main><nav class="bottom-nav" aria-label="手机导航">' +
    navMarkup(true) +
    '</nav>'
  updateSyncNotice(cloud.status())
  updateBackupReminder()
  if (archiveOpen) app.querySelector('.ft-archive').open = true
  if (scrollTop) app.querySelector('#main').scrollTop = scrollTop
}
function moveTo(route) {
  const [path, filters] = route.split('?')
  const [id, rawKey] = path.split('/')
  const params = new URLSearchParams(filters)
  if (id !== 'venues') {
    venueQuery = ''
    venueFilter = 'all'
  }
  selectedVenueKey = ''
  if (id === 'venues' && rawKey) {
    try {
      selectedVenueKey = decodeURIComponent(rawKey)
    } catch {}
  }
  section = id === 'venues' || sections.some(([k]) => k === id) ? id : 'home'
  if (section === 'free') {
    freeMood = 'any'
    freeOffset = 0
  }
  diningFilter = 'all'
  category = id === 'favorites' ? '收藏' : params.get('filter') || '全部'
  if (!['全部', ...CATEGORIES, '收藏'].includes(category)) category = '全部'
  if (id === 'timeline') layout = 'list'
  else if (section === 'home') layout = getPreference('layout', 'grid')
  if (id === 'timeline' || id === 'favorites') rememberJournalView()
  query = ''
  findOpen = false
  suggestionIndex = 0
  meal = mealNow()
  render({ resetScroll: true })
  if (!usesMobileShell()) window.scrollTo({ top: 0, behavior: 'instant' })
}
function rememberJournalView() {
  setPreference('layout', layout)
  const suffix =
    category === '全部' ? '' : '?filter=' + encodeURIComponent(category)
  history.replaceState(null, '', '#home' + suffix)
}
function navigate(id) {
  if (location.hash.slice(1) === id || (!location.hash && id === 'home'))
    moveTo(id)
  else location.hash = id
}
let releaseOverlayViewport
function lockOverlay(contents, label) {
  releaseOverlayViewport?.()
  if (!overlay.firstElementChild) previousFocus = document.activeElement
  overlay.innerHTML =
    '<div class="overlay-bg"><section class="sheet" role="dialog" aria-modal="true" aria-label="' +
    html(label) +
    '">' +
    contents +
    '</section></div>'
  document.body.classList.add('has-overlay')
  app.inert = true
  releaseOverlayViewport = fitDialogViewport(
    overlay.firstElementChild,
    overlay.querySelector('.sheet'),
  )
  overlay.querySelector('button')?.focus({ preventScroll: true })
}
function closeOverlay() {
  if (!overlay.firstElementChild) return
  releaseOverlayViewport?.()
  releaseOverlayViewport = undefined
  app.inert = false
  overlay.innerHTML = ''
  activeDetail = ''
  document.body.classList.remove('has-overlay')
  if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true })
}
function showDetail(id) {
  const entry =
    entries.find((e) => e.id === id) || INSPIRATIONS.find((e) => e.id === id)
  if (!entry) return
  const fresh = entry.id.startsWith('idea-')
  activeDetail = id
  const photo = entry.image
    ? `<div class="detail-photo">${img(entry.image, entry.title)}</div>`
    : ''
  const note = (title, body) =>
    body ? `<section><h3>${title}</h3><p>${html(body)}</p></section>` : ''
  const ingredients = entry.ingredients?.length
    ? `<section><h3>食材</h3><div class="ingredient-list">
    ${entry.ingredients.map((item) => `<span>${html(item)}</span>`).join('')}
  </div></section>`
    : ''
  const steps = entry.steps?.length
    ? `<section><h3>做法</h3><ol>
    ${entry.steps.map((step) => `<li>${html(step)}</li>`).join('')}
  </ol></section>`
    : ''
  const value = attitudeLabel(entry.taste)
  const stars = entry.rating
    ? Array.from({ length: 5 }, (_, i) =>
        icon('star', 17, i < entry.rating ? 'lit' : ''),
      ).join('') + `<b>${entry.rating.toFixed(1)}</b>`
    : ''
  const footer = fresh
    ? `<button ${action('cook', id)} class="solid">${icon('pen', 16)}记下我的尝试</button>`
    : `
    <button ${action('edit', id)} class="solid">${icon('pen', 16)}编辑手记</button>
    <button ${action('detail-favorite', id)} aria-pressed="${entry.favorite}">
      ${icon('heart', 16, entry.favorite ? 'filled-heart' : '')}${entry.favorite ? '已收藏' : '收藏'}
    </button>
    <button ${action('request-delete', id)} class="delete-entry" aria-label="删除这条手记">${icon('trash', 16)}</button>`
  const timestamp = fresh
    ? '新灵感'
    : localDate(entry.createdAt) +
      ' · ' +
      time(entry.createdAt) +
      (entry.isSample ? ' · 示例手记' : '') +
      (entry.visibility === 'private' ? ' · 仅自己' : ' · 一起看')
  lockOverlay(
    `<button class="close-sheet" ${action('close')} aria-label="关闭">${icon('x', 19)}</button>
    ${photo}
    <div class="detail-content">
      <div class="detail-meta">${catTag(entry.category)}<small>${timestamp}</small>${fresh ? '' : authorBadge(entry)}</div>
      <h2>${html(entry.title)}</h2>
      ${sourceLabel(entry, true)}
      ${stars || value ? `<div class="detail-stars">${stars}<span>${html(value)}</span></div>` : ''}
      <p class="detail-text">${html(entry.text)}</p>
      ${entry.audio ? `<audio controls preload="metadata" ${mediaAttributes(entry.audio)}></audio>` : ''}
      ${note('照片识别', entry.photoDescription)}${ingredients}${steps}${note('当时的感受', entry.feeling)}${note('备注', entry.notes)}
      <div class="detail-footer record-detail-actions">${footer}
        <button class="remember-plan" ${action('memory-plan', entry.id)}>${icon('sprout', 15)}放进想做</button>
      </div>
    </div>`,
    entry.title,
  )
}
function confirmRemoval(id) {
  if (overlay.querySelector('.delete-confirm')) return
  const footer = overlay.querySelector('.detail-footer')
  if (!footer || id !== activeDetail) return
  footer.insertAdjacentHTML(
    'afterend',
    `<div class="delete-confirm" role="group" aria-label="确认删除">
    <p>${cloud.status().boundSpace && entries.find((e) => e.id === id)?.visibility === 'shared' ? '删除这条共享手记？同步后，两人都可以在回收站恢复，保留 30 天。' : '删除本机的这条手记及其照片、录音？'}</p>
    <button ${action('cancel-delete')}>保留手记</button><button class="confirm" ${action('delete', id)}>确认删除</button>
  </div>`,
  )
  const panel = overlay.querySelector('.delete-confirm')
  panel.scrollIntoView({ block: 'nearest' })
  panel.querySelector('button').focus()
}
function editPlace(place) {
  const profile = place?.profile
  const name = place?.name || ''
  lockOverlay(
    `<button class="close-sheet" ${action('close')} aria-label="关闭">${icon('x', 19)}</button>
    <div class="settings-inner"><h2>${place ? '店铺档案' : '新增店铺'}</h2>
    <form class="cloud-tools place-editor"><label class="cloud-field">店名<input name="name" required maxlength="120" value="${html(name)}"></label>
    <label class="cloud-field">别名<input name="aliases" placeholder="多个别名用顿号隔开" value="${html(profile?.aliases?.join('、'))}"></label>
    <p>这是两人一起看的店铺档案。店铺评分和记录数来自共享手记。</p>
    <div class="cloud-actions"><button type="submit" class="solid">保存档案</button>${profile ? '<button type="button" data-remove-place>删除档案</button>' : ''}</div>
    <p role="status" data-place-status></p></form></div>`,
    '店铺档案',
  )
  const form = overlay.querySelector('.place-editor')
  const status = form.querySelector('[data-place-status]')
  form.onsubmit = async (event) => {
    event.preventDefault()
    const submit = form.querySelector('[type=submit]')
    if (submit.disabled) return
    submit.disabled = true
    try {
      const name = form.elements.name.value.trim()
      const aliases = form.elements.aliases.value
        .split(/[,，、]/u)
        .map((x) => x.trim())
        .filter(Boolean)
      const fields = profile ? { id: profile.id } : {}
      if (!profile || name !== profile.name) fields.name = name
      if (
        !profile ||
        JSON.stringify(aliases) !== JSON.stringify(profile.aliases)
      )
        fields.aliases = aliases
      const saved = await putPlaceProfile(fields, { editing: Boolean(profile) })
      placeProfiles = await readPlaceProfiles()
      closeOverlay()
      navigate('venues/' + encodeURIComponent(venueKey(saved.name)))
      toast('店铺档案已保存')
    } catch (e) {
      status.textContent = e.message
      submit.disabled = false
    }
  }
  const remove = form.querySelector('[data-remove-place]')
  if (remove)
    remove.onclick = async () => {
      if (!remove.dataset.confirm) {
        remove.dataset.confirm = 'true'
        remove.textContent = '确认删除档案'
        status.textContent = '到店手记会保留。已同步的档案可以从回收站恢复。'
        return
      }
      remove.disabled = true
      try {
        await deletePlaceProfile(profile.id)
        placeProfiles = await readPlaceProfiles()
        closeOverlay()
        navigate('venues')
        toast('店铺档案已删除')
      } catch (e) {
        status.textContent = e.message
        remove.disabled = false
      }
    }
}
function settings() {
  const row = (k, t, desc, value) =>
    '<label class="pref-row"><span><strong>' +
    t +
    '</strong><small>' +
    desc +
    '</small></span><input type="checkbox" data-pref="' +
    k +
    '" ' +
    (value ? 'checked' : '') +
    '></label>'
  lockOverlay(
    '<button class="close-sheet" ' +
      action('close') +
      ' aria-label="关闭">' +
      icon('x', 19) +
      '</button><div class="settings-inner"><span class="avatar">' +
      icon('sprout', 22) +
      '</span><h2>我的小天地</h2><p>「仅自己」保存在这台设备。连接云空间后，两个人都能查看和编辑「一起看」的内容。</p>' +
      row(
        'allowPicks',
        '吃点啥推荐卡',
        '根据手记评分，推荐自己做的味道或值得再去的店。',
        allowPicks,
      ) +
      row(
        'samples',
        '显示示例手记',
        '初次翻阅时，看看可以怎样记录。',
        showSamples,
      ) +
      cloudControls() +
      backupControls() +
      '</div>',
    '我的小天地',
  )
  bindCloudControls(overlay, cloud)
  bindBackupControls(overlay, refreshNotebook, { entries, plans })
  if (cloud.status().boundSpace)
    overlay.querySelector('[data-backup-confirm-note]').textContent =
      '恢复会替换本机手记与清单。下次同步也会把其中的共享更改和删除发给另一人。建议先导出当前备份。'
}
async function refreshNotebook() {
  const notebook = await Promise.all([
    readRecords(),
    readPlans(),
    readPlaceProfiles(),
    readMealHistory(),
  ])
  ;[entries, plans, placeProfiles, mealHistory = []] = notebook
  storageError = ''
  layout = getPreference('layout', 'grid')
  preferredDining = getPreference('recommendDining', '')
  allowPicks = getPreference('allowPicks', true)
  showSamples = getPreference('samples', true)
  suggestionIndex = 0
  render()
  for (const input of overlay.querySelectorAll('[data-pref]')) {
    input.checked =
      input.dataset.pref === 'allowPicks' ? allowPicks : showSamples
  }
}
async function saveFromCapture(record, original = null) {
  const saved = await putRecord({ ...record, isSample: false }, original)
  if (saved.diningSource === 'out' || original?.diningSource === 'out') {
    try {
      placeProfiles = await readPlaceProfiles()
    } catch {
      storageError = '手记已保存，店铺列表暂时无法刷新。'
    }
  }
  entries = [saved, ...entries.filter((e) => e.id !== saved.id)].sort((a, b) =>
    b.createdAt.localeCompare(a.createdAt),
  )
  category = '全部'
  diningFilter = 'all'
  query = ''
  findOpen = false
  if (section === 'home') rememberJournalView()
  if (
    section === 'venues' &&
    selectedVenueKey &&
    !venues().some((place) => place.key === selectedVenueKey)
  ) {
    selectedVenueKey =
      saved.venueName && saved.diningSource === 'out'
        ? canonicalPlaceKey(saved.venueName)
        : ''
    history.replaceState(
      null,
      '',
      selectedVenueKey
        ? '#venues/' + encodeURIComponent(selectedVenueKey)
        : '#venues',
    )
  }
  render()
  toast('手记已保存')
}
async function toggleFavorite(id) {
  const entry = entries.find((e) => e.id === id)
  if (!entry) return
  const updated = await toggleRecordFavorite(id)
  entries = entries.map((e) => (e.id === id ? updated : e))
  render()
  toast(updated.favorite ? '已加入收藏' : '已移出收藏')
}
async function handleAction(key, value) {
  if (key === 'retry-storage') {
    await refreshNotebook()
    return
  }
  if (key === 'free-mood') {
    freeMood = ['home', 'out'].includes(value) ? value : 'any'
    freeOffset = 0
    render()
    return
  }
  if (key === 'free-shuffle') {
    freeOffset++
    render()
    return
  }
  if (key === 'memory-plan') {
    planFromMemory(value)
    return
  }
  if (key === 'venue-today') {
    await visitToday(value)
    return
  }
  if (key === 'start-plan') {
    editPlanForm(null, { kind: value || 'wish' })
    return
  }
  if (key === 'edit-plan') {
    const plan = plans.find((item) => item.id === value)
    if (plan) editPlanForm(plan)
    return
  }
  if (key === 'view-plan') {
    viewPlan(value)
    return
  }
  if (
    key === 'finish-plan' ||
    key === 'restore-plan' ||
    key === 'journal-plan'
  ) {
    const lists = derivePlanLists(await readPlans())
    const list = key === 'finish-plan' ? lists.open : lists.archive
    const row = list.find((item) => item.key === value)
    if (!row) {
      closeOverlay()
      await refreshPlans()
      return
    }
    if (key === 'journal-plan') {
      noteFromPlan(row)
      return
    }
    if (key === 'finish-plan') await finishPlan(row.planId, row.stage, row.year)
    else await restorePlan(row.planId, row.stage, row.year)
    closeOverlay()
    toast(key === 'finish-plan' ? '做完了，已归档' : '已撤销完成')
    return
  }
  if (key === 'enable-picks') {
    allowPicks = true
    setPreference('allowPicks', true)
    render()
    return
  }
  if (key === 'recommend-mode') {
    preferredDining = value
    setPreference('recommendDining', value)
    suggestionIndex = 0
    render()
    return
  }
  if (key === 'open-venue' || key === 'all-venues') {
    if (overlay.firstElementChild) closeOverlay()
    navigate(
      key === 'open-venue' ? 'venues/' + encodeURIComponent(value) : 'venues',
    )
    return
  }
  if (key === 'add-at-venue' || key === 'add-out') {
    const name =
      key === 'add-at-venue'
        ? venues().find((place) => place.key === value)?.name
        : ''
    startEntry({
      mode: 'text',
      defaultDiningSource: 'out',
      defaultVenueName: name || '',
    })
    return
  }
  if (key === 'request-delete') {
    confirmRemoval(value)
    return
  }
  if (key === 'cancel-delete') {
    overlay.querySelector('.delete-confirm')?.remove()
    overlay.querySelector('.delete-entry')?.focus()
    return
  }
  if (key === 'delete' && activeDetail === value) {
    await removeRecord(value)
    placeProfiles = await readPlaceProfiles()
    entries = entries.filter((entry) => entry.id !== value)
    closeOverlay()
    render()
    toast('手记已删除')
    return
  }
  if (key === 'nav') {
    navigate(value)
    return
  }
  if (key === 'side-cat') {
    if (section !== 'home') {
      history.pushState(null, '', '#home')
      moveTo('home')
    }
    category = value
    rememberJournalView()
    if (!['全部', '美食', '饮品'].includes(value)) diningFilter = 'all'
    render()
    document
      .querySelector('#journal')
      ?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    return
  }
  if (key === 'filter') {
    category = value
    rememberJournalView()
    if (!['全部', '美食', '饮品'].includes(value)) diningFilter = 'all'
    render()
    return
  }
  if (key === 'capture') {
    startEntry({ mode: value })
    return
  }
  if (key === 'edit' || key === 'cook') {
    const record =
      key === 'edit'
        ? await readRecordWithMedia(value)
        : {
            ...INSPIRATIONS.find((e) => e.id === value),
            id: undefined,
            image: '',
            diningSource: 'home',
            createdAt: undefined,
          }
    if (!record || (key === 'edit' && activeDetail !== value)) return
    closeOverlay()
    startEntry({ record, mode: 'text' })
    return
  }
  if (key === 'detail') {
    showDetail(value)
    return
  }
  if (key === 'favorite' || key === 'detail-favorite') {
    await toggleFavorite(value)
    if (key === 'detail-favorite') showDetail(value)
    return
  }
  if (key === 'layout') {
    layout = value
    rememberJournalView()
    render()
    return
  }
  if (key === 'shuffle') {
    suggestionIndex++
    render()
    return
  }
  if (key === 'meal') {
    meal = value
    suggestionIndex = 0
    render()
    return
  }
  if (key === 'search') {
    findOpen = !findOpen
    if (!findOpen) query = ''
    render()
    document.querySelector('#search')?.focus()
    return
  }
  if (key === 'edit-place' || key === 'new-place') {
    editPlace(
      key === 'edit-place' ? venues().find((p) => p.key === value) : null,
    )
    return
  }
  if (key === 'hide-space-invite') {
    setPreference('spaceInviteDismissed', true)
    render()
    return
  }
  if (key === 'private-backup') {
    settings()
    overlay.querySelector('[data-private-backup-export]')?.focus()
    return
  }
  if (key === 'renew-space') {
    settings()
    overlay.querySelector('[data-space-setup]').open = true
    const token = overlay.querySelector('[data-space-token]')
    if (usesMobileShell()) token.scrollIntoView({ block: 'nearest' })
    else token.focus()
    return
  }
  if (key === 'connect-space') {
    settings()
    overlay.querySelector('[data-space-setup]').open = true
    const repo = overlay.querySelector('[data-space-repo]')
    if (usesMobileShell()) repo.scrollIntoView({ block: 'nearest' })
    else repo.focus()
    return
  }
  if (key === 'settings') {
    settings()
    return
  }
  if (key === 'close') closeOverlay()
}
document.addEventListener('click', (event) => {
  if (event.target.classList.contains('overlay-bg')) {
    closeOverlay()
    return
  }
  const trigger = event.target.closest('[data-action]')
  if (trigger)
    handleAction(trigger.dataset.action, trigger.dataset.value).catch((e) =>
      toast(e.message || '暂时无法完成操作'),
    )
})
function updateVenueResults() {
  const results = document.querySelector('#venue-results')
  if (results)
    results.innerHTML = renderVenueResults({
      venues: venues(),
      query: venueQuery,
      filter: venueFilter,
    })
}
document.addEventListener('change', (e) => {
  if (e.target.id === 'dining-filter') {
    diningFilter = e.target.value
    render()
  }
  if (e.target.id === 'venue-filter') {
    venueFilter = e.target.value
    updateVenueResults()
  }
})
document.addEventListener('input', (e) => {
  if (e.target.id === 'venue-search') {
    venueQuery = e.target.value
    updateVenueResults()
  }
  if (e.target.id === 'search') {
    query = e.target.value
    document.querySelector('#results').innerHTML = cardArea()
    document.querySelector('#journal-count').textContent =
      filteredEntries().length + ' 篇'
  }
})
overlay.addEventListener('change', (e) => {
  if (!e.target.dataset.pref) return
  if (e.target.dataset.pref === 'allowPicks') {
    allowPicks = e.target.checked
    setPreference('allowPicks', allowPicks)
  }
  if (e.target.dataset.pref === 'samples') {
    showSamples = e.target.checked
    setPreference('samples', showSamples)
  }
  suggestionIndex = 0
  render()
})
document.addEventListener('keydown', (e) => {
  if (!overlay.firstElementChild) return
  if (e.key === 'Escape') {
    closeOverlay()
    return
  }
  if (e.key === 'Tab') {
    const els = [
      ...overlay.querySelectorAll(
        'button:not([disabled]),input:not([disabled]),textarea,summary,select,audio,[tabindex="0"]',
      ),
    ].filter((el) => el.getClientRects().length)
    const last = els.at(-1),
      first = els[0]
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault()
      last.focus()
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault()
      first.focus()
    }
  }
})
async function init() {
  observeGallery()
  observeLocalMedia()
  try {
    const notebook = await Promise.all([
      readRecords(),
      readPlans(),
      readPlaceProfiles(),
      readMealHistory(),
    ])
    ;[entries, plans, placeProfiles, mealHistory = []] = notebook
  } catch (e) {
    storageError = e.message || '本机手记暂时无法读取。'
  }
  moveTo(location.hash.slice(1))
  onPlansChange(() => refreshPlans().catch((e) => toast(e.message)))
  onExternalChange(() => refreshNotebook().catch((e) => toast(e.message)))
  onCloudLocalChange(() => cloud.schedule())
  const resume = () => {
    if (document.visibilityState === 'visible' && cloud.status().connected)
      cloud.sync().catch(() => {})
  }
  window.addEventListener('little-days-private-backup', updateBackupReminder)
  window.addEventListener('storage', (event) => {
    if (event.key === 'little.days.privateBackupAt') updateBackupReminder()
  })
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') updateBackupReminder()
  })
  window.addEventListener('online', resume)
  document.addEventListener('visibilitychange', resume)
  setInterval(resume, 60000)
  cloud.start().catch((e) => paintSpaceStatus(overlay, cloud.status()))
}
let activeSlot = dayKey(new Date()) + mealNow()
function checkMealTime() {
  const slot = dayKey(new Date()) + mealNow()
  if (slot === activeSlot || document.visibilityState === 'hidden') return
  activeSlot = slot
  if (section === 'free') render()
  if (section === 'kitchen') {
    meal = mealNow()
    suggestionIndex = 0
    render()
  }
}
document.addEventListener('visibilitychange', checkMealTime)
setInterval(checkMealTime, 60000)
window.addEventListener('hashchange', () => {
  closeOverlay()
  moveTo(location.hash.slice(1))
})
init()
registerOfflineShell()
