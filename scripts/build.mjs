import { demoPhotoNames } from '../src/paths.js'
import { createHash } from 'node:crypto'
import { lstat, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
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

export async function collectSite() {
  const html = (await readAsset(resolve(root, 'index.html')))
    .toString()
    .replace(
      /(<meta name="little-days-code-repo" content=")[^"]*(")/,
      (_, before, after) => before + publishedRepository() + after,
    )
  const files = new Map([['index.html', Buffer.from(html)]])
  const scripts = [
    ...html.matchAll(/(?:src|href)="\.\/(src\/[\w./-]+\.(?:css|js))"/g),
  ].map((m) => m[1])
  // Follow the site's entry modules. Unreferenced scripts, snapshots, exports,
  // API helpers for old local servers and environment files never enter dist.
  for (let i = 0; i < scripts.length; i++) {
    const name = scripts[i]
    if (files.has(name)) continue
    if (!/^src\/(?:[\w-]+\/)*[\w.-]+\.(?:js|css)$/.test(name))
      throw new Error('无效的发布路径：' + name)
    const data = await readAsset(resolve(root, name))
    files.set(name, data)
    if (name.endsWith('.js')) {
      const imports = data
        .toString()
        .matchAll(/\b(?:from\s*|import\s*(?:\(\s*)?)['"](\.[^'"]+\.js)['"]/g)
      for (const [, ref] of imports)
        scripts.push(
          new URL(ref, 'https://build.invalid/' + name).pathname.slice(1),
        )
    }
  }
  for (const name of publicAssets)
    files.set(name, await readAsset(resolve(publicDir, name)))
  const manifest = JSON.parse(files.get('manifest.json').toString())
  if (manifest.icons.some(({ src }) => !files.has(src.replace(/^\.\//, ''))))
    throw new Error('PWA 图标缺失。')
  // Keep the previous manifest filename valid for installed copies.
  files.set('manifest.webmanifest', files.get('manifest.json'))
  const names = [...files.keys()].sort()
  const template = (await readAsset(resolve(publicDir, 'sw.js'))).toString()
  const manifestFiles = names.map((name) => [
    name,
    createHash('sha256').update(files.get(name)).digest('hex'),
  ])
  const release = JSON.stringify(manifestFiles)
  const revision = createHash('sha256')
    .update(template)
    .update(release)
    .digest('hex')
    .slice(0, 20)
  const worker = template
    .replace('__SITE_REVISION__', revision)
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
