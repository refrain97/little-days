import { showEditor, usesMobileShell } from './dialog-viewport.js'
import {
  getAISettings,
  prepareJournalPhoto,
  readPhotoTextLocally,
  requestDeviceAI,
} from './device-ai.js'
import { blobDataUrl, dataMediaBinary } from './media-store.js'
import { recordingType, startAudioRecorder } from './audio-recorder.js'
import { assetPath } from './paths.js'
import {
  CATEGORIES,
  createEntry,
  extractEntry,
  inferDining,
  tasteForRating,
  venueKey,
} from './journal.js'

const symbols = {
  close: '<path d="m6 6 12 12M18 6 6 18"/>',
  pen: '<path d="m4 16-.7 4.7L8 20 19.5 8.5l-4-4Z"/><path d="m13.5 6.5 4 4"/>',
  camera:
    '<path d="M3 7.5h4l1.8-3h6.4l1.8 3h4v12H3z"/><circle cx="12" cy="13" r="3.2"/>',
  mic: '<rect x="9" y="3" width="6" height="12" rx="3"/><path d="M5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v3m-3 0h6"/>',
  photo:
    '<rect x="3" y="4" width="18" height="16" rx="3"/><circle cx="8.5" cy="9.5" r="1.5"/><path d="m4 18 5-5 3 3 3.5-4 4.5 5"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  check: '<path d="m4 12 5 5L20 6"/>',
  arrow: '<path d="m7 10 5 5 5-5"/>',
  star: '<path d="m12 2.7 2.8 5.8 6.4.9-4.6 4.5 1.1 6.3-5.7-3-5.7 3 1.1-6.3L2.8 9.4l6.4-.9z"/>',
  sparkle:
    '<path d="m10 3 1.9 5.6L17.5 11l-5.6 2.2L10 19l-2-5.8L2.5 11 8 8.6ZM18.7 2v5.4M16 4.7h5.4"/>',
  stop: '<rect x="6" y="6" width="12" height="12" rx="2" fill="currentColor" stroke="none"/>',
  cal: '<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M7 3v4m10-4v4M3 10h18"/>',
  together:
    '<circle cx="8" cy="8" r="2.8"/><path d="M3 18v-1a5 5 0 0 1 10 0v1M15 5.4a2.7 2.7 0 1 1 0 5.2M16 13a4.7 4.7 0 0 1 5 4.8"/>',
  lock: '<rect x="5" y="10" width="14" height="10" rx="2.4"/><path d="M8 10V7a4 4 0 1 1 8 0v3M12 14v2"/>',
  glad: '<circle cx="12" cy="12" r="9"/><path d="M8.3 13.7a4.1 4.1 0 0 0 7.4 0M8.4 9h.1m6.9 0h.1"/>',
  okay: '<circle cx="12" cy="12" r="9"/><path d="M8.8 14.5h6.4M8.4 9h.1m6.9 0h.1"/>',
  nope: '<circle cx="12" cy="12" r="9"/><path d="M8.8 16a3.8 3.8 0 0 1 6.4 0M8.4 9h.1m6.9 0h.1"/>',
}

function icon(name, size = 18) {
  return (
    '<svg aria-hidden="true" width="' +
    size +
    '" height="' +
    size +
    '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">' +
    symbols[name] +
    '</svg>'
  )
}

const diningCategories = ['美食', '饮品']
const attitudes = {
  好吃: { label: '下次再来', icon: 'glad', stars: 5 },
  一般: { label: '还行', icon: 'okay', stars: 3 },
  不合口味: { label: '不合口味', icon: 'nope', stars: 1 },
}
let activeDialog
export function attitudeLabel(value) {
  return attitudes[value]?.label || ''
}

export function openCapture({
  record = null,
  onSave,
  mode,
  venues = [],
  defaultDiningSource = '',
  defaultVenueName = '',
  privateOnly = false,
} = {}) {
  if (activeDialog && activeDialog.isConnected) return activeDialog
  const initialMode = mode || record?.source || 'text'
  const editing = Boolean(record?.id)
  const dialog = document.createElement('dialog')
  activeDialog = dialog
  dialog.className = 'life-capture'
  dialog.setAttribute('aria-labelledby', 'life-capture-title')
  dialog.innerHTML = `
    <form class="lc-form">
      <header class="lc-head"><div><h2 id="life-capture-title">${editing ? '编辑手记' : '记一笔'}</h2><div class="lc-date">${icon('cal', 13)}<time></time></div></div>
        <button type="button" class="lc-icon-btn" data-close aria-label="关闭记录窗口">${icon('close')}</button>
      </header>
      <div class="lc-scroll">
        <label class="lc-field lc-content"><span data-text-label>我的原话</span><textarea data-body rows="3" placeholder="记下此刻想说的话…"></textarea></label>
        <div class="lc-modes" role="group" aria-label="记录方式">
          <button type="button" data-mode="text">${icon('pen')}文字</button><button type="button" data-mode="photo">${icon('camera')}照片</button><button type="button" data-mode="voice">${icon('mic')}语音</button>
        </div>
        <div class="lc-photo-tools" hidden>
          <button type="button" data-pick-photo>${icon('photo', 23)}<span>从相册选择</span></button>
          <button type="button" data-take-photo>${icon('camera', 23)}<span>拍一张</span></button>
        </div>
        <input type="file" accept="image/*" hidden data-gallery>
        <input type="file" accept="image/*" capture="environment" hidden data-camera>
        <div class="lc-picture" hidden><img alt="本条记录的照片"><button type="button" class="lc-media-clear" data-remove-image aria-label="移除照片">${icon('close', 15)}</button></div>
        <p class="lc-status" data-photo-status role="status" hidden></p>
        <div class="lc-voice" hidden><div class="lc-rec-controls"><button type="button" class="lc-recorder" data-record-audio><span class="lc-mic-circle">${icon('mic', 21)}</span><span data-voice-label>开始录音</span><span data-timer></span></button><button type="button" class="lc-text-btn" data-import-audio>导入录音</button></div><p class="lc-hint" data-voice-hint></p></div>
        <p class="lc-status" data-voice-status role="status" hidden></p>
        <input type="file" accept="audio/*" hidden data-audio-file>
        <div class="lc-player" hidden><audio controls preload="metadata"></audio><button type="button" class="lc-icon-btn" data-remove-audio aria-label="移除语音">${icon('close', 15)}</button></div>
        <div class="lc-ai-actions" hidden><button type="button" data-ai-kind="photo">AI 识别照片</button><button type="button" data-ai-kind="voice">AI 转写录音</button><button type="button" data-ai-kind="text">AI 整理原话</button></div>
        <div class="lc-ai-confirm" hidden><p data-ai-disclosure></p><div><button type="button" data-ai-cancel>取消</button><button type="button" data-ai-send>确认发送</button></div></div>
        <p class="lc-status" data-ai-status role="status" hidden></p>
        <div class="lc-attitudes" data-taste-row hidden><span class="lc-label">这次感觉</span><div class="lc-tastes" role="group" aria-label="这次的态度"></div></div>
        <details class="lc-options"><summary>${icon('sparkle', 15)}<span data-summary></span><span class="lc-tweak">微调 ${icon('arrow', 15)}</span></summary>
        <div class="lc-tune">
        <div class="lc-row"><span class="lc-label">分类</span><div class="lc-categories" role="group" aria-label="记录分类"></div></div>
        <div class="lc-row" data-dining-row hidden><span class="lc-label">来源</span>
          <div class="lc-dining" role="group" aria-label="饮食来源"><button type="button" data-dining="home">自己做</button><button type="button" data-dining="out">出去吃</button></div>
        </div>
        <div class="lc-venue" hidden><label class="lc-field"><span>店名 <small>选填</small></span><input data-venue type="text" autocomplete="off" placeholder="这次去了哪家店？"></label><div class="lc-venue-picks" role="group" aria-label="去过的店" hidden></div></div>
        <div class="lc-row"><span class="lc-label">星级</span><div class="lc-rating" role="group" aria-label="为这条手记评分"></div><button type="button" class="lc-text-btn" data-clear-rating hidden>清除评分</button></div>
          <label class="lc-field"><span>标题</span><input type="text" data-title maxlength="100" placeholder="根据内容自动生成"></label>
          <label class="lc-field"><span>备注</span><textarea data-notes rows="2" placeholder="还有什么想记住的？"></textarea></label>
          <section class="lc-extract" aria-label="自动整理" hidden><div data-extracted></div></section>
        </div></details>
      </div>
      <footer class="lc-footer"><p class="lc-revoke-note" role="status" hidden>同步会撤回共享版本，已存在的 Git 历史或对方备份仍可能保留。</p><p class="lc-error" role="alert" hidden></p><div class="lc-save-line"><div class="lc-visibility" role="group" aria-label="手记保存范围"><button type="button" data-visibility="shared">${icon('together', 15)}一起看</button><button type="button" data-visibility="private">${icon('lock', 15)}仅自己</button></div><button type="submit" class="lc-submit">${icon('check', 18)} <span data-save-label>${editing ? '保存修改' : '存入手记'}</span></button></div></footer>
    </form>`
  const $ = (selector) => dialog.querySelector(selector)
  const all = (selector) => Array.from(dialog.querySelectorAll(selector))
  const editor = $('[data-body]')
  const title = $('[data-title]')
  const notes = $('[data-notes]')
  const venueInput = $('[data-venue]')
  const venueHistory = [
    ...new Set(
      venues
        .filter((name) => typeof name === 'string')
        .map((name) => name.trim())
        .filter(Boolean),
    ),
  ]
  const initialDining = record
    ? record.diningSource
    : defaultDiningSource || (defaultVenueName ? 'out' : '')
  const scopedDining = !editing && ['out', 'home'].includes(initialDining)
  const SpeechAPI = window.SpeechRecognition || window.webkitSpeechRecognition
  // Older Web Speech implementations may send audio to the browser vendor.
  const Speech =
    SpeechAPI && 'processLocally' in SpeechAPI.prototype ? SpeechAPI : null
  const canRecord = Boolean(
    navigator.mediaDevices?.getUserMedia && window.MediaRecorder,
  )
  const opener = document.activeElement
  let source = ['text', 'photo', 'voice'].includes(initialMode)
    ? initialMode
    : 'text'
  let category = record?.category || '回忆'
  let categoryChosen = Boolean(record?.category)
  let diningSource = ['home', 'out'].includes(initialDining)
    ? initialDining
    : ''
  let diningPinned = Boolean(diningSource)
  let venueName =
    diningSource === 'out'
      ? String(record ? record.venueName || '' : defaultVenueName).trim()
      : ''
  let venuePinned = Boolean(venueName)
  const savedRating = Number(record?.rating) || 0
  const savedTaste = record?.taste || tasteForRating(savedRating)
  const oldWords = extractEntry(record?.text || '')
  let taste = savedTaste
  let rating = savedRating
  let opinionChosen = false
  let startedWithAttitude = false
  let visibility =
    privateOnly || record?.visibility === 'private' ? 'private' : 'shared'
  const previews = new Map()
  let photo = record?.image || ''
  let photoThumbnail = null
  let audio = record?.audio || ''
  let photoText = record?.photoDescription || ''
  const unverifiedOriginal =
    record?.originalTextUnverified ??
    (editing &&
      !record.isSample &&
      record.source === 'photo' &&
      !Object.hasOwn(record, 'photoDescription'))
  let aiPhoto = null
  let aiWords = null
  let aiConsent = null
  let activeAI = null
  let photoVersion = 0
  let photoBusy = false
  let photoJob = null
  let hasTranscript = false
  let stopping = null
  let recorder = null
  let stream = null
  let recognition = null
  let audioReady = null
  let importedAudio = null
  let recognitionDone = null
  let starting = false
  let listening = false
  let saving = false
  let disposed = false
  let interval = 0
  let timerStart = 0
  let computed = {}
  const date = new Date(record?.createdAt || Date.now())
  $('time').dateTime = date.toISOString()
  $('time').textContent = new Intl.DateTimeFormat('zh-CN', {
    month: 'long',
    day: 'numeric',
    weekday: 'long',
  }).format(date)
  editor.value = record?.text || ''
  title.value = record?.title || ''
  notes.value = record?.notes || ''
  const showStatus = (selector, message) => {
    const element = $(selector)
    element.textContent = message
    element.hidden = !message
  }

  function choices(container, options, attr, handler) {
    for (const value of options) {
      const button = document.createElement('button')
      button.type = 'button'
      button.dataset[attr] = String(value)
      button.textContent = value
      button.addEventListener('click', () => handler(value))
      container.append(button)
    }
  }
  choices($('.lc-categories'), CATEGORIES, 'category', (value) => {
    category = value
    categoryChosen = true
    if (!diningCategories.includes(value)) {
      diningSource = ''
      diningPinned = false
      venueName = ''
      venuePinned = false
    }
    refreshExtraction()
  })
  all('[data-dining]').forEach((button) => {
    button.onclick = () => {
      diningSource =
        diningSource === button.dataset.dining ? '' : button.dataset.dining
      diningPinned = true
      if (diningSource !== 'out') {
        venueName = ''
        venuePinned = false
      }
      refreshExtraction()
    }
  })
  venueInput.oninput = () => {
    venueName = venueInput.value
    diningPinned = true
    venuePinned = true
    renderVenueSuggestions()
    updateSummary()
  }
  function renderVenueSuggestions() {
    const group = $('.lc-venue-picks')
    const needle = venueName.trim().toLocaleLowerCase()
    const matches = venueHistory
      .filter((name) => {
        const key = name.toLocaleLowerCase()
        return key !== needle && key.includes(needle)
      })
      .slice(0, 4)
    group.replaceChildren()
    group.hidden = !matches.length
    choices(group, matches, 'pickVenue', (value) => {
      venueName = value
      venueInput.value = value
      diningPinned = true
      venuePinned = true
      renderVenueSuggestions()
      updateSummary()
      $('[data-dining="out"]').focus({ preventScroll: true })
    })
  }
  choices($('.lc-tastes'), Object.keys(attitudes), 'taste', (value) => {
    if (!categoryChosen && !editor.value.trim() && category === '回忆') {
      startedWithAttitude = true
      category = '美食'
    }
    if (tasteForRating(rating) !== value) rating = attitudes[value].stars
    taste = value
    opinionChosen = true
    updateSelections()
  })
  all('[data-taste]').forEach((button) => {
    const attitude = attitudes[button.dataset.taste]
    button.innerHTML = icon(attitude.icon, 16) + attitude.label
  })
  choices($('.lc-rating'), [1, 2, 3, 4, 5], 'rating', (value) => {
    rating = value
    taste = tasteForRating(rating)
    opinionChosen = true
    updateSelections()
  })
  $('[data-clear-rating]').onclick = () => {
    rating = 0
    taste = ''
    opinionChosen = true
    startedWithAttitude = false
    refreshExtraction()
  }
  all('[data-visibility]').forEach((button) => {
    if (privateOnly) {
      button.hidden = button.dataset.visibility !== 'private'
      button.setAttribute('aria-disabled', 'true')
      $('.lc-visibility').setAttribute(
        'aria-label',
        '原事项仅自己，手记保存范围固定为仅自己',
      )
    }
    button.onclick = () => {
      if (privateOnly) return
      if (visibility !== button.dataset.visibility) cancelAI()
      visibility = button.dataset.visibility
      updateSelections()
    }
  })
  for (const button of all('[data-rating]')) {
    button.innerHTML = icon('star', 23)
    button.setAttribute('aria-label', button.dataset.rating + ' 分')
    button.title = button.dataset.rating + ' 分'
  }
  function updateSummary() {
    const blank =
      !record &&
      !categoryChosen &&
      !scopedDining &&
      !editor.value.trim() &&
      !photo &&
      !audio &&
      !rating
    const details = [blank ? '分类与备注' : category]
    if (diningCategories.includes(category)) {
      if (diningSource)
        details.push(diningSource === 'home' ? '自己做' : '出去吃')
      if (diningSource === 'out' && venueName.trim())
        details.push(venueName.trim())
      if (attitudes[taste]) details.push(attitudes[taste].label)
    } else if (rating) details.push(rating + ' 星')
    const summary = $('[data-summary]')
    summary.textContent = details.join(' · ')
    summary.title = summary.textContent
  }
  function updateSelections() {
    all('[data-category]').forEach((b) =>
      b.setAttribute('aria-pressed', String(b.dataset.category === category)),
    )
    all('[data-taste]').forEach((b) => {
      b.setAttribute('aria-pressed', String(b.dataset.taste === taste))
    })
    all('[data-visibility]').forEach((b) =>
      b.setAttribute(
        'aria-pressed',
        String(b.dataset.visibility === visibility),
      ),
    )
    all('[data-rating]').forEach((b) => {
      b.classList.toggle('lc-filled', Number(b.dataset.rating) <= rating)
      b.setAttribute(
        'aria-pressed',
        String(Number(b.dataset.rating) === rating),
      )
    })
    $('.lc-revoke-note').hidden =
      !editing || record.visibility === 'private' || visibility !== 'private'
    const isDining = diningCategories.includes(category)
    $('[data-clear-rating]').hidden = !rating && !(isDining && taste)
    const stillStarting =
      !editing &&
      !categoryChosen &&
      category === '回忆' &&
      editor.value.trim().length < 4
    $('[data-taste-row]').hidden = !isDining && !stillStarting
    $('[data-dining-row]').hidden = !isDining
    all('[data-dining]').forEach((b) =>
      b.setAttribute('aria-pressed', String(b.dataset.dining === diningSource)),
    )
    $('.lc-venue').hidden = !isDining || diningSource !== 'out'
    if (venueInput.value !== venueName) venueInput.value = venueName
    if (!$('.lc-venue').hidden) renderVenueSuggestions()
    updateSummary()
    renderAI()
  }
  function updateTextLabel() {
    const historical =
      unverifiedOriginal && editor.value.trim() === (record?.text || '').trim()
    $('[data-text-label]').textContent = historical
      ? '原记录内容'
      : source === 'voice'
        ? '我的原话 · 语音转写'
        : '我的原话'
  }
  function refreshExtraction() {
    const ownText = editor.value.trim()
    const text = [
      ownText,
      photoText && !ownText.includes(photoText) ? photoText : '',
    ]
      .filter(Boolean)
      .join('\n')
    const own = extractEntry(ownText)
    const unchanged =
      record &&
      ownText === (record.text || '').trim() &&
      photoText === (record.photoDescription || '')
    if (unchanged) {
      computed = {
        title: record.title,
        category: record.category,
        taste: record.taste,
        ingredients: record.ingredients,
        steps: record.steps,
        feeling: record.feeling,
      }
    } else if (text === ownText) {
      computed = ownText ? own : {}
    } else {
      computed = extractEntry(text)
    }
    const structured = aiWords?.original === ownText ? aiWords.fields : aiPhoto
    if (structured) {
      for (const field of [
        'title',
        'category',
        'ingredients',
        'steps',
        'feeling',
      ]) {
        if (structured[field]?.length) computed[field] = structured[field]
      }
    }
    const retainDining =
      editing && ownText.trim() === (record.text || '').trim()
    let inferred = retainDining ? record : inferDining(ownText, venueHistory)
    if (
      structured?.venueName &&
      !inferred.venueName &&
      inferred.diningSource !== 'home'
    ) {
      inferred = { diningSource: 'out', venueName: structured.venueName }
    }
    updateTextLabel()
    if (!categoryChosen) {
      category = computed.category || '回忆'
      if (
        category === '回忆' &&
        (scopedDining ||
          (startedWithAttitude && !ownText) ||
          (diningPinned && diningSource) ||
          inferred.diningSource)
      )
        category = '美食'
    }
    if (diningCategories.includes(category)) {
      if (!diningPinned) diningSource = inferred.diningSource || ''
      if (!venuePinned)
        venueName = diningSource === 'out' ? inferred.venueName || '' : ''
    }
    if (!opinionChosen) {
      const freshScore =
        own.rating && (!editing || own.rating !== oldWords.rating)
      rating = freshScore ? own.rating : savedRating
      if (freshScore) taste = tasteForRating(rating)
      else if (savedRating || (unchanged && savedTaste)) taste = savedTaste
      else if (
        !editing ||
        (ownText !== record.text && own.taste !== oldWords.taste)
      )
        taste = own.taste || ''
      else taste = savedTaste
    }
    title.placeholder = computed.title || '根据内容自动生成'
    const rows = [
      ['照片', photoText],
      ['食材', computed.ingredients?.join('、')],
      ['做法', computed.steps?.join(' ')],
      ['感受', computed.feeling],
    ].filter(([, value]) => value)
    $('.lc-extract').hidden = !rows.length
    const result = $('[data-extracted]')
    result.replaceChildren()
    rows.forEach(([label, value]) => {
      const row = document.createElement('p')
      const key = document.createElement('strong')
      key.textContent = label
      row.append(key, document.createTextNode(String(value)))
      result.append(row)
    })
    updateSelections()
  }
  function setMode(value) {
    source = value
    all('[data-mode]').forEach((b) =>
      b.setAttribute('aria-pressed', String(value === b.dataset.mode)),
    )
    $('.lc-photo-tools').hidden = value !== 'photo'
    $('.lc-voice').hidden = value !== 'voice'
    renderAI()
    if (value !== 'voice') showStatus('[data-voice-status]', '')
    updateTextLabel()
    if (value !== 'voice' && listening) void stopRecording()
  }
  function displayMedia(element, value, kind) {
    const previous = previews.get(element)
    if (previous?.value === value) return
    if (previous?.url) URL.revokeObjectURL(previous.url)
    previews.delete(element)
    if (value && value.startsWith('data:')) {
      const { bytes, type } = dataMediaBinary(value, kind)
      const url = URL.createObjectURL(new Blob([bytes], { type }))
      element.src = url
      previews.set(element, { value, url })
    } else if (kind === 'image' && /^\/images\/[\w.-]+$/u.test(value)) {
      element.src = assetPath(value)
      previews.set(element, { value })
    } else {
      element.removeAttribute('src')
      if (kind === 'audio') element.load()
    }
  }
  function refreshMedia() {
    const img = $('.lc-picture img'),
      player = $('.lc-player audio')
    displayMedia(img, photo, 'image')
    displayMedia(player, audio, 'audio')
    $('.lc-picture').hidden = !img.hasAttribute('src')
    $('.lc-player').hidden = !player.hasAttribute('src')
  }
  async function addPhoto(file) {
    if (!file) return
    const version = ++photoVersion
    cancelAI()
    photoBusy = true
    showStatus('[data-photo-status]', '正在设备上处理照片…')
    try {
      const prepared = await prepareJournalPhoto(file)
      if (disposed || version !== photoVersion) return
      photo = prepared.image
      photoThumbnail = prepared.thumbnail
      photoText = ''
      aiPhoto = null
      refreshMedia()
      refreshExtraction()
      showStatus('[data-photo-status]', '照片已准备好，可以保存。')
      // Local OCR is optional. Saving never waits for the detector.
      void readPhotoTextLocally(prepared.image).then((text) => {
        if (disposed || saving || version !== photoVersion || !text || aiPhoto)
          return
        photoText = text
        refreshExtraction()
        showStatus(
          '[data-photo-status]',
          '本机已读出照片文字，可在微调里查看。',
        )
      })
    } catch {
      if (!disposed && version === photoVersion)
        showStatus(
          '[data-photo-status]',
          '照片读取失败，请选择此设备能打开的图片。',
        )
    } finally {
      if (!disposed && version === photoVersion) photoBusy = false
    }
  }
  for (const selector of ['[data-gallery]', '[data-camera]']) {
    $(selector).addEventListener('change', (event) => {
      const [file] = event.target.files
      event.target.value = ''
      photoJob = addPhoto(file)
    })
  }
  $('[data-pick-photo]').onclick = () => $('[data-gallery]').click()
  $('[data-take-photo]').onclick = () => $('[data-camera]').click()
  $('[data-remove-image]').onclick = () => {
    ++photoVersion
    cancelAI()
    photoBusy = false
    photo = ''
    photoThumbnail = null
    photoText = ''
    aiPhoto = null
    showStatus('[data-photo-status]', '')
    refreshMedia()
    refreshExtraction()
  }

  function updateVoice() {
    const button = $('[data-record-audio]')
    button.disabled = starting
    button.classList.toggle('lc-active', listening)
    $('.lc-mic-circle').innerHTML = icon(listening ? 'stop' : 'mic', 21)
    $('[data-voice-label]').textContent = starting
      ? '正在打开麦克风…'
      : listening
        ? '结束录音'
        : !canRecord && !Speech
          ? '选择音频文件'
          : audio
            ? '重新录音'
            : '开始录音'
    $('[data-import-audio]').hidden = !canRecord && !Speech
    $('[data-import-audio]').disabled = listening || starting
    $('[data-voice-hint]').textContent =
      !canRecord && !Speech
        ? '可导入录音，也可以在原话输入框使用系统键盘听写。'
        : '最长两分钟；也可以点原话输入框，用系统键盘听写。'
    if (!listening) $('[data-timer]').textContent = ''
    renderAI()
  }
  function releaseMic() {
    stream?.getTracks().forEach((track) => track.stop())
    stream = null
  }
  const aiMaterial = (kind) =>
    kind === 'text' ? editor.value.trim() : kind === 'photo' ? photo : audio
  const aiLabels = {
    text: '上方原话',
    photo: '这张压缩照片',
    voice: '这段录音',
  }
  function cancelAI() {
    activeAI?.abort()
    activeAI = null
    aiConsent = null
    if (!disposed) {
      showStatus('[data-ai-status]', '')
      renderAI()
    }
  }
  function renderAI() {
    const config = getAISettings()
    if (
      aiConsent &&
      (aiMaterial(aiConsent.kind) !== aiConsent.value ||
        visibility !== 'shared' ||
        aiConsent.scope !== visibility ||
        aiConsent.endpoint !== config.endpoint ||
        aiConsent.model !== config.model)
    ) {
      activeAI?.abort()
      activeAI = null
      aiConsent = null
      showStatus('[data-ai-status]', '')
    }
    const buttons = all('[data-ai-kind]')
    for (const button of buttons) {
      const kind = button.dataset.aiKind
      button.hidden =
        visibility !== 'shared' ||
        !config.configured ||
        !aiMaterial(kind) ||
        (kind !== 'text' && kind !== source) ||
        Boolean(aiConsent) ||
        listening
    }
    $('.lc-ai-actions').hidden = buttons.every((button) => button.hidden)
    $('.lc-ai-confirm').hidden = !aiConsent
    if (aiConsent) {
      $('[data-ai-send]').hidden = Boolean(activeAI)
      $('[data-ai-disclosure]').textContent = activeAI
        ? 'AI 正在处理。现在保存会保留已有内容并停止等待。'
        : '仅将' +
          aiLabels[aiConsent.kind] +
          '发送给 ' +
          aiConsent.origin +
          ' 的 ' +
          aiConsent.model +
          ' 模型。'
    }
  }
  all('[data-ai-kind]').forEach((button) => {
    button.onclick = () => {
      const config = getAISettings()
      const kind = button.dataset.aiKind
      if (visibility !== 'shared' || !config.configured || !aiMaterial(kind))
        return
      aiConsent = {
        kind,
        value: aiMaterial(kind),
        endpoint: config.endpoint,
        origin: config.origin,
        model: config.model,
        scope: visibility,
      }
      showStatus('[data-ai-status]', '')
      renderAI()
    }
  })
  $('[data-ai-cancel]').onclick = cancelAI
  $('[data-ai-send]').onclick = async () => {
    const selection = aiConsent
    if (visibility !== 'shared' || !selection || activeAI || saving) return
    const controller = new AbortController()
    activeAI = controller
    renderAI()
    if (aiConsent !== selection) return
    const timeout = setTimeout(() => controller.abort(), 60000)
    try {
      let value = selection.value
      // Existing starter entries can refer to a packaged, same-origin photograph.
      if (selection.kind === 'photo' && /^\/images\/[\w.-]+$/u.test(value)) {
        const asset = await fetch(assetPath(value), {
          signal: controller.signal,
          redirect: 'error',
          credentials: 'omit',
        })
        if (!asset.ok) throw new Error('此照片暂时无法读取。')
        value = await asset.blob()
      }
      const result = await requestDeviceAI({
        kind: selection.kind,
        value,
        destination: selection.endpoint,
        model: selection.model,
        visibility,
        signal: controller.signal,
      })
      if (
        disposed ||
        saving ||
        aiConsent !== selection ||
        aiMaterial(selection.kind) !== selection.value
      )
        return
      if (selection.kind === 'photo') {
        aiPhoto = result
        photoText =
          result.description ||
          result.title ||
          result.venueName ||
          result.ingredients.join('、')
      } else if (selection.kind === 'text') {
        aiWords = { original: selection.value, fields: result }
      } else {
        if (!editor.value.includes(result.transcript))
          editor.value += (editor.value.trim() ? '\n' : '') + result.transcript
        hasTranscript = true
      }
      refreshExtraction()
      showStatus(
        '[data-ai-status]',
        selection.kind === 'voice'
          ? '录音转写已填入，请核对原话。'
          : '已整理，展开「微调」可查看。',
      )
    } catch (error) {
      if (!disposed && aiConsent === selection)
        showStatus(
          '[data-ai-status]',
          controller.signal.aborted
            ? '处理时间较长，可以直接保存。'
            : error.message || 'AI 暂不可用，仍可保存。',
        )
    } finally {
      clearTimeout(timeout)
      if (activeAI === controller) {
        activeAI = null
        aiConsent = null
        if (!disposed) renderAI()
      }
    }
  }
  $('[data-import-audio]').onclick = () => $('[data-audio-file]').click()
  function launchSpeech() {
    if (!Speech) return
    const speech = new Speech()
    speech.processLocally = true
    speech.lang = 'zh-CN'
    speech.continuous = true
    speech.interimResults = true
    recognition = speech
    let settled
    recognitionDone = new Promise((resolve) => {
      settled = resolve
    })
    speech.onresult = (event) => {
      if (disposed || speech !== recognition) return
      let interim = ''
      let complete = ''
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript.trim()
        if (event.results[i].isFinal) complete += transcript
        else interim += transcript
      }
      if (complete) {
        hasTranscript = true
        editor.value +=
          (editor.value && !/\s$/.test(editor.value) ? '\n' : '') + complete
        refreshExtraction()
      }
      showStatus('[data-voice-status]', interim)
    }
    speech.onerror = (event) => {
      if (disposed || speech !== recognition || event.error === 'aborted')
        return
      const message = recorder
        ? '录音中。本机听写不可用，仍可保存原声。'
        : event.error === 'not-allowed'
          ? '请在浏览器中允许使用麦克风，或切换文字记录。'
          : '暂时无法转写，请重试或输入文字。'
      showStatus('[data-voice-status]', message)
    }
    speech.onend = () => {
      settled()
      if (disposed || speech !== recognition) return
      recognition = null
      if (!recorder && listening) {
        listening = false
        clearInterval(interval)
        updateVoice()
      }
    }
    try {
      speech.start()
    } catch {
      recognition = null
      settled()
      if (!recorder) throw new Error('语音转写未启动，请重新尝试。')
      showStatus(
        '[data-voice-status]',
        '录音中。本机听写不可用，仍可保存原声。',
      )
    }
  }
  async function startRecording() {
    if (starting || listening) return
    if (!canRecord && !Speech) {
      $('[data-audio-file]').click()
      return
    }
    cancelAI()
    showStatus('[data-voice-status]', '')
    starting = true
    updateVoice()
    try {
      if (canRecord) {
        const freshStream = await navigator.mediaDevices.getUserMedia({
          audio: true,
        })
        if (disposed || saving || source !== 'voice') {
          freshStream.getTracks().forEach((track) => track.stop())
          return
        }
        stream = freshStream
        recorder = startAudioRecorder(stream, (current, mimeType) => {
          const chunks = []
          current.ondataavailable = (e) => {
            if (e.data.size) chunks.push(e.data)
          }
          let resolveAudio
          audioReady = new Promise((resolve) => {
            resolveAudio = resolve
          })
          current.onerror = () => {
            if (!disposed)
              showStatus(
                '[data-voice-status]',
                '录音中断，请检查麦克风后重试。',
              )
          }
          current.onstop = async () => {
            releaseMic()
            try {
              if (disposed || !chunks.length) return
              const captured = new Blob(chunks, { type: chunks[0].type })
              const type = await recordingType(
                captured,
                current.mimeType || mimeType,
              )
              const uri = await blobDataUrl(
                captured.slice(0, captured.size, type),
              )
              if (!disposed) {
                audio = uri
                refreshMedia()
              }
            } catch {
              if (!disposed)
                showStatus(
                  '[data-voice-status]',
                  '录音读取失败，可以保留文字或重新录制。',
                )
            } finally {
              if (recorder === current) recorder = null
              resolveAudio()
            }
          }
        })
      }
      launchSpeech()
      listening = true
      timerStart = Date.now()
      $('[data-timer]').textContent = '0:00'
      interval = setInterval(() => {
        const elapsed = Math.floor((Date.now() - timerStart) / 1000)
        $('[data-timer]').textContent =
          Math.floor(elapsed / 60) + ':' + String(elapsed % 60).padStart(2, '0')
        if (elapsed >= 120) {
          void stopRecording()
          showStatus(
            '[data-voice-status]',
            '两分钟录音已结束，可以试听和保存。',
          )
        }
      }, 500)
    } catch (error) {
      if (recorder?.state === 'recording') recorder.stop()
      if (!recorder) audioReady = null
      releaseMic()
      if (!disposed)
        showStatus(
          '[data-voice-status]',
          error.name === 'NotAllowedError'
            ? '未能访问麦克风。请在浏览器中允许使用，或切换文字记录。'
            : '麦克风暂不可用，请检查设备后重试，或切换文字记录。',
        )
    } finally {
      starting = false
      if (!disposed) updateVoice()
    }
  }
  async function stopRecording() {
    if (stopping) return stopping
    stopping = finishRecording()
    try {
      await stopping
    } finally {
      stopping = null
    }
  }
  async function finishRecording() {
    listening = false
    clearInterval(interval)
    if (recognition) {
      try {
        recognition.stop()
      } catch {
        /* Already stopped. */
      }
    }
    if (recorder?.state === 'recording') recorder.stop()
    if (!disposed) {
      updateVoice()
      $('[data-record-audio]').disabled = true
    }
    await Promise.all([
      audioReady,
      recognitionDone &&
        Promise.race([
          recognitionDone,
          new Promise((resolve) => setTimeout(resolve, 950)),
        ]),
    ])
    if (!disposed) {
      updateVoice()
    }
  }
  $('[data-record-audio]').onclick = () => {
    void (listening ? stopRecording() : startRecording())
  }
  async function importAudio(file) {
    if (!file) return
    if (file.size > 6 * 1024 * 1024) {
      showStatus('[data-voice-status]', '请选择 6 MB 以内的短录音。')
      return
    }
    try {
      const type = await recordingType(file, '', file.name)
      const uri = await blobDataUrl(file.slice(0, file.size, type))
      if (disposed) return
      audio = uri
      refreshMedia()
      updateVoice()
      showStatus('[data-voice-status]', '录音已准备好，可以试听或保存。')
      renderAI()
    } catch {
      if (!disposed)
        showStatus('[data-voice-status]', '音频读取失败，请重新选择。')
    }
  }
  $('[data-audio-file]').onchange = (event) => {
    const [file] = event.target.files
    event.target.value = ''
    importedAudio = importAudio(file)
  }
  $('[data-remove-audio]').onclick = () => {
    cancelAI()
    audio = ''
    refreshMedia()
    updateVoice()
    showStatus('[data-voice-status]', '')
  }
  all('[data-mode]').forEach((b) => (b.onclick = () => setMode(b.dataset.mode)))
  editor.addEventListener('input', refreshExtraction)
  function cleanup() {
    if (disposed) return
    disposed = true
    cancelAI()
    clearInterval(interval)
    try {
      recognition?.abort()
    } catch {
      /* Already stopped. */
    }
    if (recorder?.state === 'recording') recorder.stop()
    releaseMic()
    $('.lc-player audio').pause()
    for (const preview of previews.values())
      if (preview.url) URL.revokeObjectURL(preview.url)
    previews.clear()
    dialog.remove()
    document.body.classList.remove('lc-open')
    activeDialog = null
    if (opener?.isConnected) opener.focus({ preventScroll: true })
  }
  function close() {
    if (!saving) dialog.close()
  }
  dialog.addEventListener('close', cleanup, { once: true })
  dialog.addEventListener('cancel', (event) => {
    if (saving) event.preventDefault()
  })
  let backdropDown = false
  dialog.addEventListener('pointerdown', (event) => {
    backdropDown = event.target === dialog
  })
  dialog.addEventListener('click', (event) => {
    if (backdropDown && event.target === dialog) close()
  })
  $('[data-close]').onclick = close
  $('.lc-form').onsubmit = async (event) => {
    event.preventDefault()
    if (saving) return
    saving = true
    cancelAI()
    $('.lc-submit').disabled = true
    $('.lc-scroll').inert = true
    $('.lc-visibility').inert = true
    $('[data-close]').disabled = true
    const saveLabel = $('[data-save-label]')
    saveLabel.textContent = photoBusy ? '正在整理照片…' : '正在保存…'
    showStatus('.lc-error', '')
    try {
      if (photoBusy) await photoJob
      if (importedAudio) await importedAudio
      if (stopping || listening || recorder || recognition)
        await stopRecording()
      const savedVenue =
        diningCategories.includes(category) && diningSource === 'out'
          ? venueName.trim()
          : ''
      const samePrefilledVenue =
        !editing &&
        savedVenue &&
        venueKey(savedVenue) === venueKey(defaultVenueName)
      const isVisit = savedVenue && (!samePrefilledVenue || rating || taste)
      if (
        !editor.value.trim() &&
        !photo &&
        !audio &&
        !title.value.trim() &&
        !notes.value.trim() &&
        !isVisit
      ) {
        showStatus(
          '.lc-error',
          samePrefilledVenue
            ? '给这次探店打个分，或记下这次的感受吧。'
            : '写一句话、拍张照片，或留一段语音吧。',
        )
        $('.lc-scroll').inert = false
        if (!usesMobileShell()) editor.focus()
        return
      }
      refreshExtraction()
      const text = editor.value.trim()
      const entry = createEntry({
        ...(record || {}),
        ...computed,
        ingredients: computed.ingredients || [],
        steps: computed.steps || [],
        feeling: computed.feeling || '',
        title:
          title.value.trim() ||
          computed.title ||
          savedVenue ||
          (photo
            ? '随手拍'
            : audio
              ? '一段语音'
              : notes.value.trim().slice(0, 22)),
        category,
        text,
        photoDescription: photoText,
        originalTextUnverified: Boolean(
          unverifiedOriginal && text === (record?.text || '').trim(),
        ),
        visibility,
        notes: notes.value.trim(),
        rating,
        taste: diningCategories.includes(category) ? taste : '',
        diningSource: diningCategories.includes(category) ? diningSource : '',
        venueName: savedVenue,
        image: photo,
        audio,
        source:
          source === 'photo' && photo
            ? 'photo'
            : audio || hasTranscript
              ? 'voice'
              : photo
                ? 'photo'
                : 'text',
      })
      await onSave?.(photoThumbnail ? { ...entry, photoThumbnail } : entry)
      dialog.close()
    } catch (error) {
      showStatus(
        '.lc-error',
        error?.name === 'QuotaExceededError'
          ? '设备存储空间不足，请缩短录音或更换小一些的照片。'
          : error?.message || '这条记录未能保存，请重试。',
      )
    } finally {
      saving = false
      $('.lc-submit').disabled = false
      $('.lc-scroll').inert = false
      $('.lc-visibility').inert = false
      $('[data-close]').disabled = false
      saveLabel.textContent = editing ? '保存修改' : '存入手记'
    }
  }
  document.body.append(dialog)
  document.body.classList.add('lc-open')
  setMode(source)
  updateVoice()
  refreshMedia()
  refreshExtraction()
  showEditor(dialog, $('.lc-scroll'), source === 'text' ? editor : null)
  return dialog
}
