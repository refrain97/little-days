import { showEditor, usesMobileShell } from './dialog-viewport.js'
import { authorBadge } from './cloud-profile.js'
import { icon } from './icons.js'
import { photoAttributes } from './gallery.js'

const kinds = {
  wish: '想做',
  chore: '待办',
  birthday: '生日',
  anniversary: '纪念日',
}
const settings = { any: '都可以', out: '出门', home: '宅家' }
const visibilityOptions = { shared: '一起看', private: '仅自己' }
const moods = { any: '随缘', out: '想出门', home: '想宅着' }
const marks = {
  wish: 'bulb',
  chore: 'list',
  birthday: 'sparkle',
  anniversary: 'heart',
}
const characters = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
}
const escape = (value) =>
  String(value ?? '').replace(/[&<>"']/g, (c) => characters[c])
const action = (name, value = '') =>
  `data-action="${escape(name)}" data-value="${escape(value)}"`
const yearly = (kind) => kind === 'birthday' || kind === 'anniversary'

function hintsFromTitle(text) {
  const housework =
    /(?:洗|刷|擦)(?:鞋|衣服|床单|衣物|窗户|碗|地板)|晾衣|叠衣|换床单|打扫|拖地|扫地|收拾(?:房间|屋子|厨房|衣柜)|整理(?:衣柜|书桌|抽屉)|清洗(?:冰箱|空调|洗衣机)/
  const errands =
    /取(?:件|快递|洗好的)|寄(?:件|快递)|还书|送洗|买菜|缴费|交水电费|续费|预约(?:体检|看牙)|买.{0,6}(?:生日礼物|日用品)/
  const out =
    /散步|徒步|看展|骑行|郊游|野餐|爬山|跑步|逛(?:逛|街|书店|花市)|(?:去|到).{0,8}(?:河边|公园|书店|电影院|美术馆|博物馆|咖啡馆|集市|菜市场)|取(?:件|快递)|寄(?:件|快递)|还书|送洗|买菜/
  const home =
    /宅家|在家|窝在家|烤(?:饼干|面包)|做(?:蛋糕|饼干)|读(?:书|小说)|拼图/
  const indoors = housework.test(text) || home.test(text)
  const outdoors = out.test(text)
  return {
    kind: housework.test(text) || errands.test(text) ? 'chore' : 'wish',
    setting: outdoors === indoors ? 'any' : outdoors ? 'out' : 'home',
  }
}

function asDay(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null
  const [y, m, d] = value.split('-').map(Number)
  return { y, m, d, stamp: Date.UTC(y, m - 1, d) }
}

function until(value, now) {
  const day = asDay(value)
  if (!day) return null
  return Math.round(
    (day.stamp - Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())) /
      86400000,
  )
}

function monthDay(value) {
  const day = asDay(value)
  return day ? `${day.m}月${day.d}日` : ''
}

function dayLabel(date, now) {
  const left = until(date, now)
  if (left === null) return ''
  if (left === 0) return '今天'
  if (left === 1) return '明天'
  if (left < 0) return `原定 ${monthDay(date)}`
  return monthDay(date)
}

function ideaCard(item, index) {
  const hasPhoto =
    typeof item.image === 'string' &&
    /^(?:\/(?!\/)|https?:\/\/|data:image\/|blob:)/i.test(item.image)
  const category = item.label || '小主意'
  return `<button type="button" class="ft-idea ft-tone-${index}" ${action(item.action, item.value)}>
    <span class="ft-idea-copy"><span class="ft-kicker">${icon(index === 0 ? 'sun' : 'sparkle', 14)}${escape(category)} ${authorBadge(item)}</span>
      <strong>${escape(item.title)}</strong>${item.detail ? `<span class="ft-reason">${escape(item.detail)}</span>` : ''}
      <span class="ft-idea-more" aria-hidden="true">${icon('arrow', 17)}</span>
    </span>${hasPhoto ? `<span class="ft-idea-img"><img ${photoAttributes(item.image, { thumbnail: true, lazy: index > 0 })} alt=""></span>` : ''}
  </button>`
}

function taskRow(row, now, archived = false) {
  const meta = [
    kinds[row.kind],
    settings[row.setting] && row.setting !== 'any' ? settings[row.setting] : '',
  ]
  if (archived && row.doneAt) {
    const done = new Date(row.doneAt)
    if (!Number.isNaN(done.getTime()))
      meta.push(
        `${done.getFullYear() === now.getFullYear() ? '' : done.getFullYear() + '年'}${done.getMonth() + 1}月${done.getDate()}日完成`,
      )
  } else if (row.date) meta.push(dayLabel(row.date, now))
  return `<li class="ft-task${archived ? ' ft-archived' : ''}">
    <button type="button" class="ft-state" ${action(archived ? 'restore-plan' : 'finish-plan', row.key)} aria-label="${escape((archived ? '还原' : '完成') + '「' + row.title + '」')}" title="${archived ? '还原' : '完成'}">${icon(archived ? 'refresh' : 'check', 15)}</button>
    <button type="button" class="ft-task-body" ${action(archived ? 'edit-plan' : 'view-plan', archived ? row.planId : row.key)}><strong>${escape(row.title)} ${authorBadge(row)}</strong><small>${escape(meta.filter(Boolean).join(' · '))}</small></button>
    ${archived && row.stage === 'task' ? `<button type="button" class="ft-write" ${action('journal-plan', row.key)} aria-label="${escape(row.title)}，${row.hasJournal ? '查看手记' : '记下这次'}">${icon(row.hasJournal ? 'book' : 'pen', 13)}${row.hasJournal ? '查看手记' : '记下这次'}</button>` : ''}
  </li>`
}

function dateRow(row, now, originalDate) {
  const date = row.eventDate || row.date
  const annual = monthDay(originalDate || date)
  const actual = monthDay(date)
  const meta = [
    kinds[row.kind],
    annual && '每年 ' + annual,
    actual && actual !== annual && '本次 ' + actual,
  ]
  const days = until(date, now)
  const countdown =
    days === 0
      ? '今天'
      : days === 1
        ? '明天'
        : days > 1
          ? `还有 ${days} 天`
          : ''
  return `<li><button type="button" class="ft-date-row" ${action('edit-plan', row.planId)}>
    <span class="ft-event-icon">${icon(marks[row.kind] || 'calendar', 19)}</span>
    <span><strong>${escape(row.planTitle)} ${authorBadge(row)}</strong><small>${escape(meta.filter(Boolean).join(' · '))}</small></span>
    <span class="ft-countdown">${escape(countdown)}</span>${icon('next', 13)}</button></li>`
}

function taskBlock(title, rows, empty, now, symbol) {
  return `<section class="ft-block"><header class="ft-block-head"><h3>${icon(symbol, 18)}${escape(title)}</h3>${rows.length ? `<span>${rows.length}</span>` : ''}</header>
    ${rows.length ? `<ul class="ft-rows">${rows.map((row) => taskRow(row, now)).join('')}</ul>` : `<p class="ft-empty">${escape(empty)}</p>`}</section>`
}

export function renderFreeTime({
  suggestions = [],
  mood = 'any',
  lists = {},
  plans = [],
  canShuffle = false,
  now = new Date(),
} = {}) {
  const open = lists.open || []
  const today = open.filter(
    (row) => row.stage === 'task' && until(row.date, now) === 0,
  )
  const todayKeys = new Set(today.map((row) => row.key))
  const soon = open.filter((row) => {
    if (todayKeys.has(row.key)) return false
    if (row.stage !== 'task') return true
    const left = until(row.date, now)
    return left !== null && left <= 14
  })
  const near = new Set(soon.map((row) => row.key))
  const later = open.filter(
    (row) => !todayKeys.has(row.key) && !near.has(row.key),
  )
  const upcoming =
    lists.upcoming ||
    plans
      .filter((p) => yearly(p.kind))
      .map((p) => ({
        planId: p.id,
        planTitle: p.title,
        kind: p.kind,
        date: p.date,
      }))
  const archived = lists.archive || []
  const dates = new Map(
    plans.filter((p) => yearly(p.kind)).map((p) => [p.id, p.date]),
  )
  return `<div class="ft-page">
    <section class="ft-picks" aria-label="此刻的主意">
      <div class="ft-pick-head"><h2>${icon('sparkle', 21)}此刻的主意</h2>
        <div class="ft-moods" role="group" aria-label="此刻想怎么过">${Object.entries(
          moods,
        )
          .map(
            ([id, label]) =>
              `<button type="button" ${action('free-mood', id)} aria-pressed="${mood === id}">${label}</button>`,
          )
          .join('')}</div>
      </div>
      ${suggestions.length ? `<div class="ft-ideas">${suggestions.slice(0, 2).map(ideaCard).join('')}</div>` : `<div class="ft-no-ideas"><p>这个场景还没有合适的主意。</p><button type="button" ${action('start-plan', 'wish')}>${icon('plus', 14)}记个想做</button></div>`}
      ${canShuffle ? `<button type="button" class="ft-shuffle" ${action('free-shuffle')}>${icon('refresh', 14)}换个主意</button>` : ''}
    </section>
    <div class="ft-lists"><div class="ft-list-main">
      ${taskBlock('今日打算', today, '今天还没有安排。', now, 'sun')}
      ${soon.length ? taskBlock('快到了', soon, '', now, 'clock') : ''}
      ${taskBlock('想做和待办', later, '想做的事可以随手记在这里。', now, 'bulb')}
    </div>
    <aside class="ft-list-side" aria-label="重要日子与归档">
      <section class="ft-block ft-dates"><header class="ft-block-head"><h3>${icon('calendar', 18)}重要日子</h3><button type="button" class="ft-small-btn" ${action('start-plan', 'birthday')} aria-label="添加重要日子">${icon('plus', 15)}添加</button></header>
        ${upcoming.length ? `<ul class="ft-rows">${upcoming.map((row) => dateRow(row, now, dates.get(row.planId))).join('')}</ul>` : '<p class="ft-empty">记下生日或纪念日，提前两周准备。</p>'}
      </section>
      <details class="ft-block ft-archive"><summary><span>${icon('check', 18)}已归档</span><small>${archived.length}</small>${icon('down', 15)}</summary>
        ${archived.length ? `<ul class="ft-rows">${archived.map((row) => taskRow(row, now, true)).join('')}</ul>` : '<p class="ft-empty">完成的事项会收在这里。</p>'}
      </details>
    </aside></div>
  </div>`
}

let currentEditor
export function openPlanEditor({
  plan = null,
  prefill = {},
  privateOnly = false,
  onSave,
  onDelete,
} = {}) {
  if (currentEditor?.isConnected) return currentEditor
  const initial = { ...prefill, ...plan }
  const editing = Boolean(plan?.id)
  const dialog = document.createElement('dialog')
  currentEditor = dialog
  dialog.className = 'ft-editor'
  dialog.setAttribute('aria-labelledby', 'ft-editor-title')
  dialog.innerHTML = `<form class="ft-editor-form">
    <header><h2 id="ft-editor-title">${editing ? '编辑事项' : yearly(initial.kind) ? '记个重要日子' : '记个想做'}</h2><button type="button" data-close aria-label="关闭">${icon('x', 18)}</button></header>
    <div class="ft-fields">
      <label class="ft-input"><span>名称</span><input data-title required autocomplete="off" type="text"></label>
      <fieldset><legend>分类</legend><div class="ft-editor-pills" data-kinds></div></fieldset>
      <fieldset><legend>场景</legend><div class="ft-editor-pills" data-settings></div></fieldset>
      <label class="ft-input"><span data-date-label>安排日期 <small>选填</small></span><input data-date type="date"></label>
      <p class="ft-year-hint" hidden>${icon('calendar', 14)}每年提前 14 天进入「快到了」，当天会单独列出。</p>
    </div>
    <footer><p class="ft-error" role="alert" hidden></p><div class="ft-save-line">
      ${editing && onDelete ? `<button type="button" data-delete class="ft-delete" aria-label="删除这件事">${icon('trash', 17)}</button>` : ''}
      <div class="ft-scope"><div class="ft-scope-options" data-visibilities role="group" aria-label="清单保存范围" aria-describedby="ft-scope-note"></div><small id="ft-scope-note"></small></div>
      <button type="submit" class="ft-save">${icon('check', 17)}${editing ? '保存修改' : '记下来'}</button>
    </div><div class="ft-confirm" hidden><p>删除这件事及相关归档记录？</p><button type="button" data-keep>保留</button><button type="button" data-erase>确认删除</button></div></footer>
  </form>`
  const $ = (selector) => dialog.querySelector(selector)
  const opener = document.activeElement
  const date = $('[data-date]')
  const title = $('[data-title]')
  title.value = initial.title || ''
  date.value = initial.date || ''
  let visibility =
    privateOnly || initial.visibility === 'private' ? 'private' : 'shared'
  let kind = Object.hasOwn(kinds, initial.kind) ? initial.kind : 'wish'
  let setting = Object.hasOwn(settings, initial.setting)
    ? initial.setting
    : 'any'
  const preservePrefill =
    editing || Boolean(initial.title || initial.sourceEntryId)
  let kindPinned = preservePrefill || kind !== 'wish'
  let settingPinned = preservePrefill || setting !== 'any'
  let busy = false
  const setError = (message) => {
    $('.ft-error').hidden = !message
    $('.ft-error').textContent = message
  }
  function sync() {
    for (const button of dialog.querySelectorAll('[data-kind]'))
      button.setAttribute('aria-pressed', String(button.dataset.kind === kind))
    for (const button of dialog.querySelectorAll('[data-setting]'))
      button.setAttribute(
        'aria-pressed',
        String(button.dataset.setting === setting),
      )
    for (const button of dialog.querySelectorAll('[data-visibility]'))
      button.setAttribute(
        'aria-pressed',
        String(button.dataset.visibility === visibility),
      )
    $('[data-visibility=shared]').disabled = privateOnly
    $('#ft-scope-note').textContent = privateOnly
      ? '来源手记仅自己可见'
      : visibility === 'shared'
        ? '连接后同步'
        : editing && initial.visibility === 'shared'
          ? '同步后撤回；旧 Git 历史可能保留'
          : '仅存这台设备'
    date.required = yearly(kind)
    $('[data-date-label]').innerHTML = yearly(kind)
      ? '日期'
      : '安排日期 <small>选填</small>'
    $('.ft-year-hint').hidden = !yearly(kind)
    title.placeholder =
      kind === 'birthday'
        ? '例如，妈妈的生日'
        : kind === 'anniversary'
          ? '例如，我们的结婚纪念日'
          : kind === 'chore'
            ? '例如，取回洗好的外套'
            : '例如，找个晴天去河边野餐'
  }
  function options(group, values, attr, choose) {
    for (const [id, name] of Object.entries(values)) {
      const button = document.createElement('button')
      button.type = 'button'
      button.dataset[attr] = id
      button.textContent = name
      button.onclick = () => {
        choose(id)
        sync()
      }
      group.append(button)
    }
  }
  options($('[data-kinds]'), kinds, 'kind', (id) => {
    kind = id
    kindPinned = true
  })
  options($('[data-settings]'), settings, 'setting', (id) => {
    setting = id
    settingPinned = true
  })
  options($('[data-visibilities]'), visibilityOptions, 'visibility', (id) => {
    visibility = id
  })
  title.oninput = () => {
    const hints = hintsFromTitle(title.value.trim())
    if (!kindPinned) kind = hints.kind
    if (!settingPinned) setting = hints.setting
    sync()
  }
  sync()
  function confirmDeletion(confirm) {
    $('.ft-save-line').hidden = confirm
    $('.ft-confirm').hidden = !confirm
    $('.ft-fields').inert = confirm
    if (confirm) $('[data-keep]').focus()
    else $('[data-delete]')?.focus()
  }
  async function commit(work) {
    if (busy) return
    busy = true
    setError('')
    for (const button of dialog.querySelectorAll('button'))
      button.disabled = true
    $('.ft-fields').inert = true
    try {
      await work()
      dialog.close()
    } catch (error) {
      setError(error?.message || '未能保存更改，请再试一次。')
    } finally {
      busy = false
      for (const button of dialog.querySelectorAll('button'))
        button.disabled = false
      $('.ft-fields').inert = !$('.ft-confirm').hidden
    }
  }
  $('[data-delete]')?.addEventListener('click', () => confirmDeletion(true))
  $('[data-keep]').onclick = () => confirmDeletion(false)
  $('[data-erase]').onclick = () => commit(() => onDelete(plan.id))
  $('.ft-editor-form').onsubmit = (event) => {
    event.preventDefault()
    if (!$('.ft-confirm').hidden) return
    if (!title.value.trim()) {
      setError('给这件事起个名字吧。')
      if (!usesMobileShell()) title.focus()
      return
    }
    const fields = {
      title: title.value.trim(),
      kind,
      setting,
      visibility,
      date: date.value,
    }
    if (editing) fields.id = plan.id
    if (initial.sourceEntryId) fields.sourceEntryId = initial.sourceEntryId
    void commit(() => onSave(fields))
  }
  $('[data-close]').onclick = () => {
    if (!busy) dialog.close()
  }
  dialog.oncancel = (event) => {
    if (busy) event.preventDefault()
  }
  let outside = false
  dialog.onpointerdown = (event) => {
    outside = event.target === dialog
  }
  dialog.onclick = (event) => {
    if (!busy && outside && event.target === dialog) dialog.close()
  }
  dialog.addEventListener(
    'close',
    () => {
      dialog.remove()
      currentEditor = null
      document.body.classList.remove('ft-edit-open')
      if (opener?.isConnected) opener.focus({ preventScroll: true })
    },
    { once: true },
  )
  document.body.classList.add('ft-edit-open')
  document.body.append(dialog)
  dialog.addEventListener(
    'invalid',
    (event) => {
      if (!usesMobileShell()) return
      event.preventDefault()
      setError(event.target === title ? '给这件事起个名字吧。' : '请选择日期。')
      event.target.scrollIntoView({ block: 'nearest' })
    },
    true,
  )
  showEditor(dialog, $('.ft-fields'), title)
  return dialog
}
