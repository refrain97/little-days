import { icon } from './icons.js'
import { showEditor } from './dialog-viewport.js'
import { quickListener } from './quick-listener.js'
import { voiceDraft } from './voice-draft.js'
import { blobDataUrl } from './media-store.js'
import { getAISettings, requestDeviceAI } from './device-ai.js'

const speechPreference = 'little-days.quick-voice.browser-dictation'
const tasteNames = { 好吃: '下次再来', 一般: '还行', 不合口味: '不合口味' }

function options(choices) {
  return choices
    .map(([value, label]) => `<option value="${value}">${label}</option>`)
    .join('')
}

export function openQuickVoice({ venues, saveEntry, savePlan }) {
  if (document.querySelector('.quick-voice[open]')) return
  const opener = document.activeElement
  const dialog = document.createElement('dialog')
  dialog.className = 'quick-voice'
  dialog.setAttribute('aria-labelledby', 'quick-voice-title')
  dialog.innerHTML = `<section class="qv-paper">
    <header><h2 id="quick-voice-title">${icon('mic', 22)} 语音速记</h2><button type="button" class="qv-close" data-close aria-label="关闭语音速记">${icon('x', 19)}</button></header>
    <div class="qv-scroll">
      <div data-listen>
        <div class="qv-listening"><span class="qv-bubble">${icon('mic', 27)}</span><div><strong data-status role="status">正在打开麦克风…</strong><div class="qv-wave" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i><i></i><i></i></div></div></div>
        <p data-heard class="qv-heard" hidden></p>
        <p data-guidance class="qv-hint"></p>
        <div data-browser-choice hidden><p class="qv-hint">浏览器听写可能把声音交给系统语音服务。这台设备会记住你的选择，仅用于「一起看」。</p><button type="button" class="qv-secondary" data-browser>启用浏览器听写</button></div>
        <button type="button" class="qv-secondary qv-type" data-type>${icon('pen', 16)} 改用文字</button>
        <label data-input-box hidden>我的原话<textarea data-input rows="3" placeholder="写一句，也可以用键盘上的麦克风听写"></textarea></label>
      </div>
      <div data-review hidden>
        <div class="qv-summary"><span data-destination></span><strong data-summary></strong><button type="button" data-tune aria-expanded="false">微调 ${icon('down', 13)}</button></div>
        <p data-tags class="qv-hint"></p>
        <audio data-player controls preload="metadata" hidden></audio>
        <div class="qv-fields" data-fields hidden>
          <label>收进<select data-target>${options([
            ['entry', '手记'],
            ['plan', '有空清单'],
          ])}</select></label>
          <label>名称<input data-name></label>
          <div data-entry-fields>
            <label>原话<textarea rows="2" data-original></textarea></label>
            <label>分类<select data-category>${options(['美食', '饮品', '灵感', '回忆'].map((x) => [x, x]))}</select></label>
            <div data-dining-fields>
              <label>来源<select data-dining>${options([
                ['', '未标记'],
                ['home', '自己做'],
                ['out', '出去吃'],
              ])}</select></label>
              <label data-venue-box>店名<input data-venue></label>
              <label>态度<select data-taste>${options([['', '未标记'], ...Object.entries(tasteNames)])}</select></label>
              <label class="qv-check"><input type="checkbox" data-breakfast> 早餐</label>
            </div>
          </div>
          <div data-plan-fields>
            <label>分类<select data-kind>${options([
              ['wish', '想做'],
              ['chore', '待办'],
            ])}</select></label>
            <label>日期<input type="date" data-date></label>
          </div>
        </div>
      </div>
      <p data-ai-note class="qv-hint" hidden></p>
      <p data-error class="qv-hint" role="status" hidden></p>
    </div>
    <footer><button type="button" data-visibility>一起看</button><button type="button" class="qv-primary" data-primary>完成</button></footer>
  </section>`
  const $ = (key) => dialog.querySelector(key)
  let phase = 'listening',
    visibility = 'shared',
    spoken = '',
    audio = null,
    audioURL = ''
  let listenState = {},
    browserSpeech = false,
    hadSpeech = false,
    closed = false,
    busy = false
  let aiJob,
    timer,
    originalTitle = '',
    draft
  const ai = getAISettings()
  function message(value = '') {
    $('[data-error]').textContent = value
    $('[data-error]').hidden = !value
  }
  const listener = quickListener({
    onChange(state) {
      listenState = state
      if (phase === 'listening') paintListening()
    },
    onWords(words) {
      if (closed) return
      spoken = words
      hadSpeech = true
      $('[data-heard]').textContent = words
      $('[data-heard]').hidden = !words || phase === 'typing'
    },
  })
  function allowBrowserSpeech() {
    return (
      visibility === 'shared' &&
      listener.hasSpeech &&
      (!listener.hasLocalSpeech || listenState.speechHint)
    )
  }
  function wantsAI() {
    return (
      visibility === 'shared' && ai.configured && navigator.onLine !== false
    )
  }
  function paintListening() {
    const {
      recording,
      transcribing,
      micHint = '',
      speechHint = '',
    } = listenState
    $('[data-status]').textContent =
      recording || transcribing
        ? '正在听你说…'
        : micHint || speechHint
          ? '换个方式记下来'
          : '正在打开麦克风…'
    dialog.toggleAttribute('data-hearing', Boolean(recording || transcribing))
    $('[data-guidance]').textContent = transcribing
      ? (browserSpeech
          ? '正在使用浏览器中文听写'
          : '正在使用设备上的中文听写') +
        (micHint ? '，此次保留听写文字。' : '。')
      : micHint + speechHint ||
        (recording
          ? '原声录制中，可以说完再整理。'
          : '也可以用键盘听写或打字。')
    $('[data-browser-choice]').hidden = !browserSpeech && !allowBrowserSpeech()
    $('[data-browser]').textContent = browserSpeech
      ? '关闭浏览器听写'
      : '启用浏览器听写'
    const send = wantsAI() && !transcribing && !spoken
    $('[data-ai-note]').hidden = !send
    $('[data-ai-note]').textContent = send
      ? '点「完成并转写」将本段原声发送至 ' +
        ai.origin +
        '（' +
        ai.model +
        '）。'
      : ''
    $('[data-primary]').textContent = send ? '完成并转写' : '完成'
  }
  function updateReview() {
    const isPlan = $('[data-target]').value === 'plan'
    const isDining = ['美食', '饮品'].includes($('[data-category]').value)
    $('[data-entry-fields]').hidden = isPlan
    $('[data-plan-fields]').hidden = !isPlan
    $('[data-dining-fields]').hidden = !isDining
    $('[data-venue-box]').hidden = $('[data-dining]').value !== 'out'
    $('[data-destination]').textContent = isPlan ? '有空' : '手记'
    $('[data-summary]').textContent =
      $('[data-name]').value.trim() || (isPlan ? '想做的事' : '一段语音')
    const dining = { home: '自己做', out: '出去吃' }[$('[data-dining]').value]
    const tags = isPlan
      ? [
          $('[data-kind]').value === 'chore' ? '待办' : '想做',
          $('[data-date]').value,
        ]
      : [
          $('[data-category]').value,
          ...(isDining
            ? [
                dining,
                dining === '出去吃' && $('[data-venue]').value,
                $('[data-breakfast]').checked && '早餐',
                tasteNames[$('[data-taste]').value],
              ]
            : []),
        ]
    $('[data-tags]').textContent = tags.filter(Boolean).join(' · ')
  }
  function fillReview(text) {
    draft = voiceDraft(text, venues)
    const { entry, plan, target } = draft
    const values = {
      target,
      name: target === 'plan' ? plan.title : entry.title,
      original: text,
      category: entry.category,
      dining: entry.diningSource,
      venue: entry.venueName,
      taste: entry.taste,
      kind: plan.kind,
      date: plan.date,
    }
    for (const [key, value] of Object.entries(values))
      $('[data-' + key + ']').value = value || ''
    originalTitle = values.name
    $('[data-breakfast]').checked = entry.isBreakfast
    updateReview()
  }
  function review(text) {
    phase = 'review'
    $('[data-listen]').hidden = true
    $('[data-review]').hidden = false
    $('[data-primary]').textContent = '存下来'
    $('[data-primary]').disabled = false
    $('[data-ai-note]').hidden = true
    if (audio && !audioURL) {
      audioURL = URL.createObjectURL(audio)
      $('[data-player]').src = audioURL
      $('[data-player]').hidden = false
    }
    fillReview(text)
  }
  function cancelAI() {
    aiJob?.abort()
    aiJob = null
    $('[data-ai-note]').hidden = true
  }
  async function transcribe() {
    if (!audio || !wantsAI()) return
    const controller = new AbortController()
    aiJob = controller
    $('[data-ai-note]').textContent = '正在转写，随时可以先保存原声。'
    $('[data-ai-note]').hidden = false
    const deadline = setTimeout(() => controller.abort(), 20000)
    try {
      const result = await requestDeviceAI({
        kind: 'voice',
        value: audio,
        destination: ai.endpoint,
        model: ai.model,
        visibility,
        signal: controller.signal,
      })
      if (closed || aiJob !== controller || visibility !== 'shared') return
      if (result.transcript?.trim()) {
        hadSpeech = true
        fillReview(result.transcript.trim())
        message()
      }
    } catch {
      if (!closed && aiJob === controller)
        message('这次未能转写，可以保存原声或在微调里补上文字。')
    } finally {
      clearTimeout(deadline)
      if (aiJob === controller) {
        aiJob = null
        $('[data-ai-note]').hidden = true
      }
    }
  }
  function setTyping() {
    if (phase !== 'listening') return
    phase = 'typing'
    clearTimeout(timer)
    $('[data-type]').hidden = true
    $('[data-browser-choice]').hidden = true
    $('[data-input-box]').hidden = false
    $('[data-heard]').hidden = true
    $('[data-guidance]').textContent = '点输入框即可打字或使用键盘听写。'
    $('[data-status]').textContent = '留一句原话'
    $('[data-input]').value = spoken
    $('[data-ai-note]').hidden = true
    $('[data-primary]').textContent = '完成'
    dialog.removeAttribute('data-hearing')
    void listener.stop().then((blob) => {
      if (!closed) audio = blob
    })
  }
  async function finish(sendAI) {
    if (busy) return
    const typing = phase === 'typing'
    clearTimeout(timer)
    busy = true
    $('[data-primary]').disabled = true
    const blob = await listener.stop()
    if (closed) return
    audio = blob
    const words = typing ? $('[data-input]').value.trim() : spoken
    busy = false
    $('[data-primary]').disabled = false
    if (!words && !audio) {
      setTyping()
      message('留一句话就可以收进手账。')
      return
    }
    message()
    review(words)
    if (sendAI && !typing && !words && audio) void transcribe()
  }
  async function save() {
    if (busy) return
    cancelAI()
    const isPlan = $('[data-target]').value === 'plan'
    const name = $('[data-name]').value.trim()
    if (!name && isPlan) {
      message('给这件事取个名字吧。')
      return
    }
    busy = true
    $('[data-primary]').disabled = true
    $('[data-close]').disabled = true
    $('[data-fields]').inert = true
    try {
      if (isPlan) {
        await savePlan({
          ...draft.plan,
          title: name,
          kind: $('[data-kind]').value,
          date: $('[data-date]').value,
          visibility,
        })
      } else {
        const text = $('[data-original]').value.trim()
        const entry = voiceDraft(text, venues).entry
        const category = $('[data-category]').value
        const dining = ['美食', '饮品'].includes(category)
        const taste = dining ? $('[data-taste]').value : ''
        const rating =
          taste === entry.taste
            ? entry.rating
            : { 好吃: 5, 一般: 3, 不合口味: 1 }[taste]
        await saveEntry({
          ...entry,
          title: name || entry.title,
          category,
          visibility,
          source: audio || hadSpeech ? 'voice' : 'text',
          audio: audio ? await blobDataUrl(audio) : '',
          diningSource: dining ? $('[data-dining]').value : '',
          venueName:
            dining && $('[data-dining]').value === 'out'
              ? $('[data-venue]').value.trim()
              : '',
          isBreakfast: dining && $('[data-breakfast]').checked,
          taste,
          rating,
        })
      }
      dialog.close()
    } catch (error) {
      message(
        error?.name === 'QuotaExceededError'
          ? '本机空间不足，草稿还在这里。'
          : error.message || '暂时没能保存，请再试一次。',
      )
    } finally {
      busy = false
      $('[data-primary]').disabled = false
      $('[data-close]').disabled = false
      $('[data-fields]').inert = false
    }
  }
  $('[data-type]').onclick = setTyping
  $('[data-browser]').onclick = () => {
    if (browserSpeech) {
      browserSpeech = false
      listener.stopSpeech(true)
      try {
        localStorage.removeItem(speechPreference)
      } catch {
        /* Only this session can remember the choice. */
      }
    } else if (allowBrowserSpeech()) {
      browserSpeech = listener.startSpeech(false)
      if (browserSpeech) {
        try {
          localStorage.setItem(speechPreference, 'yes')
        } catch {
          /* This session is sufficient. */
        }
      }
    }
    paintListening()
  }
  $('[data-visibility]').onclick = () => {
    if (busy) return
    visibility = visibility === 'shared' ? 'private' : 'shared'
    $('[data-visibility]').textContent =
      visibility === 'shared' ? '一起看' : '仅自己'
    if (visibility === 'private') {
      cancelAI()
      if (browserSpeech) {
        listener.stopSpeech(true)
        browserSpeech = false
      }
    }
    if (phase === 'listening') paintListening()
  }
  $('[data-primary]').onclick = () => {
    if (phase === 'review') return void save()
    // This button shows the destination before the user elects to send audio.
    void finish(!$('[data-ai-note]').hidden && wantsAI())
  }
  $('[data-tune]').onclick = () => {
    cancelAI()
    const fields = $('[data-fields]')
    fields.hidden = !fields.hidden
    $('[data-tune]').setAttribute('aria-expanded', String(!fields.hidden))
  }
  $('[data-fields]').oninput = (event) => {
    if (
      event.target === $('[data-target]') &&
      $('[data-name]').value === originalTitle
    ) {
      originalTitle =
        $('[data-target]').value === 'plan'
          ? draft.plan.title
          : draft.entry.title
      $('[data-name]').value = originalTitle
    }
    updateReview()
  }
  function dismiss() {
    if (!busy || phase !== 'review') dialog.close()
  }
  $('[data-close]').onclick = dismiss
  dialog.addEventListener('cancel', (event) => {
    event.preventDefault()
    dismiss()
  })
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) dismiss()
  })
  function cleanup() {
    if (closed) return
    closed = true
    clearTimeout(timer)
    cancelAI()
    listener.dispose()
    if (audioURL) URL.revokeObjectURL(audioURL)
    document.body.classList.remove('qv-open')
    window.removeEventListener('pagehide', leave)
    window.removeEventListener('hashchange', dismiss)
    dialog.remove()
    if (opener?.isConnected) opener.focus({ preventScroll: true })
  }
  function leave() {
    dialog.close()
    cleanup()
  }
  window.addEventListener('pagehide', leave)
  window.addEventListener('hashchange', dismiss)
  dialog.addEventListener('close', cleanup, { once: true })
  document.body.append(dialog)
  document.body.classList.add('qv-open')
  showEditor(dialog, $('.qv-scroll'), $('[data-close]'))
  paintListening()
  void listener.startMic()
  if (listener.hasLocalSpeech) listener.startSpeech(true)
  else if (listener.hasSpeech && !wantsAI()) {
    try {
      browserSpeech = localStorage.getItem(speechPreference) === 'yes'
    } catch {
      /* Ask before first use. */
    }
    if (browserSpeech) browserSpeech = listener.startSpeech(false)
  }
  timer = setTimeout(() => {
    if (phase === 'listening') void finish(false)
  }, 120000)
}
