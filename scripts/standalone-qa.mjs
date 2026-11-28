// WebKit device emulation has no iOS status bar or home indicator. Keep the
// hardware screen and the drawable viewport independent, and supply the four
// safe-area values to the actual page styles instead of styling the footer.
import assert from 'node:assert/strict'
import { devices } from 'playwright'

const fullScreen = {
  width: 402,
  height: 874,
  screenHeight: 874,
  top: 62,
  bottom: 34,
  standalone: true,
  rowGap: 34,
}
const shortScreen = { ...fullScreen, height: 812 }
const devicesUnderTest = [
  { ...fullScreen, name: 'full' },
  { ...shortScreen, name: 'short', rowGap: 5 },
  { ...shortScreen, name: 'top-reserved', top: 0 },
  { ...shortScreen, name: 'safari', standalone: false },
  {
    ...fullScreen,
    name: '390',
    width: 390,
    height: 844,
    screenHeight: 844,
    top: 47,
  },
]

async function createPhone(browser, base, spec) {
  const viewport = { width: spec.width, height: spec.height }
  const context = await browser.newContext({
    ...devices['iPhone 13'],
    viewport,
    screen: { width: spec.width, height: spec.screenHeight },
    deviceScaleFactor: 3,
    locale: 'zh-CN',
    serviceWorkers: 'block',
  })
  const displayQuery = spec.standalone ? '(min-width: 0px)' : '(max-width: 0px)'
  await context.addInitScript(
    ({ standalone, displayQuery }) => {
      Object.defineProperty(navigator, 'standalone', {
        configurable: true,
        value: standalone,
      })
      const query = window.matchMedia.bind(window)
      window.matchMedia = (value) =>
        query(
          value.replace(/\(display-mode\s*:\s*standalone\)/gi, displayQuery),
        )
    },
    { standalone: spec.standalone, displayQuery },
  )
  const insets = { top: spec.top, bottom: spec.bottom, left: 0, right: 0 }
  await context.route('**/*', async (route) => {
    const url = new URL(route.request().url())
    if (url.origin !== new URL(base).origin) return route.abort()
    if (!url.pathname.endsWith('.css')) return route.continue()
    const response = await route.fetch()
    assert(response.ok(), '读取手机验收样式失败 ' + url.pathname)
    const css = (await response.text())
      .replace(
        /env\(\s*safe-area-inset-(top|bottom|left|right)\s*(?:,\s*[^)]+)?\)/gi,
        (_, side) => insets[side] + 'px',
      )
      .replace(/\(display-mode\s*:\s*standalone\)/gi, displayQuery)
    await route.fulfill({ response, body: css })
  })
  return context
}

async function frames(page) {
  await page.evaluate(
    () =>
      new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve)),
      ),
  )
}

async function measure(page, spec, label, editing = false) {
  const result = await page.evaluate(({ height, width }) => {
    const nav = document.querySelector('.bottom-nav')
    const box = nav.getBoundingClientRect()
    const buttons = [...nav.querySelectorAll('button')].filter(
      (button) => button.getBoundingClientRect().height,
    )
    const touches = buttons.map((button) => {
      const rect = button.getBoundingClientRect()
      return {
        gap: height - rect.bottom,
        reachable:
          rect.left >= 0 &&
          rect.right <= width + 1 &&
          button.contains(
            document.elementFromPoint(
              rect.left + rect.width / 2,
              rect.top + rect.height / 2,
            ),
          ),
      }
    })
    const root = document.documentElement
    return {
      screen: [screen.width, screen.height],
      viewport: [innerWidth, innerHeight],
      docY: scrollY,
      touches,
      navBottom: box.bottom,
      mainGap:
        box.top -
        document.querySelector('#main').getBoundingClientRect().bottom,
      pageOverflow:
        root.scrollWidth > width || document.body.scrollWidth > width,
      bottomPaintedByNav: nav.contains(
        document.elementFromPoint(width / 2, height - 1),
      ),
      rootColor: getComputedStyle(root).backgroundColor,
      bodyColor: getComputedStyle(document.body).backgroundColor,
      navColor: getComputedStyle(nav).backgroundColor,
    }
  }, spec)
  const prefix = spec.name + ' · ' + label
  assert.deepEqual(
    result.screen,
    [spec.width, spec.screenHeight],
    prefix + ' 硬件尺寸不符',
  )
  assert.deepEqual(
    result.viewport,
    [spec.width, spec.height],
    prefix + ' 内容视口不符',
  )
  assert.equal(result.docY, 0, prefix + ' 页面产生了滚动位移')
  assert(
    !result.pageOverflow && Math.abs(result.mainGap) <= 2,
    prefix + ' 正文溢出或底栏上方有空隙',
  )
  assert(
    Math.abs(result.navBottom - spec.height) <= 2,
    prefix + ' 底栏未贴合可绘制区域下缘',
  )
  assert(result.touches.length >= 3, prefix + ' 缺少导航按钮')
  const rowGap = Math.min(...result.touches.map((b) => b.gap))
  assert(
    Math.abs(rowGap - spec.rowGap) <= 2,
    prefix + ' 实际按钮行下沿留白 ' + rowGap + 'px，期望 ' + spec.rowGap + 'px',
  )
  for (const button of result.touches) {
    assert(
      button.gap >= spec.rowGap - 2 && button.gap <= spec.rowGap + 8,
      prefix + ' 底栏按钮留白异常 ' + button.gap,
    )
    if (!editing) assert(button.reachable, prefix + ' 底栏按钮不可点击')
  }
  if (!editing)
    assert(result.bottomPaintedByNav, prefix + ' 视口最后一行未被导航覆盖')
  if (spec.standalone && spec.height < spec.screenHeight && spec.top > 0) {
    const canvasColor =
      result.rootColor === 'rgba(0, 0, 0, 0)'
        ? result.bodyColor
        : result.rootColor
    assert.equal(
      canvasColor,
      result.navColor,
      prefix + ' 宿主背景与导航底色不连续',
    )
  }
  return rowGap
}

async function pressKeyboard(page, shown) {
  await page.evaluate((shown) => {
    for (const [key, value] of [
      ['height', 414],
      ['offsetTop', 14],
    ]) {
      if (shown)
        Object.defineProperty(visualViewport, key, {
          configurable: true,
          value,
        })
      else delete visualViewport[key]
    }
    visualViewport.dispatchEvent(new Event('resize'))
    visualViewport.dispatchEvent(new Event('scroll'))
  }, shown)
  await frames(page)
}

async function keyboardCycle(
  page,
  spec,
  { open, dialog, field, submit },
  screenshot,
) {
  await page.getByRole('button', { name: open, exact: true }).first().tap()
  const sheet = page.locator(dialog + '[open]')
  const input = sheet.locator(field)
  await input.fill('今天在家做了早餐吐司')
  await pressKeyboard(page, true)
  await measure(page, spec, open + ' 打字中', true)
  const button = sheet.getByRole('button', { name: submit, exact: true })
  for (const control of [input, button]) {
    assert(
      await control.evaluate((el) => {
        const rect = el.getBoundingClientRect()
        return (
          rect.top >= visualViewport.offsetTop - 1 &&
          rect.bottom <= visualViewport.offsetTop + visualViewport.height + 1 &&
          el.contains(
            document.elementFromPoint(
              rect.x + rect.width / 2,
              rect.y + rect.height / 2,
            ),
          )
        )
      }),
      open + ' 输入框或保存按钮被键盘遮挡',
    )
  }
  await button.tap()
  await sheet.waitFor({ state: 'detached' })
  // Hold the short visual viewport through the end of the keyboard animation.
  await page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 150)))
  await measure(page, spec, open + ' 刚关闭')
  await pressKeyboard(page, false)
  await measure(page, spec, open + ' 键盘收起')
  if (screenshot) await screenshot(page, 'standalone-keyboard-closed')
}

export async function checkStandaloneLayout(browser, base, screenshot) {
  for (const spec of devicesUnderTest) {
    const context = await createPhone(browser, base, spec)
    try {
      const page = await context.newPage()
      await page.goto(base)
      await page.locator('.entry-card').first().waitFor()
      await frames(page)
      const gap = await measure(page, spec, '首次打开')
      const nav = page.locator('.bottom-nav')
      if (spec.name === 'full' || spec.name === 'short') {
        await screenshot(page, 'standalone-' + spec.name)
        for (const tab of ['吃点啥', '有空', '手记']) {
          await nav.getByRole('button', { name: tab, exact: true }).tap()
          await page.locator('#main').evaluate((el) => {
            el.scrollTop = el.scrollHeight
          })
          await frames(page)
          await measure(page, spec, '滚动后 ' + tab)
        }
      }
      if (spec.name === 'short') {
        await keyboardCycle(page, spec, {
          open: '记一笔',
          dialog: '.life-capture',
          field: '[data-body]',
          submit: '存入手记',
        })
        await keyboardCycle(
          page,
          spec,
          {
            open: '一句话速记',
            dialog: '.quick-note',
            field: '[data-input]',
            submit: '记下来',
          },
          screenshot,
        )
        await page.setViewportSize({
          width: spec.width,
          height: spec.screenHeight,
        })
        // WebKit reports innerHeight before it delivers the final visual viewport
        // resize after a touch. Start the layout deadline once the simulated OS
        // has actually released the reserved area.
        await page.waitForFunction(
          (height) => Math.abs(visualViewport.height - height) <= 2,
          spec.screenHeight,
          { timeout: 6000 },
        )
        await page.waitForFunction(
          ({ height, bottom }) => {
            const nav = document.querySelector('.bottom-nav')
            const rowBottom = Math.max(
              ...[...nav.querySelectorAll('button')].map(
                (el) => el.getBoundingClientRect().bottom,
              ),
            )
            return (
              Math.abs(nav.getBoundingClientRect().bottom - height) <= 2 &&
              Math.abs(height - rowBottom - bottom) <= 2
            )
          },
          { height: spec.screenHeight, bottom: spec.bottom },
          { timeout: 1000 },
        )
        await frames(page)
        await measure(
          page,
          { ...spec, height: spec.screenHeight, rowGap: spec.bottom },
          '恢复全屏',
        )
      }
      console.log(
        '✓ 手机安全区模拟 · ' +
          spec.name +
          ' · 屏幕 ' +
          spec.width +
          '×' +
          spec.screenHeight +
          ' / 内容高 ' +
          spec.height +
          ' · 按钮行距内容底边 ' +
          gap +
          'px',
      )
    } finally {
      await context.close()
    }
  }
}
