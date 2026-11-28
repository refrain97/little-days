import {
  breakfastKind,
  breakfastKinds,
  breakfastPeriod,
} from './breakfast-model.js'
import {
  addBreakfast,
  updateBreakfast,
  removeBreakfast,
  chooseBreakfast,
  readBreakfast,
} from './breakfast-store.js'
import { itemStamps } from './item-stamps.js'
import { toggleStamp } from './storage.js'
import { authorBadge } from './cloud-profile.js'
import { photoAttributes } from './gallery.js'
import { icon } from './icons.js'
import { recommendationQuote } from './journal.js'

const inspirations = [
  ['banana', '香蕉酸奶燕麦杯', 'quick', '把香蕉切进酸奶，最后抓一把即食燕麦。'],
  ['sesame', '芝麻花生酱吐司', 'quick', '薄薄抹一层花生酱，再撒几粒芝麻。'],
  ['omelet', '芝士蔬菜蛋饼', 'slow', '把喜欢的蔬菜切碎，和蛋液一起摊进锅里。'],
  ['porridge', '南瓜小米粥', 'slow', '把南瓜切成小块，和小米一起煮到软糯。'],
  ['soy', '街角的豆浆油条', 'buy', '路过早餐摊，带一杯豆浆和刚出锅的油条。'],
  ['bun', '热乎乎的小笼包', 'buy', '去附近的包子铺，打包一小笼。'],
].map(([id, title, kind, text]) => ({
  id: 'inspiration:' + id,
  title,
  kind,
  text,
}))

const escape = (s) =>
  String(s ?? '').replace(
    /[&<>"']/g,
    (char) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[
        char
      ],
  )
const action = (name, value = '') =>
  `data-action="breakfast-${name}" data-value="${escape(value)}"`
const kindLabel = (kind) =>
  icon(breakfastKinds[kind].icon, 16) + breakfastKinds[kind].label
const day = (d = new Date()) =>
  [d.getFullYear(), d.getMonth() + 1, d.getDate()]
    .map((n) => String(n).padStart(2, '0'))
    .join('-')

function timeLabel(item) {
  const words = [item.originalTextUnverified ? '' : item.text, item.notes]
    .filter(Boolean)
    .join(' ')
  const duration = words.match(
    /(?:约|大约)?\s*\d{1,3}(?:\.\d+)?(?:\s*[~～–至到-]\s*\d{1,3})?\s*(?:分钟|小时)/u,
  )
  if (duration) return duration[0].trim()
  if (item.kind === 'buy') return '取餐时间看排队'
  return item.kind === 'quick' ? '约5分钟' : '建议预留20–40分钟'
}

function toastSticker() {
  return `<svg class="bf-toast-art" viewBox="0 0 180 130" aria-hidden="true" fill="none" stroke-linecap="round" stroke-linejoin="round">
    <g transform="rotate(9 103 72)" stroke="#75513d" stroke-width="2.3">
    <path d="M71 54q-13-3-11-15c4-17 35-22 55-21 22 1 45 9 43 25-1 7-6 10-11 11l-4 43q-1 10-11 11l-55-3q-9-1-9-9z" fill="#b9855b" stroke="#fffaf0" stroke-width="10"/>
    <path d="M71 54q-13-3-11-15c4-17 35-22 55-21 22 1 45 9 43 25-1 7-6 10-11 11l-4 43q-1 10-11 11l-55-3q-9-1-9-9z" fill="#c79565"/>
    <path d="M67 52q-12-4-11-14c3-16 33-22 53-21 22 1 45 8 43 23-1 8-7 11-12 12l-4 43q-1 8-8 9l-54-3q-9-1-8-9z" fill="#f7ce8d"/>
    <path d="M72 45q-10-1-8-8c3-10 28-14 45-13 19 1 36 7 36 15 0 6-8 8-11 8l-4 44q-1 5-5 5l-48-3q-4 0-4-5l3-40z" fill="#fff0c4" stroke="#e6b379" stroke-width="1.5"/>
    <ellipse cx="87" cy="66" rx="2" ry="3" fill="#664733" stroke="none"/><ellipse cx="115" cy="66" rx="2" ry="3" fill="#664733" stroke="none"/>
    <path d="M96 71q5 6 11 0"/><ellipse cx="81" cy="73" rx="5" ry="2.8" fill="#efb2a0" stroke="none"/><ellipse cx="121" cy="73" rx="5" ry="2.8" fill="#efb2a0" stroke="none"/>
    </g><g stroke="#77543e" stroke-width="2"><path d="m33 32 2-7m7 11 6-4m-22-3-3-3"/>
    <path d="m143 97 1 5 5 2-5 2-1 5-2-5-5-2 5-2z" fill="#f4cc77"/></g></svg>`
}

export function createBreakfastView({
  entries,
  overlay,
  open,
  close,
  render,
  toast,
}) {
  let data = { ideas: [], choice: null }
  let selectedPeriod = '',
    filter = '',
    drawn = '',
    history = new Set()
  function items() {
    const memories = entries()
      .filter((row) => row.isBreakfast)
      .map((row) => ({
        ...row,
        id: 'entry:' + row.id,
        kind: breakfastKind(row),
        quote: recommendationQuote(row),
      }))
    return [...memories, ...data.ideas, ...inspirations]
  }
  const isBreakfast = () =>
    (selectedPeriod || breakfastPeriod()) === 'breakfast'
  const shown = () => items().filter((item) => !filter || item.kind === filter)
  const choiceToday = () =>
    data.choice?.day === day() &&
    items().find((item) => item.id === data.choice.id)
  const stamp = () =>
    `<span class="bf-stamp" data-breakfast-stamp>${icon('check', 15)}今日早餐已定</span>`
  function periodBar() {
    return `<div class="bf-period" role="group" aria-label="用餐时段">
      <button ${action('period', 'breakfast')} aria-pressed="${isBreakfast()}">${icon('sun')}早餐池</button>
      <button ${action('period', 'main')} aria-pressed="${!isBreakfast()}">${icon('food')}正餐吃啥</button></div>`
  }
  function pool() {
    const options = shown(),
      chosen = choiceToday()
    return `<section data-breakfast-pool class="bf-pool" aria-label="早餐专属推荐池">
      <div class="bf-cover">${toastSticker()}<div class="bf-cover-text"><h2>早饭吃什么？</h2>
      <button class="bf-draw" ${action('draw')} ${options.length ? '' : 'disabled'}>${icon('dice', 21)}摇一摇决定早饭</button></div></div>
      ${chosen ? `<p class="bf-decision">${stamp()}<b>${escape(chosen.title)}</b></p>` : ''}
      <div class="bf-filters" role="group" aria-label="早餐做法筛选">${Object.keys(
        breakfastKinds,
      )
        .map(
          (k) =>
            `<button class="bf-chip bf-${k}" ${action('filter', k)} aria-pressed="${filter === k}">${kindLabel(k)}</button>`,
        )
        .join('')}</div>
      <div class="bf-list-heading"><h2>早餐点子</h2><span>${options.length}</span><button class="bf-add" ${action('add')}>${icon('plus', 15)}塞个早餐点子</button></div>
      <ul class="bf-list">${options
        .map(
          (item) => `<li><button ${action('view', item.id)}>
        <span class="bf-mini bf-${item.kind}">${item.image ? `<img ${photoAttributes(item.image, { thumbnail: true })} alt="">` : icon(breakfastKinds[item.kind].icon, 20)}</span>
        <span class="bf-item-copy"><b>${escape(item.title)}</b><small>${breakfastKinds[item.kind].label}</small></span>
        ${authorBadge(item)}${icon('next', 14)}</button></li>`,
        )
        .join('')}</ul></section>`
  }
  function draw() {
    const options = shown()
    if (!options.length) return
    let remaining = options.filter((item) => !history.has(item.id))
    if (!remaining.length) {
      history.clear()
      remaining =
        options.length > 1
          ? options.filter((item) => item.id !== drawn)
          : options
    }
    const pick = remaining[Math.floor(Math.random() * remaining.length)]
    showSlip(pick)
  }
  function showSlip(item) {
    drawn = item.id
    history.add(drawn)
    const chosen = choiceToday()?.id === drawn
    const words = item.id.startsWith('entry:') ? item.quote : item.text
    const savedIdea = data.ideas.some((idea) => idea.id === item.id)
    open(
      `<div class="bf-slip">
      <button class="close-sheet" data-action="close" aria-label="收起早餐签">${icon('x', 18)}</button>
      <div class="bf-slip-tags"><span class="bf-chip bf-${item.kind}">${kindLabel(item.kind)}</span>
      <span class="bf-time">${icon('clock', 15)}${escape(timeLabel(item))}</span></div>
      <h2>${escape(item.title)}</h2>
      ${item.image ? `<div class="bf-slip-photo"><img ${photoAttributes(item.image)} alt="${escape(item.title)}"></div>` : ''}
      ${words ? `<p class="bf-quote">${escape(words)}</p>` : ''}
      ${authorBadge(item)}
      ${savedIdea ? itemStamps(item, 'breakfast') : ''}
      <div class="bf-actions">${chosen ? stamp() : `<button class="bf-accept" ${action('accept', drawn)}>${icon('check', 17)}就吃这个！</button>`}
      <button ${action('next')} ${shown().length < 2 ? 'disabled' : ''}>${icon('refresh', 16)}换一张</button>${savedIdea ? `<button ${action('edit', item.id)}>${icon('pen', 15)}编辑</button>` : ''}</div>
    </div>`,
      '早餐抽签',
    )
  }
  function editIdea(original) {
    const editing = Boolean(original)
    const heading = editing ? '编辑早餐点子' : '塞个早餐点子'
    open(
      `<div class="bf-form-wrap"><button class="close-sheet" data-action="close" aria-label="关闭早餐点子">${icon('x', 18)}</button>
      <h2>${heading}</h2>
      <form data-breakfast-form><label class="bf-name">早餐名字<input name="title" value="${escape(original?.title || '')}" maxlength="80" required autocomplete="off" placeholder="比如，热豆浆配饭团"></label>
      <fieldset class="bf-form-kinds"><legend>做法</legend>${Object.keys(
        breakfastKinds,
      )
        .map(
          (k) =>
            `<label class="bf-chip bf-${k}"><input type="radio" name="kind" value="${k}" ${k === (original?.kind || filter || 'quick') ? 'checked' : ''}><span>${kindLabel(k)}</span></label>`,
        )
        .join('')}</fieldset>
      <div class="bf-form-footer"><label>可见范围<select name="visibility"><option value="shared">一起看</option><option value="private" ${original?.visibility === 'private' ? 'selected' : ''}>仅自己</option></select></label>
      <button type="submit" class="bf-accept">${icon(editing ? 'check' : 'plus', 17)}${editing ? '保存修改' : '放进早餐池'}</button></div>
      ${editing ? `<button type="button" class="bf-remove" ${action('remove', original.id)}>移除这个点子</button>` : ''}
      <p hidden role="alert" class="bf-error"></p></form></div>`,
      heading,
    )
    const form = overlay.querySelector('[data-breakfast-form]')
    form.onsubmit = async (event) => {
      event.preventDefault()
      const submit = form.querySelector('[type=submit]')
      if (submit.disabled) return
      submit.disabled = true
      try {
        const { title, kind, visibility } = form.elements
        const idea = editing
          ? await updateBreakfast(
              original.id,
              title.value,
              kind.value,
              visibility.value,
              original,
            )
          : await addBreakfast(title.value, kind.value, visibility.value)
        await reload()
        if (form.isConnected) {
          if (filter && filter !== idea.kind) filter = idea.kind
          close()
        }
        render()
        toast('早餐点子已收好')
      } catch (error) {
        const message = form.querySelector('[role=alert]')
        message.hidden = false
        message.textContent = error.message || '暂时没有存好，请再试一次。'
        submit.disabled = false
      }
    }
  }
  async function handle(key, value) {
    switch (key) {
      case 'breakfast-period':
        if (!['main', 'breakfast'].includes(value)) return
        selectedPeriod = value
        render({ resetScroll: true })
        break
      case 'breakfast-filter':
        if (!Object.hasOwn(breakfastKinds, value)) return
        filter = filter === value ? '' : value
        history.clear()
        render()
        break
      case 'breakfast-edit': {
        const idea = data.ideas.find((row) => row.id === value)
        if (idea) editIdea(idea)
        break
      }
      case 'breakfast-remove': {
        const idea = data.ideas.find((row) => row.id === value)
        if (!idea) return
        open(
          `<div class="bf-form-wrap"><h2>移除早餐点子？</h2><p>${escape(idea.title)}</p><div class="bf-actions"><button ${action('edit', value)}>留着</button><button class="bf-accept" ${action('confirm-remove', value)}>确认移除</button></div></div>`,
          '移除早餐点子',
        )
        break
      }
      case 'breakfast-confirm-remove':
        await removeBreakfast(value)
        await reload()
        close()
        render()
        toast('已移除早餐点子')
        break
      case 'breakfast-add':
        editIdea(null)
        break
      case 'breakfast-draw':
      case 'breakfast-next':
        draw()
        break
      case 'breakfast-view': {
        const item = shown().find((item) => item.id === value)
        if (item) showSlip(item)
        break
      }
      case 'breakfast-accept': {
        const item = items().find(
          (item) => item.id === value && item.id === drawn,
        )
        const button = overlay.querySelector('[data-action="breakfast-accept"]')
        if (!button || button.disabled || !item) return
        button.disabled = true
        try {
          const choice = await chooseBreakfast(item.id, day())
          data = { ...data, choice }
          render()
          if (button.isConnected) showSlip(item)
        } finally {
          button.disabled = false
        }
        break
      }
    }
  }
  async function reload() {
    data = await readBreakfast()
  }
  return {
    isBreakfast,
    periodBar,
    pool,
    reload,
    handle,
    ideas: () => data.ideas,
    async respond(id, stamp) {
      await toggleStamp(id, stamp, 'breakfast')
      await reload()
      render()
      const idea = data.ideas.find((row) => row.id === id)
      if (idea && drawn === id && overlay.querySelector('.bf-slip')) {
        showSlip(idea)
        const details = overlay.querySelector('.item-stamps')
        if (details) details.open = true
      }
    },
    resetPeriod: () => {
      selectedPeriod = ''
    },
  }
}
