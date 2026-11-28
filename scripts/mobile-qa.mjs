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
let screenshotCount = 0
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
  await page.evaluate(async () => {
    await document.fonts.ready
    await new Promise((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(resolve)),
    )
  })
  const clip = visibleOnly
    ? await page.evaluate(() => ({
        x: visualViewport.offsetLeft,
        y: visualViewport.offsetTop,
        width: visualViewport.width,
        height: visualViewport.height,
      }))
    : undefined
  await page.screenshot({ path: resolve(screenshots, name + '.png'), clip })
  screenshotCount++
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

async function checkStickers(page) {
  await turnTo(page, 'home')
  await page.locator('.mobile-settings').tap()
  const picker = page.getByRole('group', { name: '我的动物贴纸' })
  await picker.getByRole('button', { name: '小兔' }).tap()
  assert.equal(
    await picker
      .getByRole('button', { name: '小兔' })
      .getAttribute('aria-pressed'),
    'true',
  )
  await screenshot(page, 'animal-picker')
  await page.locator('.close-sheet').tap()
  const id = await page.evaluate(async () => {
    const entries = await (await import('./src/storage.js')).readRecords()
    return entries.find((e) => !e.isSample && e.text === '周末买花').id
  })
  const card = page
    .locator('.entry-card')
    .filter({ has: page.locator(`.quick-stamp[data-note="${id}"]`) })
  assert.equal(
    await card.locator('.author-mark').getAttribute('data-animal'),
    'rabbit',
  )
  await card.locator('.quick-stamp').tap()
  assert.equal(
    await card.locator('.quick-stamp').getAttribute('aria-pressed'),
    'true',
  )
  await card.locator('.choose-stamp').tap()
  const sheet = page.getByRole('dialog', { name: '盖个小回应' })
  await screenshot(page, 'reaction-stickers')
  await sheet.getByRole('button', { name: '厨神附体' }).tap()
  await page.reload({ waitUntil: 'domcontentloaded' })
  const applied = card.getByRole('button', { name: '厨神附体' })
  assert.equal(await applied.getAttribute('aria-pressed'), 'true')
  await applied.tap()
  assert.equal(
    await card.locator('.quick-stamp').getAttribute('aria-pressed'),
    'false',
  )
  await page.evaluate(async (id) => {
    const { createCloudAdapter } = await import('./src/cloud-local.js')
    const { toggleStamp } = await import('./src/storage.js')
    const adapter = createCloudAdapter()
    const before = JSON.stringify(await adapter.snapshot())
    const key = 'little.days.sticker-person'
    const original = localStorage.getItem(key)
    try {
      localStorage.setItem(
        key,
        JSON.stringify({ id: 'qa-friend', name: '测试伙伴', animal: 'fox' }),
      )
      await toggleStamp(id, 'visit')
    } finally {
      localStorage.setItem(key, original)
    }
    const updated = await toggleStamp(id, 'aroma')
    if (updated.reactions.filter((row) => row.stamp).length !== 2)
      throw Error('两枚回应互相覆盖')
    const after = JSON.stringify(await adapter.snapshot())
    if (before !== after) throw Error('本机贴纸误改了共享队列或云端数据格式')
  }, id)
  pass('共享手记 · 动物头像 · 盖章、更换、刷新保留、再次点按撤回')
}

async function checkBreakfast(page) {
  const activePeriod = page.locator(
    '[data-action="breakfast-period"][aria-pressed="true"]',
  )
  await page.clock.setFixedTime(new Date('2026-11-28T10:29:00+08:00'))
  await turnTo(page, 'kitchen')
  assert.equal(await activePeriod.getAttribute('data-value'), 'breakfast')
  await page.clock.setFixedTime(new Date('2026-11-28T10:30:00+08:00'))
  await turnTo(page, 'home')
  await turnTo(page, 'kitchen')
  assert.equal(await activePeriod.getAttribute('data-value'), 'main')
  await page
    .locator('[data-action="breakfast-period"][data-value="breakfast"]')
    .tap()
  const pool = page.locator('[data-breakfast-pool]')
  await pool.waitFor()
  await screenshot(page, 'breakfast-pool')
  await page.locator('[data-action="breakfast-add"]').tap()
  const add = page.getByRole('dialog', { name: '塞个早餐点子' })
  assert.equal(
    await page.evaluate(() => document.activeElement.matches('input,textarea')),
    false,
  )
  await add.locator('[name=title]').tap()
  await keyboardViewport(page, true)
  await add.locator('[name=title]').fill('芝麻豆浆杯')
  await assertExposed(
    add.locator('button[type=submit]'),
    '填写早餐时的入池按钮',
  )
  await screenshot(page, 'breakfast-add', true)
  await add.locator('[name=kind][value=quick]').check()
  await add.locator('button[type=submit]').tap()
  await add.waitFor({ state: 'hidden' })
  await keyboardViewport(page, false)
  await page
    .locator('[data-action="breakfast-filter"][data-value="quick"]')
    .tap()
  await pool.getByText('芝麻豆浆杯', { exact: true }).first().waitFor()
  await page.locator('[data-action="breakfast-draw"]').tap()
  const draw = page.getByRole('dialog', { name: '早餐抽签' })
  const confirm = draw.locator('[data-action="breakfast-accept"]')
  await assertExposed(confirm, '就吃这个')
  await screenshot(page, 'breakfast-draw')
  const next = draw.locator('[data-action="breakfast-next"]')
  const first = await draw.locator('h2').innerText()
  assert(await next.isEnabled(), '快手筛选至少应有两个可选早餐')
  await next.tap()
  assert.notEqual(
    await draw.locator('h2').innerText(),
    first,
    '换一张连续抽到相同早餐',
  )
  await confirm.tap()
  await page.locator('[data-breakfast-stamp]').first().waitFor()
  await page.reload({ waitUntil: 'domcontentloaded' })
  if ((await activePeriod.getAttribute('data-value')) !== 'breakfast')
    await page
      .locator('[data-action="breakfast-period"][data-value="breakfast"]')
      .tap()
  await page.locator('[data-breakfast-stamp]').first().waitFor()
  await screenshot(page, 'breakfast-decided')
  pass(
    '早餐池 · 10:29 与 10:30 边界、手动切换、快手点子入池、抽签与今日盖章持久化',
  )
}

async function checkVoice(page) {
  await turnTo(page, 'home')
  const open = page
    .locator('[data-action="quick-voice"]')
    .filter({ visible: true })
    .first()
  const dialog = page.locator('dialog.quick-voice[open]')
  // Stand-ins run only in this isolated context. No system microphone, external API or OS prompt.
  await page.evaluate(() => {
    class ChineseRecognition {
      start() {
        window.qaSpeech = this
        queueMicrotask(() => this.onstart?.())
      }
      stop() {
        queueMicrotask(() => this.onend?.())
      }
      abort() {
        this.stop()
      }
    }
    ChineseRecognition.prototype.processLocally = false
    for (const key of ['SpeechRecognition', 'webkitSpeechRecognition'])
      Object.defineProperty(window, key, {
        configurable: true,
        value: ChineseRecognition,
      })
    Object.defineProperty(navigator.mediaDevices, 'getUserMedia', {
      configurable: true,
      value: async () => {
        throw new DOMException('无麦克风权限', 'NotAllowedError')
      },
    })
  })
  await page.locator('#main').evaluate((main) => {
    main.scrollTop = main.scrollHeight
  })
  await assertExposed(open, '滚到底仍可一键语音速记')
  await open.tap()
  await assertExposed(dialog.locator('[data-close]'), '关闭语音速记')
  assert.equal(
    await page.evaluate(() => document.activeElement.matches('input,textarea')),
    false,
  )
  await screenshot(page, 'voice-listening')
  await dialog.locator('[data-close]').tap()
  await dialog.waitFor({ state: 'hidden' })
  await open.tap()
  await page.waitForFunction(() => window.qaSpeech?.lang === 'zh-CN')
  await page.evaluate(() => {
    window.qaSpeech.onresult({
      results: [
        { 0: { transcript: '找个晴天去河边野餐' }, isFinal: true, length: 1 },
      ],
      resultIndex: 0,
    })
  })
  await dialog.locator('[data-primary]').tap()
  await dialog.getByRole('button', { name: '存下来', exact: true }).waitFor()
  assert.match(await dialog.locator('[data-destination]').innerText(), /有空/)
  await screenshot(page, 'voice-confirm')
  await dialog.locator('[data-primary]').tap()
  await dialog.waitFor({ state: 'hidden' })
  assert(
    await page.evaluate(async () =>
      (await (await import('./src/plans.js')).readPlans()).some((p) =>
        p.title.includes('野餐'),
      ),
    ),
  )
  await page.evaluate(() => {
    for (const key of ['SpeechRecognition', 'webkitSpeechRecognition'])
      Object.defineProperty(window, key, {
        configurable: true,
        value: undefined,
      })
  })
  await open.tap()
  await dialog.locator('[data-type]').tap()
  await dialog
    .locator('[data-input]')
    .fill('今天早餐在山间咖啡喝了拿铁，太好喝了，下次还要。')
  await dialog.locator('[data-primary]').tap()
  await dialog.getByRole('button', { name: '存下来', exact: true }).waitFor()
  assert.match(await dialog.locator('[data-destination]').innerText(), /手记/)
  await dialog.locator('[data-tune]').tap()
  await assertExposed(dialog.locator('[data-primary]'), '微调后的存下来')
  await screenshot(page, 'voice-edit')
  await dialog.locator('[data-primary]').tap()
  await dialog.waitFor({ state: 'hidden' })
  const note = await page.evaluate(async () =>
    (await (await import('./src/storage.js')).readRecords()).find((e) =>
      e.text.includes('今天早餐在山间咖啡'),
    ),
  )
  assert(
    note?.isBreakfast &&
      note.diningSource === 'out' &&
      note.venueName.includes('山间'),
  )
  pass(
    '语音速记 · 浮层打开与关闭、中文语音事件、待办分流、无权限文字输入、早餐探店手记保存',
  )
}

async function checkDesktop(browser, base) {
  const desktop = await browser.newContext({
    viewport: { width: 1360, height: 900 },
    locale: 'zh-CN',
    serviceWorkers: 'block',
  })
  try {
    const origin = new URL(base).origin
    await desktop.route('**/*', (route) =>
      new URL(route.request().url()).origin === origin
        ? route.continue()
        : route.abort(),
    )
    const page = await desktop.newPage()
    await page.goto(base)
    const nav = page.getByRole('navigation', { name: '主导航' })
    await nav.getByRole('button', { name: '手记' }).waitFor()
    await page
      .locator('.entry-card [data-gallery-photo][data-ready]')
      .first()
      .waitFor()
    const cleanCover = page.locator('.entry-card').filter({
      has: page.getByRole('heading', { name: '把散步变成寻色游戏' }),
    })
    await cleanCover.waitFor()
    assert.equal(
      await cleanCover.locator('.card-body p').count(),
      0,
      '文字灵感卡片重复了封面文案',
    )
    const style = await page.locator('.sidebar').evaluate((node) => ({
      width: document.documentElement.scrollWidth,
      bgcolor: getComputedStyle(node).backgroundColor,
    }))
    assert(
      style.width <= 1360 &&
        !['rgb(72, 51, 69)', 'rgb(73, 50, 68)'].includes(style.bgcolor),
      '桌面侧栏或正文样式未更新',
    )
    await screenshot(page, 'desktop-journal')
    await nav.getByRole('button', { name: '吃点啥' }).click()
    await page
      .locator('[data-action="breakfast-period"][data-value="breakfast"]')
      .click()
    await page.locator('[data-breakfast-pool]').waitFor()
    await screenshot(page, 'desktop-breakfast')
    pass('桌面端 · 手记和早餐池可操作、文字卡无重复摘要、无横向溢出')
  } finally {
    await desktop.close()
  }
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
      timezoneId: 'Asia/Shanghai',
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
    await page.clock.setFixedTime(new Date('2026-11-28T12:00:00+08:00'))
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
    await checkStickers(page)
    await checkBreakfast(page)
    await checkVoice(page)
    await checkDesktop(browser, base)
    assert.deepEqual(failures, [], '浏览器错误或意外网络请求')
    pass('移动端验收全部通过 · ' + screenshotCount + ' 张截图 · ' + screenshots)
  } finally {
    try {
      await browser?.close()
    } finally {
      child.kill()
    }
  }
}

await run()
