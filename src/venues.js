import { authorBadge } from './cloud-profile.js'
import { icon } from './icons.js'
import { photoAttributes } from './gallery.js'

const characters = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
}
const html = (value) =>
  String(value ?? '').replace(/[&<>"']/g, (c) => characters[c])
const normalized = (value) =>
  String(value ?? '')
    .normalize('NFKC')
    .toLocaleLowerCase()
    .trim()
const filters = [
  ['all', '全部店铺'],
  ['food', '有美食记录'],
  ['drink', '有饮品记录'],
  ['frequent', '记过多次'],
  ['highly-rated', '均分 4 分以上'],
]
const dateFormat = new Intl.DateTimeFormat('zh-CN', {
  month: 'long',
  day: 'numeric',
})

function venueDate(value) {
  if (!value) return ''
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '' : dateFormat.format(date)
}

function average(venue) {
  const rating = Number(venue.rating)
  return Number.isFinite(rating) && rating > 0 && rating <= 5
    ? rating.toFixed(1)
    : ''
}

const sampleStorefronts = {
  'sample-venue-shanjian': '/images/venue-cafe.webp',
  'sample-venue-xiaoman': '/images/venue-noodles.webp',
}
export function venuePhoto(entries) {
  const example = entries.find(
    (entry) => entry.isSample && sampleStorefronts[entry.id],
  )
  if (example) return sampleStorefronts[example.id]
  return (
    entries.find(
      (entry) =>
        typeof entry.image === 'string' &&
        /^(?:\/(?!\/)|https?:\/\/|blob:|data:image\/)/i.test(entry.image),
    )?.image || ''
  )
}

function matches(venue, words, filter) {
  if (
    filter === 'food' &&
    !venue.entries.some((entry) => entry.category === '美食')
  )
    return false
  if (
    filter === 'drink' &&
    !venue.entries.some((entry) => entry.category === '饮品')
  )
    return false
  if (filter === 'frequent' && venue.entries.length < 2) return false
  if (filter === 'highly-rated' && Number(venue.rating || 0) < 4) return false
  if (!words.length) return true
  const content = normalized(
    [
      venue.name,
      ...(venue.profile?.aliases || []),
      ...venue.entries.flatMap((entry) => [
        entry.title,
        entry.category,
        entry.text,
        entry.notes,
        ...(entry.ingredients || []),
      ]),
    ].join(' '),
  )
  return words.every((word) => content.includes(word))
}

function venueCard(venue) {
  const { entries, name, key } = venue
  const image = venuePhoto(entries)
  const avg = average(venue)
  const date = venueDate(venue.lastVisit)
  const titles = [...new Set(entries.map((item) => item.title).filter(Boolean))]
    .slice(0, 3)
    .join(' · ')
  return `<button type="button" class="vn-card" data-action="open-venue" data-value="${html(key)}">
    <span class="vn-cover${image ? '' : ' vn-swatch'}">
      ${image ? `<img ${photoAttributes(image, { thumbnail: true })} alt="">` : icon('store', 45)}
      ${authorBadge(venue.profile)}<span class="vn-count">${icon('book', 13)}${entries.length} 条手记${entries.length && entries.every((entry) => entry.isSample) ? ' · 示例' : ''}</span>
    </span>
    <span class="vn-card-body">
      <span class="vn-card-row"><strong>${html(name)}</strong><span class="vn-next">${icon('next', 14)}</span></span>
      ${titles ? `<span class="vn-dishes">${html(titles)}</span>` : ''}
      <span class="vn-card-foot">
        <span class="vn-rating${avg ? '' : ' vn-unrated'}">${icon('star', 14)}${avg ? `${avg} 分` : '待评分'}</span>
        ${date ? `<span>最近 ${html(date)}</span>` : ''}
      </span>
    </span>
  </button>`
}

export function renderVenueCards(venues) {
  return `<div class="vn-grid">${venues.map(venueCard).join('')}</div>`
}

// Replace only #venue-results while typing so the search field keeps its selection and IME session.
export function renderVenueResults({
  venues = [],
  query = '',
  filter = 'all',
} = {}) {
  const words = normalized(query).split(/\s+/).filter(Boolean)
  const filtered = venues.filter((venue) => matches(venue, words, filter))
  if (!filtered.length) {
    return venues.length
      ? `<div class="vn-empty" role="status">${icon('search', 27)}<h3>没有找到匹配的店铺</h3><p>可以换个菜名，或调整筛选条件。</p></div>`
      : `<div class="vn-empty"><span class="vn-empty-icon">${icon('store', 30)}</span><h3>记下第一家店铺</h3><p>记下店名，就能在这里回看点过的菜和喜欢的饮品。</p><button type="button" class="solid" data-action="add-out">${icon('plus', 16)}记一次探店</button></div>`
  }
  return `<div class="vn-sectionline"><h2>${words.length || filter !== 'all' ? '匹配的店铺' : '店铺一览'}</h2><span class="entry-count" role="status">${filtered.length} 家</span></div>
    ${renderVenueCards(filtered)}`
}

function venueDetail(venue, renderCard) {
  const { key, name, entries, likedCount } = venue
  const image = venuePhoto(entries)
  const avg = average(venue)
  const lastDate = venueDate(venue.lastVisit)
  return `<section class="venues">
    <button type="button" class="vn-back" data-action="all-venues">${icon('back', 16)}全部店铺</button>
    <div class="vn-detail${image ? ' vn-has-image' : ''}">
      <div class="vn-detail-copy">
        <span class="vn-detail-visit">${icon('store', 17)}${lastDate ? `最近记录于 ${html(lastDate)}` : '店铺手记'}</span>
        <h2>${html(name)}</h2>
        ${venue.profile?.aliases?.length ? `<p class="venue-alias">也叫 ${html(venue.profile.aliases.join('、'))}</p>` : ''}
        ${venue.profile || entries.some((e) => !e.isSample) ? `<button type="button" class="vn-profile-link" data-action="edit-place" data-value="${html(key)}">${icon('pen', 13)}编辑店铺档案</button>` : ''}
        <div class="vn-metrics">
          <div><strong>${avg ? `${icon('star', 16)}${avg}` : '待评分'}</strong><span>平均评分</span></div>
          <div><strong>${entries.length}</strong><span>到店手记</span></div>
          <div><strong>${Number(likedCount) || 0}</strong><span>好评记录</span></div>
        </div>
        <div class="vn-actions">
          <button type="button" class="solid vn-add" data-action="add-at-venue" data-value="${html(key)}">${icon('plus', 16)}在这家店记一笔</button>
          <div class="vn-visit-plans"><button type="button" class="vn-revisit" data-action="venue-today" data-value="${html(key)}">${icon('calendar', 15)}今天去这家</button>
          ${entries[0] ? `<button type="button" class="vn-revisit" data-action="memory-plan" data-value="${html(entries[0].id)}">${icon('sprout', 15)}改天再去</button>` : ''}</div>
        </div>
      </div>
      ${image ? `<div class="vn-detail-photo"><img ${photoAttributes(image)} alt=""></div>` : ''}
    </div>
    <div class="vn-sectionline"><h2>这家店的手记</h2><span class="entry-count">${entries.length} 条</span></div>
    <div class="entry-grid">${entries.map((entry) => renderCard(entry)).join('')}</div>
  </section>`
}

export function renderVenues({
  venues = [],
  selectedKey = '',
  query = '',
  filter = 'all',
  renderCard,
} = {}) {
  const selected = venues.find((venue) => venue.key === selectedKey)
  if (selected) return venueDetail(selected, renderCard)
  return `<section class="venues">
    ${
      venues.length
        ? `<div class="vn-toolbar">
      <label class="vn-search">${icon('search', 18)}<input id="venue-search" type="search" placeholder="搜店名、菜品或饮品" aria-label="搜索店名、菜品或饮品" autocomplete="off" value="${html(query)}"></label>
      <label class="vn-filter">${icon('settings', 16)}<select id="venue-filter" aria-label="筛选店铺">${filters.map(([value, label]) => `<option value="${value}"${value === filter ? ' selected' : ''}>${label}</option>`).join('')}</select>${icon('down', 13)}</label>
    </div>`
        : ''
    }
    <button type="button" class="vn-profile-link" data-action="new-place">${icon('plus', 14)}新增店铺档案</button>
    <div id="venue-results">${renderVenueResults({ venues, query, filter })}</div>
  </section>`
}
