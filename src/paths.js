// Keep saved records portable. Resolve built-in images only at display/read time.
const base = new URL('../', import.meta.url)

export function appPath(relative = '') {
  const path = String(relative).replace(/^\/+/, '')
  return base.protocol === 'file:' ? '/' + path : new URL(path, base).pathname
}

export function assetPath(value) {
  return typeof value === 'string' && /^\/(?:images|icons)\//.test(value)
    ? appPath(value)
    : value
}
