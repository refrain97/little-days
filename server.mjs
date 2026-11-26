// Local static-file preview. The distributed app runs directly on GitHub Pages.
import http from 'node:http'
import https from 'node:https'
import { readFile, lstat } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { extname, resolve } from 'node:path'
import { collectSite } from './scripts/build.mjs'

const args = process.argv.slice(2)
function option(name, fallback) {
  const index = args.indexOf(name)
  return index >= 0 && args[index + 1] && !args[index + 1].startsWith('--')
    ? args[index + 1]
    : fallback
}

const base = (
  '/' +
  option('--base', '').split('/').filter(Boolean).join('/') +
  '/'
).replace(/^\/\//, '/')
if (base.includes('..') || /[?#\\%]/.test(base))
  throw new Error('请使用简单的站点子路径，例如 /little-days/。')
const port = Number(option('--port', process.env.PORT || 5173))
const host = option('--host', args.includes('--host') ? '0.0.0.0' : '127.0.0.1')
const dist = fileURLToPath(new URL('./dist/', import.meta.url))
const preview = args.includes('--preview')
let site = preview ? null : await collectSite()
const mime = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/manifest+json',
  '.webmanifest': 'application/manifest+json',
  '.jpg': 'image/jpeg',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
}

async function handle(req, res) {
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('Cache-Control', 'no-cache')
  try {
    const path = decodeURIComponent(
      new URL(req.url, 'http://localhost').pathname,
    )
    if (base !== '/' && path === base.slice(0, -1)) {
      res.writeHead(308, { Location: encodeURI(base) })
      return res.end()
    }
    if (!['GET', 'HEAD'].includes(req.method)) {
      res.writeHead(405, { Allow: 'GET, HEAD' })
      return res.end()
    }
    if (!path.startsWith(base)) throw new Error()
    const name = path.slice(base.length) || 'index.html'
    if (!name.split('/').every((part) => /^[\w-][\w.\-]*$/.test(part)))
      throw new Error()
    let data
    if (preview) {
      const file = resolve(dist, name)
      if (!(await lstat(file)).isFile()) throw new Error()
      data = await readFile(file)
    } else {
      if (name === 'index.html' || name === 'sw.js') site = await collectSite()
      data = site.get(name)
      if (!data) throw new Error()
    }
    res.writeHead(200, {
      'Content-Type': mime[extname(name)] || 'application/octet-stream',
      'Content-Length': data.length,
    })
    res.end(req.method === 'HEAD' ? undefined : data)
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' })
    res.end('未找到页面或静态资源')
  }
}

const key = process.env.JOURNAL_TLS_KEY
const cert = process.env.JOURNAL_TLS_CERT
if (Boolean(key) !== Boolean(cert))
  throw new Error('HTTPS 需要同时设置 JOURNAL_TLS_KEY 和 JOURNAL_TLS_CERT。')
const server = key
  ? https.createServer(
      { key: await readFile(key), cert: await readFile(cert) },
      handle,
    )
  : http.createServer(handle)
server.on('error', (error) => {
  console.error(error.message)
  process.exitCode = 1
})
server.listen(port, host, () =>
  console.log(
    '小日子静态预览 ' +
      (key ? 'https' : 'http') +
      '://' +
      host +
      ':' +
      server.address().port +
      encodeURI(base),
  ),
)
