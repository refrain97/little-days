import { demoPhotoNames } from '../src/paths.js'
import { createHash } from 'node:crypto'
import { lstat, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { dirname, resolve, posix } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const publicDir = resolve(root, 'public')

// Include matching demo art individually so an export or a personal photo copied
// into public/ can never be uploaded to Pages by a recursive directory copy.
const icons = [
  'apple-touch-icon.png',
  'flower.svg',
  'icon-192.png',
  'icon-512.png',
]
const publicAssets = [
  'manifest.json',
  'fonts/OFL.txt',
  ...['journal', 'breakfast', 'freetime', 'editor'].map(
    (name) => 'fonts/days-' + name + '.woff2',
  ),
  ...icons.map((name) => 'icons/' + name),
  ...demoPhotoNames.map((name) => 'images/' + name + '.webp'),
]

async function readAsset(file) {
  if (!(await lstat(file)).isFile())
    throw new Error('发布文件须为普通文件：' + file)
  return readFile(file)
}

function publishedRepository() {
  const value =
    process.env.LITTLE_DAYS_CODE_REPO || process.env.GITHUB_REPOSITORY || ''
  if (value && !/^[a-z\d-]+\/[a-z\d._-]+$/i.test(value)) {
    throw new Error('代码仓库名称应采用 owner/repo 格式。')
  }
  return value
}

const digest = (data) => createHash('sha256').update(data).digest('hex')
const fingerprint = (path, hash) =>
  path.slice(0, -posix.extname(path).length) +
  '.' +
  hash.slice(0, 16) +
  posix.extname(path)
const imports = /\b(?:from\s*|import\s*(?:\(\s*)?)['"](\.[^'"]+\.js)['"]/g
const sourceLinks = /(?:src|href)="\.\/(src\/[\w./-]+\.(?:css|js))"/g
const dependency = (name, ref) =>
  posix.normalize(posix.join(posix.dirname(name), ref))
function relativePath(from, to) {
  const path = posix.relative(posix.dirname(from), to)
  return path.startsWith('.') ? path : './' + path
}

export async function collectSite() {
  let html = (await readAsset(resolve(root, 'index.html')))
    .toString()
    .replace(
      /(<meta name="little-days-code-repo" content=")[^"]*(")/,
      (_, before, after) => before + publishedRepository() + after,
    )
  const files = new Map()
  const urls = new Map()
  const cached = new Map()
  function immutable(name, bytes, hash = digest(bytes)) {
    const target = fingerprint(name, hash)
    urls.set(name, target)
    files.set(target, bytes)
    cached.set(target, digest(bytes))
    return target
  }
  for (const name of publicAssets) {
    const bytes = await readAsset(resolve(publicDir, name))
    files.set(name, bytes) // Installed icons, earlier notebooks, and external bookmarks.
    if (name === 'manifest.json') continue
    if (name === 'fonts/OFL.txt') {
      cached.set(name, digest(bytes))
      continue
    }
    immutable(name, bytes)
  }
  const manifest = JSON.parse(files.get('manifest.json').toString())
  for (const icon of manifest.icons) {
    const target = urls.get(icon.src.replace(/^\.\//, ''))
    if (!target) throw new Error('PWA 图标缺失。')
    icon.src = './' + target
  }
  const manifestBytes = Buffer.from(JSON.stringify(manifest))
  for (const name of ['manifest.json', 'manifest.webmanifest']) {
    files.set(name, manifestBytes)
    cached.set(name, digest(manifestBytes))
  }

  const mediaMap = Object.fromEntries(
    [...urls]
      .filter(([name]) => /^(icons|images)\//.test(name))
      .map(([name, url]) => ['/' + name, url]),
  )
  // Follow only modules reachable from the page, including dynamic imports.
  const queue = [...html.matchAll(sourceLinks)].map((match) => match[1])
  const modules = new Map()
  for (let i = 0; i < queue.length; i++) {
    const name = queue[i]
    if (modules.has(name) || urls.has(name)) continue
    if (!/^src\/(?:[\w-]+\/)*[\w.-]+\.(?:js|css)$/.test(name))
      throw new Error('无效的发布路径：' + name)
    let source = (await readAsset(resolve(root, name))).toString()
    if (name.endsWith('.css')) {
      // Only rewrite relative assets on the public allowlist (e.g. local WOFF2 slices).
      source = source.replace(
        /url\((['"]?)(\.[^)'"]+)\1\)/g,
        (match, quote, ref) => {
          const target = urls.get(dependency(name, ref))
          return target ? "url('" + relativePath(name, target) + "')" : match
        },
      )
      const bytes = Buffer.from(source)
      files.set(name, bytes)
      immutable(name, bytes)
      continue
    }
    if (name === 'src/paths.js')
      source = source.replace(
        '/*__BUNDLED_PATHS__*/ {}',
        JSON.stringify(mediaMap),
      )
    const deps = [...source.matchAll(imports)].map((match) =>
      dependency(name, match[1]),
    )
    modules.set(name, { source, deps, hash: digest(source) })
    queue.push(...deps)
  }
  // Hash each module's reachable source graph. Cycles get stable names without a
  // self-referential hash, and an unrelated module can keep its previous URL.
  const moduleHashes = new Map()
  for (const name of modules.keys()) {
    const graph = new Set([name])
    for (const member of graph)
      for (const ref of modules.get(member).deps) graph.add(ref)
    const identity = [...graph]
      .sort()
      .map((ref) => [ref, modules.get(ref).hash])
    const hash = digest('little-days-esm-v1' + JSON.stringify(identity))
    moduleHashes.set(name, hash)
    urls.set(name, fingerprint(name, hash))
  }
  for (const [name, { source }] of modules) {
    const result = source.replace(imports, (match, ref) =>
      match.replace(ref, relativePath(name, urls.get(dependency(name, ref)))),
    )
    const target = immutable(name, Buffer.from(result), moduleHashes.get(name))
    // A stable import delegates to the same module instance as the application.
    files.set(
      name,
      Buffer.from("export * from './" + posix.basename(target) + "'\n"),
    )
  }
  html = html.replace(/(src|href)="\.\/([^"]+)"/g, (match, attr, path) =>
    urls.has(path) ? attr + '="./' + urls.get(path) + '"' : match,
  )
  const documentVersion = digest(html).slice(0, 20)
  html = html.replace(
    '</head>',
    '<meta name="little-days-shell" content="' +
      documentVersion +
      '" />\n  </head>',
  )
  const indexBytes = Buffer.from(html)
  files.set('index.html', indexBytes)
  cached.set('index.html', digest(indexBytes))
  const template = (await readAsset(resolve(publicDir, 'sw.js'))).toString()
  const release = JSON.stringify(
    [...cached].sort(([a], [b]) => a.localeCompare(b, 'en')),
  )
  const revision = digest(template + release).slice(0, 20)
  const worker = template
    .replace('__SITE_REVISION__', revision)
    .replace('__DOCUMENT_VERSION__', documentVersion)
    .replace('/*__SITE_FILES__*/ []', release)
  files.set('sw.js', Buffer.from(worker))
  return files
}

if (
  process.argv[1] &&
  pathToFileURL(resolve(process.argv[1])).href === import.meta.url
) {
  const files = await collectSite()
  const out = resolve(root, 'dist')
  await rm(out, { recursive: true, force: true })
  for (const [name, data] of files) {
    const target = resolve(out, name)
    await mkdir(dirname(target), { recursive: true })
    await writeFile(target, data)
  }
  console.log('已构建纯静态小日子，共 ' + files.size + ' 个发布文件。')
}
