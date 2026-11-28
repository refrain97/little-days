// Keep saved records portable. Resolve built-in images only at display/read time.
const base = new URL('../', import.meta.url)
// Filled at build time. Handwritten records and portable backups keep their original paths.
const fingerprints = /*__BUNDLED_PATHS__*/ {}

export function appPath(relative = '') {
  const path = String(relative).replace(/^\/+/, '')
  return base.protocol === 'file:' ? '/' + path : new URL(path, base).pathname
}

export const demoPhotoNames = [
  'breakfast',
  'hero',
  'iced-latte',
  'idea-lemon-noodles',
  'idea-tomato-noodles',
  'noodles',
  'tomato-eggs',
  'venue-cafe',
  'venue-noodles',
  'walk',
]

const previousPhotos = new Map(
  demoPhotoNames.map((name) => [
    '/images/' + name + '.jpg',
    '/images/' + name + '.webp',
  ]),
)

export function bundledPhotoPath(value) {
  return typeof value === 'string' && value.startsWith('/images/')
    ? previousPhotos.get(value) || value
    : value
}

export function assetPath(value) {
  return typeof value === 'string' && /^\/(?:images|icons)\//.test(value)
    ? appPath(fingerprints[bundledPhotoPath(value)] || bundledPhotoPath(value))
    : value
}
