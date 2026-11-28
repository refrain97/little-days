// Exercise the actual Pages build and a real service worker on the project subpath.
// The test's two releases differ in their document title and a stylesheet rule.
import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { createServer } from 'node:http'
import { promisify } from 'node:util'
import {
  appendFile,
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  rename,
  rm,
  symlink,
  writeFile,
  readdir,
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { extname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const exec = promisify(execFile)
const project = fileURLToPath(new URL('../', import.meta.url))
const base = '/little-days/'
const types = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain',
}

async function createReleases(dir) {
  await Promise.all(['scripts', 'src'].map((name) => mkdir(join(dir, name))))
  await symlink(join(project, 'public'), join(dir, 'public'), 'dir')
  await Promise.all(
    ['package.json', 'scripts/build.mjs'].map((file) =>
      copyFile(join(project, file), join(dir, file)),
    ),
  )
  for (const file of await readdir(join(project, 'src'))) {
    if (/^[\w-]+\.(?:js|css)$/.test(file) && file !== 'style.css')
      await copyFile(join(project, 'src', file), join(dir, 'src', file))
  }
  const html = await readFile(join(project, 'index.html'), 'utf8')
  for (const release of ['A', 'B']) {
    await writeFile(
      join(dir, 'index.html'),
      html.replace('</title>', ' ' + release + '</title>'),
    )
    await copyFile(join(project, 'src/style.css'), join(dir, 'src/style.css'))
    await appendFile(
      join(dir, 'src/style.css'),
      '\n:root{--pwa-qa-release:' + release + '}\n',
    )
    await exec(process.execPath, ['scripts/build.mjs'], { cwd: dir })
    await rename(join(dir, 'dist'), join(dir, release))
  }
}

async function preview(dir) {
  const source = {
    site: 'A',
    worker: 'A',
    online: true,
    deny: '',
    navigations: 0,
  }
  const server = createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost')
    if (!url.pathname.startsWith(base)) {
      res.writeHead(404).end()
      return
    }
    const name = url.pathname.slice(base.length) || 'index.html'
    if (!/^[\w.-]+(?:\/[\w.-]+)*$/.test(name) || name.includes('..')) {
      res.writeHead(404).end()
      return
    }
    if (name === 'index.html') source.navigations++
    if (!source.online) {
      req.socket.destroy()
      return
    }
    if (url.pathname === source.deny) {
      res.writeHead(503).end()
      return
    }
    try {
      const bytes = await readFile(
        join(dir, name === 'sw.js' ? source.worker : source.site, name),
      )
      res
        .writeHead(200, {
          'Content-Type': types[extname(name)] || 'application/octet-stream',
          'Cache-Control': 'no-store',
        })
        .end(bytes)
    } catch {
      res.writeHead(404).end()
    }
  })
  await new Promise((resolve, reject) =>
    server.once('error', reject).listen(0, '127.0.0.1', resolve),
  )
  return {
    source,
    url: 'http://127.0.0.1:' + server.address().port + base,
    close: () =>
      new Promise((resolve) => {
        server.close(resolve)
        server.closeAllConnections()
      }),
  }
}

async function shell(page, version) {
  await page.waitForFunction(
    (v) =>
      document.title.endsWith(' ' + v) &&
      getComputedStyle(document.documentElement)
        .getPropertyValue('--pwa-qa-release')
        .trim() === v,
    version,
    { timeout: 15000 },
  )
  await page.locator('.entry-card').first().waitFor()
}

export async function checkPwaUpdates(browser) {
  const dir = await mkdtemp(join(tmpdir(), 'little-days-pwa-'))
  let hosting, context
  try {
    await createReleases(dir)
    hosting = await preview(dir)
    const { source, url } = hosting
    context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
      locale: 'zh-CN',
    })
    const editor = await context.newPage()
    const errors = []
    context.on('page', (page) =>
      page.on('pageerror', (e) => errors.push(e.message)),
    )
    editor.on('pageerror', (e) => errors.push(e.message))
    await editor.goto(url)
    await shell(editor, 'A')
    await editor.waitForFunction(
      () => Boolean(navigator.serviceWorker.controller),
      null,
      { timeout: 15000 },
    )
    const oldCss = await editor
      .locator('link[href*="/style."]')
      .getAttribute('href')
    assert.match(oldCss, /\/style\.[a-f0-9]{16}\.css$/)
    source.deny = new URL(oldCss, url).pathname
    assert.match(
      await editor.evaluate(
        async (href) => (await fetch(href, { cache: 'no-store' })).text(),
        oldCss,
      ),
      /--pwa-qa-release:A/,
    )
    source.deny = ''
    await editor
      .getByRole('button', { name: '记一笔', exact: true })
      .first()
      .click()
    const dialog = editor.locator('dialog.life-capture[open]')
    await dialog.locator('[data-body]').fill('等待更新时写下的验收草稿')

    source.site = 'B' // Keep worker A active while Pages starts delivering HTML B.
    const reader = await context.newPage()
    const before = source.navigations
    await reader.goto(url + '#home')
    await shell(reader, 'B')
    assert(source.navigations > before, '入口没有优先请求网络')
    assert.equal(
      await reader.evaluate(async () => {
        const body = await (
          await fetch('./index.html', { cache: 'no-store' })
        ).text()
        return new DOMParser()
          .parseFromString(body, 'text/html')
          .title.endsWith(' B')
      }),
      true,
      '显式 index.html 没有优先请求网络',
    )
    source.deny = base + 'index.html'
    assert.equal(
      await reader.evaluate(async () => (await fetch('./index.html')).status),
      503,
      '服务器有响应时不应以旧缓存冒充最新页面',
    )
    source.deny = ''
    await editor.evaluate(() => {
      window.qaShellChanged = false
      navigator.serviceWorker.addEventListener(
        'controllerchange',
        () => {
          window.qaShellChanged = true
        },
        { once: true },
      )
    })
    source.worker = 'B'
    await reader
      .evaluate(async () => {
        await (await navigator.serviceWorker.ready).update()
      })
      .catch((error) => {
        // The newer worker can navigate this page during update().
        if (!/navigation|destroyed/i.test(error.message)) throw error
      })
    await editor.waitForFunction(() => window.qaShellChanged, null, {
      timeout: 15000,
    })
    await editor.waitForFunction(
      () => navigator.serviceWorker.controller?.state === 'activated',
      null,
      { timeout: 15000 },
    )
    assert.equal(
      await dialog.locator('[data-body]').inputValue(),
      '等待更新时写下的验收草稿',
    )
    const oldResponse = await editor.evaluate(
      async (href) => (await fetch(href, { cache: 'no-store' })).text(),
      oldCss,
    )
    assert.match(
      oldResponse,
      /--pwa-qa-release:A/,
      '旧标签草稿期间丢失原版本资源',
    )
    await dialog.getByRole('button', { name: '关闭记录窗口' }).click()
    await shell(editor, 'B')
    source.online = false
    await context.setOffline(true)
    await editor.reload()
    await shell(editor, 'B')
    assert.equal(
      await editor.evaluate(async () => {
        const image = document.querySelector('.entry-card img')
        await image.decode()
        return image.naturalWidth
      }),
      800,
    )
    await editor.waitForFunction(
      async () => {
        const { scope } = await navigator.serviceWorker.ready
        return new Promise((resolve) => {
          const open = indexedDB.open('little-days-shell:' + scope)
          open.onsuccess = () => {
            const db = open.result
            const tx = db.transaction(['settings', 'assets'])
            const active = tx.objectStore('settings').get('active')
            const keys = tx.objectStore('assets').getAllKeys()
            tx.oncomplete = () => {
              db.close()
              resolve(
                keys.result.length &&
                  keys.result.every(([version]) => version === active.result),
              )
            }
          }
        })
      },
      null,
      { timeout: 10000 },
    )
    assert.deepEqual(errors, [])
    console.log(
      '✓ PWA · 联网取得新版入口、指纹资源优先缓存、旧标签草稿保留、关闭后自动刷新、断网重开、旧缓存清理',
    )
  } finally {
    await context?.close()
    await hosting?.close()
    await rm(dir, { recursive: true, force: true })
  }
}
