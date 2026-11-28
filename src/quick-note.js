import { icon } from './icons.js'
import { closeEditor, showEditor } from './dialog-viewport.js'
import { quickNoteDraft } from './quick-note-draft.js'

export function openQuickNote({ venues = [], saveEntry, savePlan }) {
  const existing = document.querySelector('dialog.quick-note[open]')
  if (existing) return existing
  const opener = document.activeElement
  const dialog = document.createElement('dialog')
  dialog.className = 'quick-note'
  dialog.setAttribute('aria-labelledby', 'quick-note-title')
  dialog.innerHTML = `<form class="quick-note-paper">
    <header><h2 id="quick-note-title">${icon('pen', 22)} 一句话速记</h2>
    <button type="button" data-close aria-label="关闭一句话速记">${icon('x', 18)}</button></header>
    <div class="quick-note-scroll">
      <textarea data-input aria-label="我的原话" rows="3" placeholder="点键盘右下角话筒直接说，或随手写一句…"></textarea>
      <p class="quick-note-error" role="alert" hidden></p>
    </div>
    <footer><select data-target aria-label="保存位置"><option value="entry">收进手记</option><option value="plan">收进有空</option></select>
      <button type="button" data-visibility title="切换保存范围" aria-pressed="false">一起看</button>
      <button type="submit" data-save>记下来</button>
    </footer></form>`
  const form = dialog.querySelector('form')
  const field = form.querySelector('[data-input]')
  const target = form.querySelector('[data-target]')
  const scope = form.querySelector('[data-visibility]')
  const close = form.querySelector('[data-close]')
  const submit = form.querySelector('[data-save]')
  const error = form.querySelector('[role=alert]')
  let override = false
  let onlyMe = false
  let saving = false

  function update() {
    const text = field.value.trim()
    submit.disabled = !text
    if (!text) override = false
    if (!override) target.value = quickNoteDraft(text, venues).target
    error.hidden = true
  }
  field.addEventListener('input', update)
  target.onchange = () => {
    override = true
  }
  scope.onclick = () => {
    onlyMe = !onlyMe
    scope.textContent = onlyMe ? '仅自己' : '一起看'
    scope.setAttribute('aria-pressed', String(onlyMe))
  }

  function dismiss() {
    if (!saving && dialog.open) closeEditor(dialog)
  }
  close.onclick = dismiss
  let backdropDown = false
  dialog.addEventListener('pointerdown', (event) => {
    backdropDown = event.target === dialog
  })
  dialog.addEventListener('click', (event) => {
    if (backdropDown && event.target === dialog) dismiss()
  })
  dialog.addEventListener('cancel', (event) => {
    event.preventDefault()
    dismiss()
  })
  form.onsubmit = async (event) => {
    event.preventDefault()
    if (saving || !field.value.trim()) return
    saving = true
    close.disabled = submit.disabled = scope.disabled = target.disabled = true
    field.readOnly = true
    error.hidden = true
    try {
      const draft = quickNoteDraft(field.value, venues)
      const visibility = onlyMe ? 'private' : 'shared'
      if ((override ? target.value : draft.target) === 'plan') {
        await savePlan({ ...draft.plan, visibility })
      } else {
        await saveEntry({ ...draft.entry, visibility })
      }
      closeEditor(dialog)
    } catch (issue) {
      error.textContent =
        issue?.name === 'QuotaExceededError'
          ? '设备空间不足。腾出一点空间后，可以从这里再保存一次。'
          : issue?.message || '暂时没有保存好，请再点一次。'
      error.hidden = false
    } finally {
      saving = false
      close.disabled =
        submit.disabled =
        scope.disabled =
        target.disabled =
          false
      field.readOnly = false
    }
  }

  dialog.addEventListener(
    'close',
    () => {
      window.removeEventListener('hashchange', dismiss)
      document.body.classList.remove('quick-note-open')
      dialog.remove()
      if (opener?.isConnected) opener.focus({ preventScroll: true })
    },
    { once: true },
  )
  window.addEventListener('hashchange', dismiss)
  document.body.append(dialog)
  document.body.classList.add('quick-note-open')
  update()
  showEditor(dialog, form.querySelector('.quick-note-scroll'), field)
  return dialog
}
