import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import test from 'node:test'
import { isDeepStrictEqual } from 'node:util'
import { Repository, fineToken } from './github-fixture.mjs'
import { createGitHubSync } from '../src/github-sync.js'

const entryId = 'entry-1'
const entryKey = 'entries/' + entryId
const entryPath = 'shared/' + entryKey + '.json'
const day = 86_400_000
class Device {
  entities = new Map()
  privateKeys = []
  outboxRevision = ''
  storage = new Map()
  constructor(repo, clock) {
    this.repo = repo
    this.clock = clock
    this.restart()
  }
  restart() {
    this.sync = createGitHubSync({
      clock: this.clock,
      fetcher: this.repo.fetch,
      storage: {
        get: async (key) => structuredClone(this.storage.get(key)),
        set: async (key, value) =>
          this.storage.set(key, structuredClone(value)),
        remove: async (key) => this.storage.delete(key),
        configure: async (config, binding) => {
          this.storage.set('config', structuredClone(config))
          this.storage.set('bound', binding)
        },
      },
      adapter: {
        snapshot: async () =>
          structuredClone({
            entities: [...this.entities.values()],
            privateKeys: this.privateKeys,
            outboxRevision: this.outboxRevision,
          }),
        ackOutbox: async (revision) => {
          if (this.outboxRevision === revision) this.outboxRevision = ''
        },
        readCachedAttachment: async (path) => {
          for (const item of this.entities.values()) {
            if (item.photoKey === path) return this.photo
            if (item.thumbKey === path) return this.thumb
            if (item.audioKey === path) return this.audio
          }
          return null
        },
        readPhoto: async () => this.photo,
        readThumb: async () => this.thumb,
        readAudio: async () => this.audio,
        apply: async ({
          kind,
          id,
          data,
          expected,
          photoPath,
          thumbPath,
          audioPath,
          keepPhoto,
          keepThumb,
          keepAudio,
          readPhoto,
          readThumb,
          readAudio,
        }) => {
          const key = kind + '/' + id
          if (
            this.privateKeys.some(
              (item) => item.kind === kind && item.id === id,
            ) ||
            !isDeepStrictEqual(this.entities.get(key) || null, expected)
          )
            return false
          if (!data) {
            this.entities.delete(key)
            return { entity: null }
          }
          const entity = { kind, id, data }
          if (photoPath) {
            if (!keepPhoto) this.photo = await readPhoto()
            entity.photoKey = keepPhoto ? expected.photoKey : photoPath
          }
          if (thumbPath) {
            if (!keepThumb) this.thumb = await readThumb()
            entity.thumbKey = keepThumb ? expected.thumbKey : thumbPath
          }
          if (audioPath) {
            if (!keepAudio) this.audio = await readAudio()
            entity.audioKey = keepAudio ? expected.audioKey : audioPath
          }
          this.entities.set(key, entity)
          const acknowledged = structuredClone(entity)
          this.afterApply?.(entity)
          return { entity: acknowledged }
        },
      },
    })
  }
  edit(fields) {
    Object.assign(this.entities.get(entryKey).data, fields)
  }
}

async function pair({ attachments = false } = {}) {
  const repo = new Repository()
  let now = Date.UTC(2030, 0, 1)
  const first = new Device(repo, () => now),
    second = new Device(repo, () => now)
  const entity = {
    kind: 'entries',
    id: entryId,
    data: {
      id: entryId,
      visibility: 'shared',
      title: '散步',
      notes: '河边',
      rating: 4,
    },
  }
  if (attachments) {
    // Only the sync transport consumes these synthetic bytes; no media decoder is involved.
    first.photo =
      'data:image/jpeg;base64,' +
      Buffer.from([255, 216, 255, 217]).toString('base64')
    first.thumb =
      'data:image/jpeg;base64,' +
      Buffer.from([255, 216, 255, 224, 255, 217]).toString('base64')
    first.audio =
      'data:audio/mp4;base64,' + Buffer.alloc(1_100_000, 7).toString('base64')
    Object.assign(entity, {
      photoKey: 'device-only-photo',
      thumbKey: 'device-only-thumb',
      audioKey: 'device-only-audio',
    })
  }
  first.entities.set(entryKey, entity)
  await first.sync.connect(repo.profile)
  await second.sync.connect(repo.profile)
  return {
    repo,
    first,
    second,
    advance: (ms) => {
      now += ms
    },
  }
}

test('devices merge independent edits, including a competing commit that returns 409', async () => {
  const { repo, first, second } = await pair()
  first.edit({ notes: '桥边' })
  second.edit({ rating: 5 })
  await first.sync.sync()
  await second.sync.sync()
  await first.sync.sync()
  assert.equal(first.entities.get(entryKey).data.rating, 5)
  assert.equal(second.entities.get(entryKey).data.notes, '桥边')

  let competingCommits = 0
  repo.beforePush = () => {
    const current = repo.read(entryPath)
    current.data.notes = '另一个设备刚写的备注'
    repo.replaceFile(entryPath, current)
    competingCommits++
  }
  first.edit({ title: '周末散步' })
  await first.sync.sync()
  assert.equal(competingCommits, 1)
  await second.sync.sync()
  assert.equal(second.entities.get(entryKey).data.title, '周末散步')
  assert.equal(second.entities.get(entryKey).data.notes, '另一个设备刚写的备注')
  const head = repo.head
  await second.sync.sync()
  assert.equal(
    repo.head,
    head,
    'an unchanged sync should not create another commit',
  )
})

test('a photo replaced after applying a download remains queued at acknowledgement', async () => {
  const { repo, first, second } = await pair({ attachments: true })
  const initial = repo.read(entryPath)
  first.edit({ notes: '更新说明' })
  await first.sync.sync()
  second.afterApply = (item) => {
    second.afterApply = null
    item.photoKey = 'new-photo-after-local-commit'
    item.thumbKey = 'new-thumbnail-after-local-commit'
    second.photo = 'data:image/jpeg;base64,/9j/8f/Z'
    second.thumb = 'data:image/jpeg;base64,/9j/4f/Z'
  }
  await second.sync.sync()
  assert.equal(second.sync.status().pending, 1)
  await second.sync.sync()
  const changed = repo.read(entryPath)
  assert.notEqual(changed.photoPath, initial.photoPath)
  assert.notEqual(changed.thumbPath, initial.thumbPath)
  await first.sync.sync()
  assert.equal(first.photo, second.photo)
  assert.equal(first.thumb, second.thumb)
})

test('same-field edits keep the previous version; deleted entries can be restored until expiry', async () => {
  const { repo, first, second, advance } = await pair()
  first.edit({ notes: '第一份' })
  second.edit({ notes: '第二份' })
  await first.sync.sync()
  await second.sync.sync()
  assert.equal(repo.read(entryPath).data.notes, '第二份')
  const history = [...repo.files.keys()]
    .filter((p) => p.startsWith('shared/trash/'))
    .map((p) => repo.read(p))
  assert.ok(history.some((item) => item.record.data.notes === '第一份'))

  second.entities.delete(entryKey)
  await second.sync.sync()
  await first.sync.sync()
  assert.ok(!first.entities.has(entryKey))
  const deletion = (await first.sync.listTrash()).find(
    (item) => item.reason === 'deleted',
  )
  assert.ok(deletion)
  await first.sync.restoreTrash(deletion.id)
  assert.equal(first.entities.get(entryKey).data.notes, '第二份')
  first.entities.delete(entryKey)
  await first.sync.sync()
  advance(30 * day - 1)
  await first.sync.cleanTrash()
  assert.ok(
    (await first.sync.listTrash()).some((item) => item.reason === 'deleted'),
  )
  advance(1)
  await first.sync.cleanTrash()
  assert.deepEqual(await first.sync.listTrash(), [])
  assert.ok(![...repo.files.keys()].some((p) => p.startsWith('shared/trash/')))
})

test('withdrawing a shared entry removes its history and media; stale edits and credentials never enter Git objects', async () => {
  const { repo, first, second } = await pair({ attachments: true })
  assert.equal(first.audio, second.audio)
  assert.equal(first.photo, second.photo)
  assert.equal(first.thumb, second.thumb)
  first.edit({ title: '另一版' })
  await first.sync.sync()
  assert.ok((await first.sync.listTrash()).length > 0)
  first.privateKeys.push({ kind: 'entries', id: entryId })
  first.entities.delete(entryKey)
  await first.sync.sync()
  assert.ok(!repo.files.has(entryPath))
  assert.deepEqual(await first.sync.listTrash(), [])
  assert.ok(
    ![...repo.files.keys()].some(
      (p) =>
        p.startsWith('shared/photos/') ||
        p.startsWith('shared/thumbs/') ||
        p.startsWith('shared/audio/'),
    ),
  )

  const stale = 'stale-' + randomBytes(12).toString('hex')
  second.edit({ notes: stale })
  await second.sync.sync()
  assert.ok(!second.entities.has(entryKey) && !repo.files.has(entryPath))
  for (const content of repo.blobs.values()) {
    const bytes = Buffer.from(content, 'base64')
    for (const forbidden of [
      repo.profile.token,
      stale,
      'device-only-photo',
      'device-only-thumb',
      'device-only-audio',
    ])
      assert.ok(!bytes.includes(forbidden))
  }
})

test('offline edits survive restart and wait while the repository is public', async () => {
  const { repo, first } = await pair()
  repo.online = false
  first.edit({ notes: '离线记录' })
  await assert.rejects(first.sync.sync())
  assert.equal(first.sync.status().pending, 1)
  first.restart()
  await first.sync.start()
  assert.equal(first.sync.status().pending, 1)
  repo.online = true
  repo.private = false
  const previousHead = repo.head
  await assert.rejects(first.sync.sync(), /私有/)
  assert.equal(repo.head, previousHead)
  repo.private = true
  await first.sync.sync()
  assert.equal(repo.read(entryPath).data.notes, '离线记录')
  assert.equal(first.sync.status().pending, 0)
})

test('unchanged private HEAD reuses its verified tree across restart; a text edit fetches only its JSON blob', async () => {
  const { repo, first, second } = await pair({ attachments: true })
  repo.requests.length = 0
  second.restart()
  await second.sync.start()
  assert.deepEqual(repo.requests, [
    ['GET', ''],
    ['GET', '/git/ref/heads/main'],
  ])

  first.edit({ notes: '新写的一句' })
  await first.sync.sync()
  repo.requests.length = 0
  await second.sync.sync()
  assert.equal(
    repo.requests.filter(
      ([method, route]) => method === 'GET' && route.startsWith('/git/trees/'),
    ).length,
    1,
  )
  assert.deepEqual(
    repo.requests.filter(([, route]) => route.startsWith('/git/blobs/')),
    [['GET', '/git/blobs/' + repo.files.get(entryPath)]],
  )
  assert.equal(second.photo, first.photo)
  assert.equal(second.audio, first.audio)

  const marker = 'shared/.little-days.json'
  repo.replaceFile(marker, { format: 'foreign', version: 1 })
  await assert.rejects(second.sync.sync(), /标记无效/)
})

test('a new shared entry can use an already cached attachment SHA without a second download', async () => {
  const { repo, first, second } = await pair({ attachments: true })
  const later = structuredClone(first.entities.get(entryKey))
  later.id = later.data.id = 'new-visit'
  const key = 'entries/' + later.id
  first.entities.set(key, later)
  await first.sync.sync()
  const path = 'shared/' + key + '.json'
  repo.requests.length = 0
  await second.sync.sync()
  assert.deepEqual(
    repo.requests.filter(([, route]) => route.startsWith('/git/blobs/')),
    [['GET', '/git/blobs/' + repo.files.get(path)]],
  )
  assert.equal(second.entities.get(key).photoKey, repo.read(path).photoPath)
})

test('401 during publication keeps new entries and dirty revision across restart and replays after explicit renewal', async () => {
  const { repo, first, second } = await pair()
  const key = 'entries/offline-wish',
    path = 'shared/' + key + '.json'
  const entry = structuredClone(first.entities.get(entryKey))
  entry.id = entry.data.id = 'offline-wish'
  entry.data.title = '留给下周的主意'
  first.entities.set(key, entry)
  first.outboxRevision = 'pending-save'
  repo.beforeRequest = (method) => {
    if (method === 'PATCH') {
      repo.beforeRequest = null
      repo.profile.token = fineToken()
    }
  }
  await assert.rejects(first.sync.sync(), /更新 Token/)
  assert.equal(first.sync.status().needsToken, true)
  assert.equal(first.sync.status().pending, 1)
  assert.equal(first.outboxRevision, 'pending-save')
  assert(!repo.files.has(path))
  first.restart()
  repo.requests.length = 0
  await first.sync.start()
  assert.equal(first.sync.status().needsToken, true)
  assert.equal(first.sync.status().pending, 1)
  assert.deepEqual(repo.requests, [])
  await first.sync.connect(repo.profile)
  assert.equal(first.sync.status().needsToken, false)
  assert.equal(first.sync.status().pending, 0)
  assert.equal(first.outboxRevision, '')
  assert.equal(repo.read(path).data.title, '留给下周的主意')
  await second.sync.connect(repo.profile)
  assert.equal(second.entities.get(key).data.title, '留给下周的主意')
})

test('unchanged trash metadata stays cached and is revalidated if its blob changes', async () => {
  const { repo, first, second } = await pair()
  first.edit({ notes: '我的新备注' })
  await first.sync.sync()
  const [previous] = await second.sync.listTrash()
  repo.requests.length = 0
  await second.sync.listTrash()
  assert.ok(!repo.requests.some(([, route]) => route.startsWith('/git/blobs/')))
  const path = 'shared/trash/' + previous.id + '.json'
  repo.replaceFile(path, { ...repo.read(path), title: '修订后的旧标题' })
  const [fresh] = await second.sync.listTrash()
  assert.equal(fresh.title, '修订后的旧标题')
})

test('unsupported or legacy credentials never reach GitHub and a bound notebook can renew them', async () => {
  const repo = new Repository(),
    device = new Device(repo, Date.now)
  const old = {
    ...repo.profile,
    branch: 'main',
    token: 'ghp_' + randomBytes(24).toString('hex'),
  }
  await assert.rejects(device.sync.connect(old), /Fine-grained PAT/)
  assert.deepEqual(repo.requests, [])
  device.storage.set('config', old)
  device.storage.set('bound', 'example/journal@main')
  await device.sync.start()
  assert.equal(device.sync.status().connected, true)
  assert.equal(device.sync.status().needsToken, true)
  assert.deepEqual(repo.requests, [])
  await device.sync.connect(repo.profile)
  assert.equal(device.sync.status().needsToken, false)
  assert.ok(repo.requests.length)
})

const sticker = (id, stamp, minute) => ({
  actor: { id, animal: id === 'a' ? 'cat' : 'fox', name: id },
  stamp,
  at: new Date(Date.UTC(2030, 0, 1, 0, minute)).toISOString(),
})

test('two devices merge their own stamps independently across a 409 and preserve a later withdrawal', async () => {
  const { repo, first, second } = await pair()
  first.edit({
    isBreakfast: true,
    breakfastKind: 'slow',
    stickerAuthor: sticker('a', 'chef', 0).actor,
    reactions: [sticker('a', 'chef', 2)],
  })
  repo.beforePush = () => {
    const doc = repo.read(entryPath)
    doc.data.reactions = [sticker('b', 'taste', 3)]
    repo.replaceFile(entryPath, doc)
  }
  await first.sync.sync()
  await second.sync.sync()
  const current = second.entities.get(entryKey).data
  assert.equal(current.isBreakfast, true)
  assert.equal(current.stickerAuthor.animal, 'cat')
  assert.deepEqual(current.reactions, [
    sticker('a', 'chef', 2),
    sticker('b', 'taste', 3),
  ])
  first.edit({ reactions: [sticker('a', null, 8), sticker('b', 'taste', 3)] })
  second.edit({
    reactions: [sticker('a', 'aroma', 4), sticker('b', 'chef', 7)],
  })
  await first.sync.sync()
  await second.sync.sync()
  assert.deepEqual(repo.read(entryPath).data.reactions, [
    sticker('a', null, 8),
    sticker('b', 'chef', 7),
  ])
})

test('shared breakfast changes and restores cross devices; private withdrawal removes current and trash copies', async () => {
  const { repo, first, second } = await pair()
  const id = 'idea-custom',
    key = 'breakfast/' + id,
    path = 'shared/' + key + '.json'
  first.entities.set(key, {
    kind: 'breakfast',
    id,
    data: {
      id,
      visibility: 'shared',
      title: '测试早餐',
      kind: 'quick',
      stickerAuthor: sticker('a', 'chef', 1).actor,
    },
  })
  await first.sync.sync()
  await second.sync.sync()
  assert.equal(second.entities.get(key).data.title, '测试早餐')
  second.entities.get(key).data.title = '周末早餐'
  first.entities.get(key).data.reactions = [sticker('a', 'taste', 1)]
  await second.sync.sync()
  await first.sync.sync()
  assert.equal(repo.read(path).data.reactions[0].stamp, 'taste')
  first.entities.delete(key)
  await first.sync.sync()
  const deleted = (await second.sync.listTrash()).find(
    (row) => row.reason === 'deleted' && row.kind === 'breakfast',
  )
  await second.sync.restoreTrash(deleted.id)
  assert.equal(second.entities.get(key).data.title, '周末早餐')
  await first.sync.sync()
  first.privateKeys.push({ kind: 'breakfast', id })
  first.entities.delete(key)
  await first.sync.sync()
  assert.ok(!repo.files.has(path))
  assert.ok(!(await first.sync.listTrash()).some((row) => row.entityId === id))
  second.entities.get(key).data.title = '过期早餐'
  await second.sync.sync()
  assert.ok(!second.entities.has(key))
  assert.ok(!repo.files.has(path))
})

test('an existing shared photo gains an authenticated thumbnail, retained and restored with its detail', async () => {
  const { repo, first, second } = await pair({ attachments: true })
  const initial = repo.read(entryPath)
  assert.match(initial.thumbPath, /^shared\/thumbs\/[0-9a-f]{40}\.jpg$/)
  assert.notEqual(initial.photoPath, initial.thumbPath)
  const old = { ...initial }
  delete old.thumbPath
  repo.replaceFile(entryPath, old)
  await second.sync.sync()
  // Older data without a stored thumbnail is still readable. It is backfilled when a device can provide one.
  const entry = second.entities.get(entryKey)
  assert.ok(entry.photoKey)
  entry.thumbKey = 'rebuilt-thumb'
  await second.sync.sync()
  assert.equal(repo.read(entryPath).thumbPath, initial.thumbPath)
  second.entities.delete(entryKey)
  await second.sync.sync()
  const trash = (await second.sync.listTrash()).find(
    (row) => row.reason === 'deleted',
  )
  assert.ok(repo.files.has(initial.thumbPath))
  await second.sync.restoreTrash(trash.id)
  assert.equal(second.thumb, first.thumb)
})
