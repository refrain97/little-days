import { blobDataUrl, dataMediaBinary } from './media-store.js'

const preferenceKey = 'little-days.device-ai.v1'
const photoLimit = 200 * 1024
const maxSide = 1024

function endpointInfo(value) {
  let url
  try {
    url = new URL(String(value).trim())
  } catch {
    throw new Error('请输入完整的 HTTPS 接口地址。')
  }
  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  ) {
    throw new Error('接口须使用 HTTPS，地址不能包含账号、查询参数或片段。')
  }
  const path = url.pathname.replace(/\/+$/u, '')
  if (path === '/chat/completions')
    return {
      endpoint: url.origin + path,
      origin: url.origin,
      requestURL: url.origin + path,
    }
  const base = path.replace(/\/chat\/completions$/u, '') || '/v1'
  const endpoint = url.origin + base
  return {
    endpoint,
    origin: url.origin,
    requestURL: endpoint + '/chat/completions',
  }
}

function storedConfig() {
  try {
    const value = JSON.parse(localStorage.getItem(preferenceKey))
    if (
      !value ||
      typeof value.key !== 'string' ||
      typeof value.model !== 'string'
    )
      return null
    return {
      ...endpointInfo(value.endpoint),
      key: value.key,
      model: value.model,
    }
  } catch {
    return null
  }
}

export function getAISettings() {
  const stored = storedConfig()
  return {
    endpoint: stored?.endpoint || '',
    origin: stored?.origin || '',
    model: stored?.model || '',
    hasKey: Boolean(stored?.key),
    configured: Boolean(stored?.key && stored.model),
  }
}

export function saveAISettings({ endpoint, model, key = '' }) {
  const target = endpointInfo(endpoint)
  const old = storedConfig()
  const secret =
    String(key).trim() || (old?.endpoint === target.endpoint ? old.key : '')
  const name = String(model || '').trim()
  if (!name || /[\r\n]/u.test(name))
    throw new Error('请输入服务提供的模型名称。')
  if (!secret || /[\r\n]/u.test(secret))
    throw new Error('请为此接口填写有效的 API Key。')
  try {
    localStorage.setItem(
      preferenceKey,
      JSON.stringify({ endpoint: target.endpoint, model: name, key: secret }),
    )
  } catch {
    throw new Error('这台设备无法保存 AI 设置。')
  }
  return getAISettings()
}

export function clearAISettings() {
  try {
    localStorage.removeItem(preferenceKey)
  } catch {
    throw new Error('这台设备无法清除 AI 设置。')
  }
  return getAISettings()
}

function fileBlob(input, kind) {
  if (input instanceof Blob) return input
  const { bytes, type } = dataMediaBinary(input, kind)
  return new Blob([bytes], { type })
}

// Safe JPEGs already produced by the app can be reused during cloud retries.
// Re-encode files with EXIF or comments. Keep a standard color profile.
function plainJpeg(bytes) {
  if (bytes[0] !== 255 || bytes[1] !== 216) return false
  for (let p = 2; p + 4 <= bytes.length;) {
    if (bytes[p] !== 255) return false
    const marker = bytes[p + 1]
    if (marker === 218) return true
    const length = (bytes[p + 2] << 8) | bytes[p + 3]
    if (length < 2 || p + 2 + length > bytes.length) return false
    const colorProfile =
      marker === 226 &&
      String.fromCharCode(...bytes.slice(p + 4, p + 16)) === 'ICC_PROFILE\0'
    if (marker === 254 || (marker >= 225 && marker <= 239 && !colorProfile))
      return false
    if (
      marker === 224 &&
      (length !== 16 ||
        String.fromCharCode(...bytes.slice(p + 4, p + 9)) !== 'JFIF\0')
    )
      return false
    p += 2 + length
  }
  return false
}

function drawJpeg(image, width, height, quality) {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('这台设备暂时无法处理照片。')
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, width, height)
  ctx.drawImage(image, 0, 0, width, height)
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (blob) => {
        canvas.width = canvas.height = 1
        if (blob?.type === 'image/jpeg') resolve(blob)
        else reject(new Error('这张照片无法转换为 JPEG。'))
      },
      'image/jpeg',
      quality,
    ),
  )
}

export async function compressJournalPhoto(input) {
  const original = fileBlob(input, 'image')
  if (original.type === 'image/svg+xml') throw new Error('请选择照片文件。')
  const url = URL.createObjectURL(original)
  try {
    const image = new Image()
    image.src = url
    await image.decode()
    const longSide = Math.max(image.naturalWidth, image.naturalHeight)
    if (!longSide) throw new Error('无法读取照片尺寸。')
    if (
      longSide <= maxSide &&
      original.size <= photoLimit &&
      original.type === 'image/jpeg' &&
      plainJpeg(new Uint8Array(await original.arrayBuffer()))
    ) {
      return typeof input === 'string' ? input : blobDataUrl(original)
    }
    let scale = Math.min(1, maxSide / longSide)
    for (;;) {
      const w = Math.max(1, Math.round(image.naturalWidth * scale))
      const h = Math.max(1, Math.round(image.naturalHeight * scale))
      for (const quality of [0.84, 0.72, 0.58]) {
        const blob = await drawJpeg(image, w, h, quality)
        if (blob.size <= photoLimit || (w === 1 && h === 1))
          return blobDataUrl(blob)
      }
      scale *= 0.78
    }
  } finally {
    URL.revokeObjectURL(url)
  }
}

export async function readPhotoTextLocally(image) {
  if (typeof globalThis.TextDetector !== 'function') return ''
  try {
    const element = new Image()
    element.src = image
    await element.decode()
    const words = await new globalThis.TextDetector().detect(element)
    return words
      .map((word) => String(word.rawValue || '').trim())
      .filter(Boolean)
      .join('，')
      .slice(0, 1000)
  } catch {
    return ''
  }
}

async function audioPart(value) {
  const blob = fileBlob(value, 'audio')
  const Offline =
    globalThis.OfflineAudioContext || globalThis.webkitOfflineAudioContext
  if (!Offline)
    throw new Error('此设备无法转换录音，可以使用键盘听写或直接保存原声。')
  let buffer
  try {
    buffer = await new Offline(1, 1, 16000).decodeAudioData(
      await blob.arrayBuffer(),
    )
  } catch {
    throw new Error('此设备无法读取这段音频，可以直接保存原声。')
  }
  if (!buffer.length || buffer.duration > 121)
    throw new Error('请选择两分钟以内的录音进行转写。')
  const channels = Array.from({ length: buffer.numberOfChannels }, (_, i) =>
    buffer.getChannelData(i),
  )
  const wav = new ArrayBuffer(44 + buffer.length * 2)
  const view = new DataView(wav)
  const tag = (at, value) => {
    for (let i = 0; i < value.length; i++)
      view.setUint8(at + i, value.charCodeAt(i))
  }
  tag(0, 'RIFF')
  view.setUint32(4, wav.byteLength - 8, true)
  tag(8, 'WAVE')
  tag(12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, 1, true)
  view.setUint32(24, buffer.sampleRate, true)
  view.setUint32(28, buffer.sampleRate * 2, true)
  view.setUint16(32, 2, true)
  view.setUint16(34, 16, true)
  tag(36, 'data')
  view.setUint32(40, buffer.length * 2, true)
  for (let i = 0; i < buffer.length; i++) {
    let sample = 0
    for (const channel of channels) sample += channel[i]
    const mono = Math.max(-1, Math.min(1, sample / channels.length))
    view.setInt16(
      44 + i * 2,
      Math.round(mono * (mono < 0 ? 32768 : 32767)),
      true,
    )
  }
  const data = await blobDataUrl(new Blob([wav], { type: 'audio/wav' }))
  return {
    type: 'input_audio',
    input_audio: { format: 'wav', data: data.slice(data.indexOf(',') + 1) },
  }
}

const fieldsPrompt =
  '只输出 JSON 对象，字段 title 简短标题，category 美食/饮品/灵感/回忆，ingredients 食材数组，steps 做法数组，feeling 原文明确表达的感受，venueName 明确写出或可读招牌上的店名，description 简短客观描述。不确定的内容留空，不推断口味、评分或店名。'
const prompts = {
  photo: '辨认照片里的菜品、食材和清晰可见的店名。' + fieldsPrompt,
  text:
    '整理这段生活记录。保留说话人的意思，只提取明确出现的内容。' + fieldsPrompt,
  voice:
    '逐字转写录音中的中文，只返回说话内容，不补写、总结或猜测。听不清或无内容则返回空字符串。',
}
const stringValue = (value, limit = 600) =>
  typeof value === 'string' ? value.trim().slice(0, limit) : ''
const stringList = (value) =>
  Array.isArray(value)
    ? value
        .map((v) => stringValue(v, 160))
        .filter(Boolean)
        .slice(0, 24)
    : []

// Capture calls this only after the user confirms the displayed destination and material.
export async function requestDeviceAI({
  kind,
  value,
  destination,
  model,
  visibility,
  signal,
}) {
  if (visibility !== 'shared') throw new Error('仅自己手记使用本机整理。')
  if (!Object.hasOwn(prompts, kind)) throw new Error('请选择要整理的内容。')
  const config = storedConfig()
  if (!config?.key || config.endpoint !== destination || config.model !== model)
    throw new Error('AI 设置已更改，请重新确认接收服务。')
  let content
  if (kind === 'voice') content = [await audioPart(value)]
  else if (kind === 'photo')
    content = [
      {
        type: 'image_url',
        image_url: { url: await compressJournalPhoto(value) },
      },
    ]
  else content = String(value).trim()
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')
  const current = storedConfig()
  if (
    current?.endpoint !== config.endpoint ||
    current.model !== config.model ||
    current.key !== config.key
  )
    throw new Error('AI 设置已更改，请重新确认接收服务。')
  let response
  try {
    response = await fetch(config.requestURL, {
      method: 'POST',
      mode: 'cors',
      credentials: 'omit',
      redirect: 'error',
      referrerPolicy: 'no-referrer',
      cache: 'no-store',
      signal,
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + config.key,
      },
      body: JSON.stringify({
        model: config.model,
        messages: [
          { role: 'system', content: prompts[kind] },
          { role: 'user', content },
        ],
      }),
    })
  } catch {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')
    throw new Error(
      '未能连接 AI 服务，请检查网络以及接口是否允许浏览器跨域请求。',
    )
  }
  if (!response.ok) {
    if (response.status === 401 || response.status === 403)
      throw new Error('AI 服务拒绝了请求，请检查接口、密钥和模型权限。')
    if (response.status === 429)
      throw new Error('AI 服务当前达到使用限额，可以稍后再试。')
    throw new Error('AI 服务暂未完成处理，请确认模型支持这类内容。')
  }
  let payload
  try {
    payload = await response.json()
  } catch {
    throw new Error('AI 服务没有返回可用结果。')
  }
  const answer = stringValue(payload?.choices?.[0]?.message?.content, 32000)
  if (!answer || answer.includes(config.key))
    throw new Error('AI 服务没有返回可用结果。')
  if (kind === 'voice') return { transcript: answer }
  let obj
  try {
    obj = JSON.parse(answer.replace(/^\s*```(?:json)?\s*|\s*```\s*$/giu, ''))
  } catch {
    throw new Error('AI 返回的整理格式不完整，可以保留原记录。')
  }
  if (!obj || typeof obj !== 'object' || Array.isArray(obj))
    throw new Error('AI 没有识别出可用内容。')
  const result = {
    title: stringValue(obj.title, 80),
    category: ['美食', '饮品', '灵感', '回忆'].includes(obj.category)
      ? obj.category
      : '',
    venueName: stringValue(obj.venueName, 100),
    description: stringValue(obj.description),
    ingredients: stringList(obj.ingredients),
    steps: stringList(obj.steps),
    feeling: stringValue(obj.feeling),
  }
  if (
    !result.title &&
    !result.venueName &&
    !result.description &&
    !result.steps.length &&
    !result.ingredients.length &&
    !result.feeling
  )
    throw new Error('AI 没有识别出可用内容。')
  return result
}
