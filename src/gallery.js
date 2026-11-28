import { mediaAttributes } from './media-store.js'
import { assetPath } from './paths.js'

// Preserve already-decoded demo images when a filter or favorite re-renders the list.
const loadedDemoPhotos = new Set()

export function photoAttributes(
  src,
  { thumbnail = false, lazy = thumbnail, priority = false } = {},
) {
  const attributes = mediaAttributes(src, thumbnail ? 'thumbnail' : 'detail')
  if (!attributes) return ''
  const ready =
    src.startsWith('/images/') && loadedDemoPhotos.has(assetPath(src))
  return `${attributes} data-gallery-photo${ready ? ' data-ready' : ''} loading="${lazy ? 'lazy' : 'eager'}" decoding="async"${priority ? ' fetchpriority="high"' : ''}`
}

export function observeGallery() {
  document.addEventListener(
    'load',
    (event) => {
      const image = event.target
      if (!image.matches?.('img[data-gallery-photo]') || !image.naturalWidth)
        return
      image.setAttribute('data-ready', '')
      const source = image.getAttribute('src')
      if (source && source.startsWith(assetPath('/images/')))
        loadedDemoPhotos.add(source)
    },
    true,
  )
  document.addEventListener(
    'error',
    (event) => {
      const image = event.target
      if (image.matches?.('img[data-gallery-photo]'))
        image.setAttribute('data-image-error', '')
    },
    true,
  )
}
