// Two independent WebKit notebooks use the real UI, IndexedDB and REST client.
// Git blobs, the branch and both disposable tokens live only in this test process.
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { devices } from 'playwright'
import { Repository, fineToken } from '../tests/github-fixture.mjs'

async function device(browser, base, repo, failures) {
  const origin = new URL(base).origin
  const context = await browser.newContext({
    ...devices['iPhone 13'],
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    locale: 'zh-CN',
    serviceWorkers: 'block',
  })
  const link = { token: fineToken(), connected: true, conflicts: 0 }
  await context.route('**/*', async (route) => {
    const req = route.request(),
      url = new URL(req.url())
    if (url.origin === origin || ['blob:', 'data:'].includes(url.protocol))
      return route.continue()
    if (
      url.origin !== 'https://api.github.com' ||
      !url.pathname.startsWith('/repos/example/journal')
    ) {
      failures.push('意外的外部请求 ' + url.origin)
      return route.abort()
    }
    if (!link.connected) return route.abort('internetdisconnected')
    const headers = {
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Methods': 'GET,PUT,POST,PATCH,OPTIONS',
      'Access-Control-Allow-Headers':
        'Authorization,Accept,X-GitHub-Api-Version,Content-Type',
    }
    if (req.method() === 'OPTIONS')
      return route.fulfill({ status: 204, headers })
    if ((await req.allHeaders()).authorization !== 'Bearer ' + link.token)
      return route.fulfill({
        status: 401,
        headers,
        json: { message: 'Bad credentials' },
      })
    try {
      const result = await repo.fetch(url.href, {
        method: req.method(),
        headers: { Authorization: 'Bearer ' + repo.profile.token },
        body: req.postData(),
        redirect: 'error',
      })
      if (result.status === 409 && req.method() === 'PATCH') link.conflicts++
      await route.fulfill({
        status: result.status,
        headers,
        json: await result.json(),
      })
    } catch (e) {
      failures.push(e.message)
      await route.abort().catch(() => {})
    }
  })
  const page = await context.newPage()
  page.on('pageerror', (e) => failures.push(e.message))
  page.setDefaultTimeout(8000)
  await page.goto(base)
  await page.locator('.mobile-settings').tap()
  return { context, page, link }
}

async function connect(device, name, animal) {
  const { page, link } = device
  const form = page.locator('[data-space-form]')
  if (!(await form.isVisible()))
    await page.locator('[data-space-summary]').tap()
  await form.locator('[data-space-repo]').fill('example/journal')
  await form.locator('[data-space-name]').fill(name)
  await form.locator('[data-space-animal]').selectOption(animal)
  await form.locator('[data-space-token]').fill(link.token)
  await page
    .locator('[data-cloud-message]')
    .evaluate((el) => (el.textContent = ''))
  await form.locator('[data-connect]').tap()
  await page.waitForFunction(() =>
    document
      .querySelector('[data-cloud-message]')
      .textContent.includes('已连接'),
  )
  assert.match(
    await page.locator('[data-workspace-label]').textContent(),
    /已连接/,
  )
  assert.equal(await page.locator('.space-invite').isVisible(), false)
}

async function sync(page, expected = '同步完成') {
  await page
    .locator('[data-cloud-message]')
    .evaluate((el) => (el.textContent = ''))
  await page.locator('[data-sync]').tap()
  await page.waitForFunction(
    (text) =>
      document.querySelector('[data-cloud-message]').textContent.includes(text),
    expected,
  )
}

export async function checkTwoDevices(browser, base, screenshot) {
  const repo = new Repository(),
    failures = []
  const a = await device(browser, base, repo, failures)
  let b
  try {
    b = await device(browser, base, repo, failures)
    await connect(a, '小杏', 'cat')
    await connect(b, '小麦', 'rabbit')
    a.link.connected = false
    const seed = await a.page.evaluate(async () => {
      const { putRecord, readRecordWithMedia } =
        await import('./src/storage.js')
      const { putPlan } = await import('./src/plans.js')
      const { addBreakfast } = await import('./src/breakfast-store.js')
      function photo(color) {
        const c = document.createElement('canvas')
        c.width = 1100
        c.height = 720
        const ctx = c.getContext('2d')
        ctx.fillStyle = color
        ctx.fillRect(0, 0, 1100, 720)
        ctx.fillStyle = '#e8c67c'
        ctx.fillRect(99, 75, 801, 308)
        return c.toDataURL('image/jpeg', 0.88)
      }
      const note = await putRecord({
        id: 'qa-public',
        title: '双人早餐咖啡',
        category: '饮品',
        diningSource: 'out',
        venueName: '验收咖啡',
        text: '牛奶正好。',
        rating: 5,
        isBreakfast: true,
        image: photo('#abd2bd'),
        visibility: 'shared',
      })
      const privateNote = await putRecord({
        id: 'qa-personal',
        title: '本机的私密文字',
        category: '饮品',
        diningSource: 'out',
        venueName: '验收咖啡',
        rating: 1,
        image: photo('#a86a92'),
        visibility: 'private',
      })
      const privateBreakfast = await addBreakfast(
        '本机的私密早餐',
        'buy',
        'private',
      )
      const idea = await addBreakfast('双人芝麻饭团', 'quick', 'shared')
      const plan = await putPlan({
        title: '一起去野餐',
        kind: 'wish',
        visibility: 'shared',
      })
      const { exportPrivateBackup, importPrivateBackup } =
        await import('./src/backup.js')
      const backup = await exportPrivateBackup()
      if (
        !backup.breakfast.ideas.some((row) => row.id === privateBreakfast.id) ||
        backup.records.some((row) => row.visibility !== 'private') ||
        !backup.records[0]?.image.startsWith('data:image/')
      )
        throw Error('私人备份未完整包含照片或点子')
      await importPrivateBackup(backup)
      if (JSON.stringify(localStorage).includes(privateNote.title))
        throw Error('手记正文进入了 localStorage')
      return {
        note: note.id,
        privateNote: privateNote.id,
        privatePhoto: (await readRecordWithMedia(privateNote.id)).image,
        idea: idea.id,
        privateIdea: privateBreakfast.id,
        plan: plan.id,
      }
    })
    // The expired device retains all the above rows and both images until renewal.
    a.link.token = fineToken()
    a.link.connected = true
    await sync(a.page, 'Token')
    await a.page.locator('[data-space-token]').waitFor()
    await connect(a, '小杏', 'cat')
    await sync(a.page)
    await sync(b.page)
    const path = 'shared/entries/' + seed.note + '.json'
    const note = repo.read(path)
    assert.equal(note.data.isBreakfast, true)
    assert.equal(note.data.stickerAuthor.animal, 'cat')
    assert(repo.files.has(note.photoPath) && repo.files.has(note.thumbPath))
    assert.match(note.photoPath, /^shared\/photos\//)
    assert.match(note.thumbPath, /^shared\/thumbs\//)
    assert(repo.files.has('shared/breakfast/' + seed.idea + '.json'))
    assert(repo.files.has('shared/freetime/' + seed.plan + '.json'))
    const bytes = Buffer.from(seed.privatePhoto.split(',')[1], 'base64')
    const privateHash = createHash('sha1')
      .update(
        Buffer.concat([Buffer.from('blob ' + bytes.length + '\0'), bytes]),
      )
      .digest('hex')
    assert(!repo.blobs.has(privateHash), '私密图片曾被发送到仓库')
    for (const encoded of repo.blobs.values()) {
      const content = Buffer.from(encoded, 'base64').toString('utf8')
      assert(
        ![
          seed.privateNote,
          seed.privateIdea,
          '本机的私密文字',
          '本机的私密早餐',
          a.link.token,
          b.link.token,
        ].some((secret) => content.includes(secret)),
        '仓库请求中包含私密记录或令牌',
      )
    }
    const received = await b.page.evaluate(async (id) => {
      const { readRecords, readRecordWithMedia } =
        await import('./src/storage.js')
      const { groupVenues } = await import('./src/journal.js')
      const records = await readRecords(),
        row = await readRecordWithMedia(id)
      const store = groupVenues(records, [], { includePrivate: true }).find(
        (v) => v.name === '验收咖啡',
      )
      return {
        image: row.image.startsWith('data:image/jpeg'),
        privateSeen: records.some((e) => e.id === 'qa-personal'),
        count: store?.entries.length,
        average: store?.rating,
      }
    }, seed.note)
    assert.equal(received.image, true)
    assert.equal(received.privateSeen, false)
    assert.equal(received.count, 1)
    assert.equal(received.average, 5)
    const localView = await a.page.evaluate(async () => {
      const records = await (await import('./src/storage.js')).readRecords()
      const { groupVenues } = await import('./src/journal.js')
      const place = groupVenues(records, [], { includePrivate: true }).find(
        (v) => v.name === '验收咖啡',
      )
      return [place?.entries.length, place?.rating]
    })
    assert.deepEqual(
      localView,
      [2, 3],
      '本机店铺统计应包含这台手机上的私人到店',
    )
    assert(
      [...repo.files.keys()].some((p) => p.startsWith('shared/places/')),
      '遗漏共享店铺基础档案',
    )
    await b.page.locator('.close-sheet').tap()
    const thumb = b.page
      .locator('.entry-card')
      .filter({ has: b.page.getByRole('heading', { name: '双人早餐咖啡' }) })
      .locator('img[data-media-size="thumbnail"]')
    await thumb.scrollIntoViewIfNeeded()
    await b.page.waitForFunction(() =>
      [...document.querySelectorAll('img[data-media-size="thumbnail"]')].some(
        (i) =>
          i.src.startsWith('blob:') &&
          i.naturalWidth > 0 &&
          i.naturalWidth <= 480,
      ),
    )
    await b.page.locator('.mobile-settings').tap()
    // Simultaneous, different users' reactions must survive a competing branch update.
    a.link.connected = false
    b.link.connected = false
    for (const [endpoint, stamp] of [
      [a, 'drink'],
      [b, 'cool'],
    ]) {
      await endpoint.page.evaluate(
        async ({ id, stamp }) => {
          await (await import('./src/storage.js')).toggleStamp(id, stamp)
        },
        { id: seed.note, stamp },
      )
    }
    repo.beforePush = () => repo.replaceFile('README.md', { test: true })
    a.link.connected = true
    await sync(a.page)
    b.link.connected = true
    await sync(b.page)
    await sync(a.page)
    assert(a.link.conflicts + b.link.conflicts > 0)
    assert.deepEqual(
      repo
        .read(path)
        .data.reactions.filter((r) => r.stamp)
        .map((r) => r.stamp)
        .sort(),
      ['cool', 'drink'],
    )
    await b.page.evaluate(async ({ idea, plan }) => {
      const { updateBreakfast } = await import('./src/breakfast-store.js')
      const { toggleStamp } = await import('./src/storage.js')
      await updateBreakfast(idea, '伙伴修改的饭团', 'slow', 'shared')
      await toggleStamp(idea, 'taste', 'breakfast')
      await toggleStamp(plan, 'healed', 'freetime')
    }, seed)
    await sync(b.page)
    assert.equal(
      repo.read('shared/breakfast/' + seed.idea + '.json').data.reactions[0]
        .actor.animal,
      'rabbit',
    )
    assert.equal(
      repo.read('shared/freetime/' + seed.plan + '.json').data.reactions[0]
        .stamp,
      'healed',
    )
    await b.page.evaluate(async (id) => {
      await (await import('./src/breakfast-store.js')).removeBreakfast(id)
    }, seed.idea)
    await sync(b.page)
    await sync(a.page)
    assert(!repo.files.has('shared/breakfast/' + seed.idea + '.json'))
    await a.page.locator('[data-trash]').tap()
    const deleted = a.page
      .locator('.trash-item')
      .filter({ hasText: '伙伴修改的饭团' })
      .filter({ hasText: '已删除' })
    await deleted.getByRole('button', { name: '恢复' }).scrollIntoViewIfNeeded()
    await screenshot(a.page, 'cloud-trash')
    await deleted.getByRole('button', { name: '恢复' }).tap()
    await a.page.waitForFunction(() =>
      document
        .querySelector('[data-cloud-message]')
        .textContent.includes('已恢复'),
    )
    await sync(b.page)
    assert.equal(
      repo.read('shared/breakfast/' + seed.idea + '.json').data.title,
      '伙伴修改的饭团',
    )
    assert.deepEqual(failures, [])
    console.log(
      '✓ 两台独立 WebKit 设备与模拟 GitHub REST · 401 换证补传、409 并发回应、私密隔离、双尺寸图片、店铺统计、早餐/清单回应与回收恢复',
    )
  } finally {
    await Promise.all([a.context.close(), b?.context.close()])
  }
}
