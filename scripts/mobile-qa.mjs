// Run from a checkout (or from the commit snapshot prepared by scripts/pre-push).
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { createInterface } from 'node:readline'
import { devices, webkit } from 'playwright'
import { collectSite } from './build.mjs'

import { checkTwoDevices, checkRecordingMigration } from './cloud-qa.mjs'
import { checkPwaUpdates } from './pwa-qa.mjs'

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

async function checkShellBounds(page, label, afterClose = false) {
  const state = await page.evaluate(() => {
    const shell = document.querySelector('#app')
    const nav = document.querySelector('.bottom-nav')
    return {
      position: getComputedStyle(shell).position,
      top: shell.getBoundingClientRect().top,
      bottom: shell.getBoundingClientRect().bottom,
      navBottom: nav.getBoundingClientRect().bottom,
      height: innerHeight,
      documentY: window.scrollY,
      leaking: [
        document.documentElement,
        document.body,
        shell,
        document.querySelector('#main'),
        nav,
      ].some((el) =>
        [
          'height',
          '--visible-height',
          '--visible-top',
          '--keyboard-offset',
        ].some((name) => el.style.getPropertyValue(name)),
      ),
      focusedInput: document.activeElement?.matches(
        'input,textarea,[contenteditable=true]',
      ),
    }
  })
  assert.equal(state.position, 'fixed', label + ' 手机壳应固定在布局视口')
  assert.equal(state.documentY, 0, label + ' 页面留下了滚动位移')
  assert(
    Math.abs(state.top) <= 2 &&
      Math.abs(state.bottom - state.height) <= 2 &&
      Math.abs(state.navBottom - state.height) <= 2,
    label + ' 底部出现空白 ' + JSON.stringify(state),
  )
  assert.equal(state.leaking, false, label + ' 键盘样式泄漏到底层')
  if (afterClose)
    assert.equal(state.focusedInput, false, label + ' 关闭后仍有输入框聚焦')
}

async function keyboardDismissed(page, label) {
  // Safari can keep reporting its short visual viewport even after removing the editor.
  await checkShellBounds(page, label + ' 刚关闭', true)
  await page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 150)))
  await checkShellBounds(page, label + ' 收起动画中', true)
  await keyboardViewport(page, false)
  await checkShellBounds(page, label + ' 收起后', true)
}

async function noRecorderControls(page) {
  assert.equal(
    await page.locator('audio, input[type=file][accept*="audio" i]').count(),
    0,
  )
  const buttons = await page
    .locator('button,[role=button]')
    .evaluateAll((elements) =>
      elements.map((el) =>
        [
          el.textContent,
          el.getAttribute('title'),
          el.getAttribute('aria-label'),
        ].join(' '),
      ),
    )
  assert(
    !buttons.some((label) =>
      /录音|麦克风|语音速记|语音识别|转写|开始听写/.test(label),
    ),
    '存在网页录音入口',
  )
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
  await noRecorderControls(page)
  const field = dialog.locator(spec.field)
  await field.tap()
  await keyboardViewport(page, true)
  await field.fill('周末买花')
  await checkShellBounds(page, spec.open + ' 键盘展开')
  await assertExposed(field, spec.open + ' 手动选中的输入框')
  await assertExposed(save, spec.save)
  assert.equal(
    await page.locator('#main').evaluate((el) => el.scrollTop),
    initial.scrollTop,
    spec.open + ' 输入过程中底层页面滚动',
  )
  await screenshot(page, spec.name + '-keyboard', true)
  const saveStarted = Date.now()
  await save.tap()
  await dialog.waitFor({ state: 'detached' })
  assert(Date.now() - saveStarted < 10000, spec.save + ' 无 Key 保存超过 10 秒')
  await keyboardDismissed(page, spec.save)
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

async function checkEditorCancel(page) {
  await turnTo(page, 'home')
  for (const [action, selector, fieldSelector] of [
    ['记一笔', '.life-capture', '[data-body]'],
    ['一句话速记', '.quick-note', '[data-input]'],
  ]) {
    await page.getByRole('button', { name: action, exact: true }).first().tap()
    const dialog = page.locator('dialog' + selector + '[open]')
    const field = dialog.locator(fieldSelector)
    await field.fill('这一句只写在草稿里')
    await keyboardViewport(page, true)
    assert(
      await dialog.evaluate(
        (el) => el.style.getPropertyValue('--visible-height') === '420px',
      ),
    )
    await field.blur()
    assert.equal(
      await dialog.evaluate((el) =>
        el.style.getPropertyValue('--visible-height'),
      ),
      '',
      action + ' 失焦后还保留键盘高度',
    )
    await field.tap()
    await keyboardViewport(page, true)
    await dialog.locator('[data-close]').tap()
    await dialog.waitFor({ state: 'detached' })
    await keyboardDismissed(page, action + ' 取消')
  }
  pass('键盘收起 · 输入框失焦清除弹窗尺寸 · 两类手记弹窗取消后没有底部空白')
}

async function checkPlanResponse(page) {
  await turnTo(page, 'free')
  const row = page
    .locator('.ft-task-body')
    .filter({ hasText: '周末买花' })
    .first()
  await row.tap()
  const detail = page.locator('.plan-detail')
  const title = await detail.locator('h2').textContent()
  await detail.locator('.item-stamps summary').tap()
  await detail.locator('[data-act-stamp=healed]').tap()
  await page.waitForFunction(
    () =>
      document
        .querySelector('.plan-detail [data-act-stamp=healed]')
        ?.getAttribute('aria-pressed') === 'true',
  )
  assert.equal(await detail.locator('h2').textContent(), title)
  await detail.locator('.item-stamps li').first().waitFor()
  await page.locator('.close-sheet').tap()
  pass('有空 · 伙伴对同一清单事项盖章后仍停留在原事项')
}

async function checkJournalPolish(page) {
  await turnTo(page, 'home')
  for (const category of ['回忆', '灵感', '美食', '饮品']) {
    const cards = page.locator('.entry-card[data-category="' + category + '"]')
    assert(await cards.count(), category + ' 缺少验收样本')
    if (category === '回忆' || category === '灵感') {
      assert.equal(
        await cards.locator('.card-rating').count(),
        0,
        category + ' 不应显示星级和态度',
      )
    } else {
      assert(
        await cards.locator('.card-rating b').count(),
        category + ' 缺少评分',
      )
    }
  }
  const drink = page.locator('.entry-card').filter({
    has: page.getByRole('heading', { name: '午后的冰拿铁', exact: true }),
  })
  await drink.locator('.choose-stamp').tap()
  const dialog = page.getByRole('dialog', { name: '盖个小回应' })
  assert.deepEqual(await dialog.locator('[data-act-stamp]').allTextContents(), [
    '我也想喝！',
    '看起来好冰爽',
  ])
  await screenshot(page, 'drink-stamps')
  await dialog.locator('.close-sheet').tap()
  pass('手记 · 回忆与灵感无星级和态度 · 美食饮品保留评分 · 饮品专属盖章')
}

async function checkSettings(page) {
  await page.locator('.mobile-settings').tap()
  async function inspect(selector, label) {
    const control = page.locator(selector)
    await control.evaluate(async (el) => {
      el.scrollIntoView({ block: 'center', behavior: 'instant' })
      await new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve)),
      )
    })
    await assertExposed(control, label)
    return control
  }
  await (await inspect('[data-space-summary]', '云空间配置入口')).tap()
  for (const [key, label] of [
    ['repo', '私库名'],
    ['name', '昵称'],
    ['animal', '动物头像'],
    ['token', '设备 Token'],
  ]) {
    await inspect('[data-space-' + key + ']', label)
  }
  await inspect('[data-connect]', '验证并连接')
  await screenshot(page, 'settings-cloud')
  const trash = await inspect('[data-trash]', '回收站入口')
  await trash.tap()
  await (await inspect('.ai-tools summary', 'AI 设置')).tap()
  for (const [selector, label] of [
    ['[data-ai-endpoint]', 'AI 接口'],
    ['[data-ai-model]', '模型名'],
    ['[data-ai-key]', '本机 Key'],
    ['[data-ai-form] [type=submit]', '保存 AI 配置'],
  ]) {
    await inspect(selector, label)
  }
  await screenshot(page, 'settings-ai')
  await inspect('[data-private-backup-export]', '导出私人备份')
  const choose = await inspect('[data-private-backup-choose]', '导入私人备份')
  await screenshot(page, 'settings-private-backup')
  const [chooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    choose.tap(),
  ])
  await chooser.setFiles([])
  assert(
    await page
      .locator('.sheet')
      .evaluate((el) => el.scrollWidth <= el.clientWidth + 1),
    '设置面板横向溢出',
  )
  await page.locator('.close-sheet').tap()
  pass('390px 设置 · 云空间、回收站、AI 与私人备份逐控件无遮挡且可操作')
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
  assert.equal(
    (await card.locator('.quick-stamp').innerText()).trim(),
    '+ 盖个章',
  )
  await card.locator('.quick-stamp').tap()
  await card
    .locator('.quick-stamp.is-stamped .stamp-faces [data-animal=rabbit]')
    .waitFor()
  assert.equal(
    await card.locator('.quick-stamp').getAttribute('aria-pressed'),
    'true',
  )
  await card.locator('.choose-stamp').tap()
  const sheet = page.getByRole('dialog', { name: '盖个小回应' })
  await screenshot(page, 'reaction-stickers')
  await sheet.getByRole('button', { name: '好治愈' }).tap()
  await page.reload({ waitUntil: 'domcontentloaded' })
  const applied = card.getByRole('button', { name: '好治愈' })
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
    const before = await adapter.snapshot()
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
    const updated = await toggleStamp(id, 'healed')
    if (updated.reactions.filter((row) => row.stamp).length !== 2)
      throw Error('两枚回应互相覆盖')
    const after = await adapter.snapshot()
    const queued = after.entities.find(
      (e) => e.kind === 'entries' && e.id === id,
    )
    if (
      queued?.data.reactions.filter((r) => r.stamp).length !== 2 ||
      after.outboxRevision === before.outboxRevision
    )
      throw Error('共享回应未进入持久化同步队列')
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
  await pool.getByRole('button', { name: /芝麻豆浆杯/ }).tap()
  await draw.locator('.item-stamps summary').tap()
  const response = draw.locator('[data-act-stamp=taste]')
  await response.tap()
  await page.waitForFunction(
    () =>
      document
        .querySelector('.bf-slip [data-act-stamp=taste]')
        ?.getAttribute('aria-pressed') === 'true',
  )
  await draw.locator('[data-action=breakfast-edit]').tap()
  const editor = page.getByRole('dialog', { name: '编辑早餐点子' })
  await editor.locator('[name=title]').fill('芝麻热豆浆')
  await editor.locator('[name=visibility]').selectOption('private')
  await editor.getByRole('button', { name: '保存修改' }).tap()
  await pool.getByRole('button', { name: /芝麻热豆浆/ }).tap()
  assert.equal(await draw.locator('.item-stamps').count(), 0)
  await draw.locator('[data-action=breakfast-edit]').tap()
  await editor.getByRole('button', { name: '移除这个点子' }).tap()
  await page.getByRole('button', { name: '确认移除' }).tap()
  await pool
    .getByRole('button', { name: /芝麻热豆浆/ })
    .waitFor({ state: 'detached' })
  pass('早餐点子 · 双人盖章、编辑、改为仅自己、移除')
  pass(
    '早餐池 · 10:29 与 10:30 边界、手动切换、快手点子入池、抽签与今日盖章持久化',
  )
}

async function checkQuickNote(page) {
  await turnTo(page, 'home')
  await noRecorderControls(page)
  const open = page.locator('.bottom-nav [data-action="quick-note"]')
  await page.locator('#main').evaluate((el) => {
    el.scrollTop = el.scrollHeight
  })
  await assertExposed(open, '滚动后打开一句话速记')
  for (const [kind, words] of [
    ['entry', '今天早餐在山间咖啡喝了拿铁，太好喝了，下次还要。'],
    ['plan', '找个晴天去河边野餐'],
  ]) {
    await open.tap()
    const dialog = page.getByRole('dialog', { name: '一句话速记' })
    const field = dialog.getByPlaceholder(
      '点键盘右下角话筒直接说，或随手写一句…',
    )
    const save = dialog.getByRole('button', { name: '记下来', exact: true })
    assert.equal(
      await page.evaluate(() =>
        document.activeElement.matches('input,textarea'),
      ),
      false,
    )
    await noRecorderControls(page)
    if (kind === 'entry') await screenshot(page, 'quick-note-open')
    await field.tap()
    await keyboardViewport(page, true)
    await field.fill(words)
    await assertExposed(field, '键盘上方的速记输入框')
    await assertExposed(save, '键盘上方的记下来')
    await checkShellBounds(page, '一句话速记打字中')
    if (kind === 'plan') {
      const scope = dialog.locator('[data-visibility]')
      await scope.tap()
      assert.equal(
        await scope.innerText(),
        '仅自己',
        '键盘弹起时点按可见范围应生效',
      )
    }
    if (kind === 'entry') await screenshot(page, 'quick-note-keyboard', true)
    const started = Date.now()
    await save.tap()
    await dialog.waitFor({ state: 'detached' })
    assert(Date.now() - started < 10000, '速记保存超过10秒')
    await keyboardDismissed(page, '一句话速记提交')
  }
  const state = await page.evaluate(async () => {
    const { readRecords, journalDatabase } = await import('./src/storage.js')
    const { readPlans } = await import('./src/plans.js')
    const note = (await readRecords()).find((row) =>
      row.text.includes('今天早餐在山间咖啡'),
    )
    const plans = await readPlans()
    const db = await journalDatabase()
    const request = db.transaction('records').objectStore('records').getAll()
    const records = await new Promise((ok, fail) => {
      request.onsuccess = () => ok(request.result)
      request.onerror = () => fail(request.error)
    })
    return {
      note,
      records,
      foundPlan: plans.some(
        (p) => p.title === '找个晴天去河边野餐' && p.visibility === 'private',
      ),
    }
  })
  assert(
    state.note?.isBreakfast &&
      state.note.category === '饮品' &&
      state.note.diningSource === 'out' &&
      state.note.venueName.includes('山间'),
  )
  assert(state.foundPlan, '待办未分流到有空清单')
  assert(
    state.records.some((row) => row.text === '周末买花'),
    '记一笔未实际写入',
  )
  assert(
    !/"(?:audio[^"]*|cloudAudioPath|recording|voiceBlob)"\s*:|data:audio\//i.test(
      JSON.stringify(state.records),
    ),
    'IndexedDB 手记包含音频附件或字段',
  )
  await noRecorderControls(page)
  await screenshot(page, 'quick-note-saved')
  pass(
    '一句话速记 · 早餐探店和待办正确分流 · 无网页录音入口与音频字段 · 键盘收起后底栏贴底',
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
    assert.equal(
      await page.locator('#main .filters').isVisible(),
      false,
      '桌面主区重复显示分类条',
    )
    assert.equal(
      await page.locator('.side-categories button:visible').count(),
      6,
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
  // Scan the exact scripts shipped to Pages, including lazily loaded modules.
  for (const [name, bytes] of await collectSite()) {
    if (name.endsWith('.js'))
      assert.doesNotMatch(
        bytes.toString(),
        /\b(?:MediaRecorder|(?:webkit)?SpeechRecognition|getUserMedia|AudioContext|webkitAudioContext)\b|audio\/transcriptions/,
        name + ' 包含已退役的网页录音接口',
      )
  }
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
    const photo = page.locator('.entry-card .card-cover img').first()
    await photo.waitFor()
    assert(
      await photo.evaluate(
        (el) => el.getBoundingClientRect().top < innerHeight * 0.5,
      ),
      '手记首图未在上半屏露出',
    )
    await seedLocalWishes(page)
    for (const item of pages) {
      await turnTo(page, item.id)
      await noRecorderControls(page)
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
    await checkPlanResponse(page)
    await checkJournalPolish(page)
    await checkSettings(page)
    await checkStickers(page)
    await checkBreakfast(page)
    await checkEditorCancel(page)
    await checkQuickNote(page)
    await checkDesktop(browser, base)
    await checkRecordingMigration(browser, base)
    await checkTwoDevices(browser, base, screenshot)
    await checkPwaUpdates(browser)
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
