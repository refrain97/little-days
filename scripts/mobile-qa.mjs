// Run from a checkout (or from the commit snapshot prepared by scripts/pre-push).
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { createInterface } from 'node:readline'
import { devices, webkit } from 'playwright'

const viewport = { width: 390, height: 844 }
const screenshots = resolve(
  process.env.MOBILE_QA_SCREENSHOTS || 'qa-screenshots',
)
const pass = (label) => console.log('✓ ' + label)
const pages = [
  { id: 'home', tab: '手记', title: '生活手记' },
  { id: 'kitchen', tab: '吃点啥', title: '吃点啥' },
  { id: 'free', tab: '有空', title: '现在有空' },
]
const stops = [
  ['top', '顶部', 0],
  ['middle', '中段', 0.5],
  ['bottom', '底部', 1],
  ['return-top', '回顶', 0],
]

async function screenshot(page, name, visibleOnly = false) {
  const clip = visibleOnly
    ? await page.evaluate(() => ({
        x: visualViewport.offsetLeft,
        y: visualViewport.offsetTop,
        width: visualViewport.width,
        height: visualViewport.height,
      }))
    : undefined
  await page.screenshot({ path: resolve(screenshots, name + '.png'), clip })
}

function startPreview() {
  const env = { ...process.env }
  delete env.JOURNAL_TLS_KEY
  delete env.JOURNAL_TLS_CERT
  const child = spawn(
    process.execPath,
    [
      'server.mjs',
      '--host',
      '127.0.0.1',
      '--port',
      '0',
      '--base',
      '/little-days/',
    ],
    {
      cwd: process.cwd(),
      env,
      stdio: ['ignore', 'pipe', 'inherit'],
    },
  )
  const lines = createInterface({ input: child.stdout })
  let timeout
  const ready = new Promise((resolve, reject) => {
    timeout = setTimeout(() => reject(new Error('本地预览服务启动超时')), 15000)
    child.once('error', reject)
    child.once('exit', (code) =>
      reject(new Error('本地服务提前结束，退出码 ' + code)),
    )
    lines.on('line', (line) => {
      const match = line.match(/http:\/\/127\.0\.0\.1:\d+\/little-days\//)
      if (match) resolve(match[0])
    })
  }).finally(() => clearTimeout(timeout))
  return { child, ready }
}

async function turnTo(page, id) {
  const item = pages.find((item) => item.id === id)
  const button = page
    .locator('.bottom-nav')
    .getByRole('button', { name: item.tab, exact: true })
  await button.tap()
  await page
    .getByRole('heading', { name: item.title, exact: true, level: 1 })
    .waitFor()
  assert.equal(
    await button.getAttribute('aria-current'),
    'page',
    item.tab + ' 未切换为当前页',
  )
}

// Keep the real demos; add a few local wishes so the free-time page genuinely scrolls.
// The fresh browser context has no credentials; no record is added to the user's notebook.
async function seedLocalWishes(page) {
  await page.evaluate(async () => {
    const { putPlan } = await import('./src/plans.js')
    for (const title of [
      '周末逛书店',
      '晒晒被子',
      '给阳台的花换盆',
      '去公园走一圈',
      '洗一洗运动鞋',
      '试做芝麻饼干',
      '整理旅行照片',
      '给朋友挑本书',
      '去看新展',
      '在河边画一张速写',
      '听一张新唱片',
      '晚饭后散步',
    ]) {
      await putPlan({
        title,
        kind: 'wish',
        visibility: 'private',
        setting: 'any',
      })
    }
  })
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.locator('.entry-card').first().waitFor()
}

async function checkScroll(page, fraction, label) {
  const actual = await page
    .evaluate(async (fraction) => {
      const main = document.querySelector('#main')
      const nav = document.querySelector('.bottom-nav')
      if (main.contains(nav)) throw Error('底栏位于正文滚动容器内部')
      const frame = () =>
        new Promise((resolve) => requestAnimationFrame(resolve))
      const limit = main.scrollHeight - main.clientHeight
      if (limit < 100)
        throw Error('测试内容未产生有效的滚动区，高度差 ' + limit + 'px')
      const from = main.scrollTop,
        target = Math.round(fraction * limit)
      let maxGap = 0
      for (let step = 1; step <= 6; step++) {
        main.scrollTop = Math.round(from + ((target - from) * step) / 6)
        await frame()
        const rect = nav.getBoundingClientRect()
        const visibleBottom = visualViewport.offsetTop + visualViewport.height
        const gap = Math.abs(rect.bottom - visibleBottom)
        maxGap = Math.max(maxGap, gap)
        if (
          gap > 2 ||
          rect.top < visualViewport.offsetTop - 2 ||
          rect.height <= 0
        ) {
          throw Error('底栏脱离视口，底边偏差 ' + gap.toFixed(2) + 'px')
        }
        const css = getComputedStyle(nav)
        if (
          css.visibility !== 'visible' ||
          Number(css.opacity) === 0 ||
          rect.left < -2 ||
          rect.right > innerWidth + 2
        )
          throw Error('底部导航不可见或左右超出视口')
        for (const button of nav.querySelectorAll('button')) {
          const box = button.getBoundingClientRect()
          if (
            !button.contains(
              document.elementFromPoint(
                box.x + box.width / 2,
                box.y + box.height / 2,
              ),
            )
          )
            throw Error('底栏导航被遮挡：' + button.textContent.trim())
        }
        if (window.scrollY || document.scrollingElement.scrollTop)
          throw Error('正文滚动穿透到文档')
        if (
          document.documentElement.scrollWidth > innerWidth ||
          document.body.scrollWidth > innerWidth ||
          main.scrollWidth > main.clientWidth
        )
          throw Error('页面存在横向溢出')
      }
      if (Math.abs(main.scrollTop - target) > 2)
        throw Error('实际滚动位置 ' + main.scrollTop + '，目标 ' + target)
      for (let node = nav.parentElement; node; node = node.parentElement) {
        const css = getComputedStyle(node)
        for (const property of [
          'transform',
          'filter',
          'backdropFilter',
          'webkitBackdropFilter',
        ]) {
          if (css[property] && css[property] !== 'none')
            throw Error(
              node.tagName + ' 通过 ' + property + ' 改变了底栏的定位环境',
            )
        }
      }
      return { top: main.scrollTop, gap: maxGap }
    }, fraction)
    .catch((error) => {
      throw new Error(label + '：' + error.message, { cause: error })
    })
  pass(
    label +
      ' · scrollTop ' +
      Math.round(actual.top) +
      'px · 底边最大偏差 ' +
      actual.gap.toFixed(1) +
      'px · 无横向溢出',
  )
}

// A trial click can scroll an obscured button into view. Measure and hit-test before interacting.
async function assertExposed(control, label) {
  const geometry = await control.evaluate((el) => {
    const box = el.getBoundingClientRect(),
      view = window.visualViewport
    const fits =
      box.width > 0 &&
      box.height > 0 &&
      box.left >= view.offsetLeft - 1 &&
      box.right <= view.offsetLeft + view.width + 1 &&
      box.top >= view.offsetTop - 1 &&
      box.bottom <= view.offsetTop + view.height + 1
    const points = [
      [0.5, 0.5],
      [0.15, 0.3],
      [0.85, 0.3],
      [0.15, 0.7],
      [0.85, 0.7],
    ]
    const hit = points.every(([x, y]) =>
      el.contains(
        document.elementFromPoint(
          box.x + box.width * x,
          box.y + box.height * y,
        ),
      ),
    )
    return {
      fits,
      hit,
      enabled: !el.disabled,
      top: box.top,
      bottom: box.bottom,
      viewportTop: view.offsetTop,
      viewportBottom: view.offsetTop + view.height,
    }
  })
  assert(
    geometry.fits && geometry.hit && geometry.enabled,
    label + ' 遮挡或超出可视区域 ' + JSON.stringify(geometry),
  )
}

async function keyboardViewport(page, reduced) {
  await page.evaluate(async (reduced) => {
    const view = visualViewport
    for (const [key, value] of [
      ['height', 420],
      ['offsetTop', 20],
    ]) {
      if (reduced)
        Object.defineProperty(view, key, {
          configurable: true,
          get: () => value,
        })
      else delete view[key]
    }
    view.dispatchEvent(new Event('resize'))
    view.dispatchEvent(new Event('scroll'))
    await new Promise((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(resolve)),
    )
  }, reduced)
}

async function checkDialog(page, spec) {
  await turnTo(page, spec.page)
  // Record focus events as well as the final active element to catch focus-then-blur keyboard flashes.
  await page.evaluate(() => {
    window.qaFocusHistory = []
    window.qaWatchFocus = (event) => {
      if (
        event.target.closest('dialog') &&
        event.target.matches('input,textarea,select,[contenteditable=true]')
      )
        window.qaFocusHistory.push(event.target.tagName)
    }
    document.addEventListener('focusin', window.qaWatchFocus)
  })
  await page.getByRole('button', { name: spec.open, exact: true }).first().tap()
  const dialog = page.locator(spec.dialog + '[open]')
  await dialog.waitFor()
  await page.evaluate(
    () =>
      new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve)),
      ),
  )
  const initial = await page.evaluate(() => {
    document.removeEventListener('focusin', window.qaWatchFocus)
    return {
      inputFocused: document.activeElement.matches(
        'input,textarea,select,[contenteditable=true]',
      ),
      history: window.qaFocusHistory,
      scrollState: getComputedStyle(document.querySelector('#main')).overflowY,
      scrollTop: document.querySelector('#main').scrollTop,
    }
  })
  assert(
    !initial.inputFocused && !initial.history.length,
    spec.open + ' 打开时自动聚焦了输入框 ' + initial.history,
  )
  assert(
    ['hidden', 'clip'].includes(initial.scrollState),
    spec.open + ' 打开时底层正文未锁定',
  )
  const save = dialog.getByRole('button', { name: spec.save, exact: true })
  await assertExposed(save, spec.save)
  await screenshot(page, spec.name + '-open')
  pass(
    spec.open + ' · 打开未聚焦输入控件 · 底层锁定 · ' + spec.save + ' 完整可点',
  )
  const field = dialog.locator(spec.field)
  await field.tap()
  await keyboardViewport(page, true)
  await field.fill('周末买花')
  await assertExposed(field, spec.open + ' 手动选中的输入框')
  await assertExposed(save, spec.save)
  assert.equal(
    await page.locator('#main').evaluate((el) => el.scrollTop),
    initial.scrollTop,
    spec.open + ' 输入过程中底层页面滚动',
  )
  await screenshot(page, spec.name + '-keyboard', true)
  await save.tap()
  await dialog.waitFor({ state: 'detached' })
  await keyboardViewport(page, false)
  assert(
    await page
      .locator('#main')
      .evaluate(
        (el) =>
          getComputedStyle(el).overflowY === 'auto' ||
          getComputedStyle(el).overflowY === 'scroll',
      ),
    '关闭后正文未解锁',
  )
  pass(
    spec.open +
      ' · 模拟键盘可视高度 420px · 输入框与保存按钮可见 · 点按保存后解锁',
  )
}

async function run() {
  await mkdir(screenshots, { recursive: true })
  const { child, ready } = startPreview()
  let browser
  try {
    const base = await ready
    browser = await webkit.launch()
    const context = await browser.newContext({
      ...devices['iPhone 13'],
      viewport,
      screen: viewport,
      isMobile: true,
      hasTouch: true,
      deviceScaleFactor: 2,
      serviceWorkers: 'block',
      locale: 'zh-CN',
    })
    const failures = []
    await context.route('**/*', (route) => {
      const url = new URL(route.request().url())
      if (
        url.origin === new URL(base).origin ||
        ['data:', 'blob:'].includes(url.protocol)
      )
        return route.continue()
      failures.push('尝试访问外部地址 ' + url.origin)
      return route.abort()
    })
    const page = await context.newPage()
    page.setDefaultTimeout(6000)
    page.on('pageerror', (error) => failures.push(error.message))
    page.on('response', (response) => {
      if (response.status() >= 400)
        failures.push(
          'HTTP ' + response.status() + ' ' + new URL(response.url()).pathname,
        )
    })
    await page.goto(base, { waitUntil: 'domcontentloaded' })
    await page.locator('.entry-card').first().waitFor()
    assert.deepEqual(
      await page.evaluate(() => [
        innerWidth,
        innerHeight,
        'ontouchstart' in window && matchMedia('(pointer:coarse)').matches,
      ]),
      [390, 844, true],
      '手机视口或触屏参数错误',
    )
    await seedLocalWishes(page)
    for (const item of pages) {
      await turnTo(page, item.id)
      for (const [filename, label, position] of stops) {
        await checkScroll(page, position, item.tab + ' · ' + label)
        await screenshot(page, item.id + '-' + filename)
      }
    }
    await checkDialog(page, {
      page: 'home',
      name: 'capture',
      open: '记一笔',
      dialog: '.life-capture',
      field: '[data-body]',
      save: '存入手记',
    })
    await checkDialog(page, {
      page: 'free',
      name: 'plan',
      open: '记个想做',
      dialog: '.ft-editor',
      field: '[data-title]',
      save: '记下来',
    })
    assert.deepEqual(failures, [], '浏览器错误或意外网络请求')
    pass('移动端验收全部通过 · 16 张截图 · ' + screenshots)
  } finally {
    try {
      await browser?.close()
    } finally {
      child.kill()
    }
  }
}

await run()
