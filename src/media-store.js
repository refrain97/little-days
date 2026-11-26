import {assetPath} from './paths.js'
// A local media reference is only resolved against this browser's IndexedDB.
// The page never requests it from a server, including on a LAN without HTTPS.
export const mediaPrefix = '/__little_days_media__/'
export const isLocalMedia = (value) =>
  typeof value === 'string' && value.startsWith(mediaPrefix)

const escapes = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
}
export function mediaAttributes(url) {
  if (!url) return ''
  const safe = String(isLocalMedia(url) ? url : assetPath(url)).replace(/[&<>"']/g, (ch) => escapes[ch])
  return (isLocalMedia(url) ? 'data-local-media' : 'src') + '="' + safe + '"'
}

export function dataMediaType(value, kind) {
  if (typeof value !== 'string' || !value.startsWith('data:')) return ''
  const comma = value.indexOf(',')
  if (comma < 0 || comma > 200) return ''
  const header = value.slice(5, comma)
  if (!/;base64$/i.test(header)) return ''
  const type = header.slice(0, -7)
  const pattern =
    kind === 'image'
      ? /^image\/(?:jpe?g|png|webp|gif|avif|bmp|heic|heif)$/i
      : /^(?:audio\/[\w.+-]+|video\/(?:webm|mp4)|application\/(?:octet-stream|ogg))(?:;[\w.+="-]+)*$/i
  return pattern.test(type) ? type : ''
}

export function dataMediaBinary(value, kind) {
  const type = dataMediaType(value, kind)
  if (!type) throw new Error('照片或原声的文件格式无法读取。')
  const start = value.indexOf(',') + 1
  const padding = value.endsWith('==') ? 2 : value.endsWith('=') ? 1 : 0
  const result = new Uint8Array(
    Math.floor(((value.length - start - padding) * 3) / 4),
  )
  let offset = 0
  for (let i = start; i < value.length; i += 65536) {
    const bytes = atob(value.slice(i, i + 65536))
    for (let j = 0; j < bytes.length; j++)
      result[offset++] = bytes.charCodeAt(j)
  }
  return {
    type,
    bytes:
      offset === result.length ? result.buffer : result.buffer.slice(0, offset),
  }
}

export function binaryDataUrl(value) {
  const bytes = new Uint8Array(value.bytes)
  const chunks = ['data:' + value.type + ';base64,']
  // Multipart base64 may only be concatenated on 3-byte boundaries.
  for (let i = 0; i < bytes.length; i += 12288) {
    chunks.push(btoa(String.fromCharCode(...bytes.subarray(i, i + 12288))))
  }
  return chunks.join('')
}

export function blobDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.onerror = () => reject(new Error('照片或原声读取失败。'))
    reader.readAsDataURL(blob)
  })
}

let stopObserving
export function observeMedia(readBlob) {
  if (stopObserving) return stopObserving
  const active = new Map()
  const selector = 'img[data-local-media],audio[data-local-media]'
  function release(el) {
    const state = active.get(el)
    if (!state) return
    state.token++
    state.pending = false
    if (!state.objectUrl) return
    el.removeAttribute('src')
    if (el.tagName === 'AUDIO') el.load()
    URL.revokeObjectURL(state.objectUrl)
    state.objectUrl = ''
  }
  async function load(el) {
    const state = active.get(el)
    if (!state || state.pending || state.objectUrl) return
    const token = ++state.token
    state.pending = true
    try {
      const blob = await readBlob(state.ref)
      if (!blob || active.get(el) !== state || state.token !== token) return
      state.objectUrl = URL.createObjectURL(blob)
      el.src = state.objectUrl
    } catch {
      // Keep the alt text or native audio controls available if storage is unavailable.
    } finally {
      if (state.token === token) state.pending = false
    }
  }
  const viewport =
    typeof IntersectionObserver !== 'undefined' &&
    new IntersectionObserver(
      (changes) => {
        for (const { target, isIntersecting } of changes) {
          if (isIntersecting) void load(target)
          else if (target.tagName !== 'AUDIO' || target.paused) release(target)
        }
      },
      { rootMargin: '220px' },
    )
  function forget(el) {
    viewport && viewport.unobserve(el)
    release(el)
    active.delete(el)
  }
  function watch(el) {
    const ref = el.dataset.localMedia
    if (active.get(el)?.ref === ref) return
    forget(el)
    if (!isLocalMedia(ref)) return
    active.set(el, { ref, pending: false, objectUrl: '', token: 0 })
    if (viewport) viewport.observe(el)
    else void load(el)
  }
  function visit(node, fn) {
    if (node.nodeType !== 1 && node.nodeType !== 9) return
    if (node.matches?.(selector)) fn(node)
    node.querySelectorAll(selector).forEach(fn)
  }
  const observer = new MutationObserver((changes) => {
    for (const change of changes) {
      if (change.type === 'attributes') {
        if (change.target.isConnected) watch(change.target)
        continue
      }
      for (const node of change.removedNodes)
        if (!node.isConnected) visit(node, forget)
      for (const node of change.addedNodes)
        if (node.isConnected) visit(node, watch)
    }
  })
  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['data-local-media'],
  })
  visit(document, watch)
  stopObserving = () => {
    observer.disconnect()
    viewport && viewport.disconnect()
    for (const el of active.keys()) forget(el)
    stopObserving = null
  }
  return stopObserving
}
