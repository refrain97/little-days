import assert from 'node:assert/strict'
import { createHash, randomBytes } from 'node:crypto'
import test from 'node:test'
import { isDeepStrictEqual } from 'node:util'
import { createGitHubSync } from '../src/github-sync.js'

const entryId = 'entry-1'
const entryKey = 'entries/' + entryId
const entryPath = 'shared/' + entryKey + '.json'
const day = 86_400_000
const sha = (bytes) => createHash('sha1').update(bytes).digest('hex')
const response = (status, body) => ({
  status,
  ok: status >= 200 && status < 300,
  json: async () => structuredClone(body),
})

// Model immutable Git objects and a branch that can only fast-forward. Only the
// injected fetch function is called; no fixture or credential leaves the process.
class Repository {
  profile = {
    owner: 'example',
    repo: 'journal',
    token: randomBytes(24).toString('hex'),
  }
  blobs = new Map()
  trees = new Map()
  commits = new Map()
  head = ''
  private = true
  online = true
  beforePush = null

  get files() {
    return this.head
      ? this.trees.get(this.commits.get(this.head).tree.sha)
      : new Map()
  }

  putBlob(content) {
    const bytes = Buffer.from(content, 'base64')
    const id = sha(
      Buffer.concat([Buffer.from('blob ' + bytes.length + '\0'), bytes]),
    )
    this.blobs.set(id, content)
    return id
  }
  putTree(files) {
    const id = sha(JSON.stringify([...files].sort()))
    this.trees.set(id, files)
    return id
  }
  putCommit(tree, parents) {
    const id = sha(JSON.stringify([tree, parents, this.commits.size]))
    this.commits.set(id, { tree: { sha: tree }, parents })
    return id
  }
  read(path) {
    return JSON.parse(
      Buffer.from(this.blobs.get(this.files.get(path)), 'base64').toString(
        'utf8',
      ),
    )
  }
  replaceFile(path, data) {
    const files = new Map(this.files)
    files.set(
      path,
      this.putBlob(Buffer.from(JSON.stringify(data)).toString('base64')),
    )
    this.head = this.putCommit(
      this.putTree(files),
      this.head ? [this.head] : [],
    )
  }
  fetch = async (url, { method, headers, body, redirect }) => {
    const root = 'https://api.github.com/repos/example/journal'
    assert.ok(url === root || url.startsWith(root + '/'))
    assert.equal(headers.Authorization, 'Bearer ' + this.profile.token)
    assert.equal(redirect, 'error')
    assert.ok(
      !url.includes(this.profile.token) && !body?.includes(this.profile.token),
    )
    if (!this.online) throw new TypeError('simulated offline')
    const route = url.slice(root.length).split('?')[0]
    const data = body && JSON.parse(body)
    if (route === '')
      return response(200, {
        private: this.private,
        default_branch: 'main',
        size: this.head ? 1 : 0,
        permissions: { push: true },
      })
    if (route === '/git/ref/heads/main')
      return this.head
        ? response(200, { object: { sha: this.head } })
        : response(409, { message: 'Git Repository is empty.' })
    if (method === 'PUT' && route.startsWith('/contents/')) {
      this.replaceFile(
        route.slice('/contents/'.length),
        JSON.parse(Buffer.from(data.content, 'base64').toString()),
      )
      return response(201, {})
    }
    const [, , resource, id] = route.split('/')
    if (method === 'GET' && resource === 'commits')
      return response(200, this.commits.get(id))
    if (method === 'GET' && resource === 'trees') {
      const tree = [...this.trees.get(id)].map(([path, sha]) => ({
        path,
        sha,
        mode: '100644',
        type: 'blob',
      }))
      return response(200, { tree, truncated: false })
    }
    if (method === 'GET' && resource === 'blobs') {
      assert.ok(this.blobs.has(id))
      return response(200, {
        encoding: 'base64',
        content: this.blobs.get(id),
        sha: id,
      })
    }
    if (method === 'POST' && resource === 'blobs')
      return response(201, { sha: this.putBlob(data.content) })
    if (method === 'POST' && resource === 'trees') {
      const files = new Map(this.trees.get(data.base_tree))
      for (const update of data.tree) {
        if (update.sha === null) files.delete(update.path)
        else files.set(update.path, update.sha)
      }
      return response(201, { sha: this.putTree(files) })
    }
    if (method === 'POST' && resource === 'commits')
      return response(201, { sha: this.putCommit(data.tree, data.parents) })
    if (method === 'PATCH' && route === '/git/refs/heads/main') {
      assert.equal(data.force, false)
      if (this.beforePush) {
        const change = this.beforePush
        this.beforePush = null
        change()
        return response(409, { message: 'Conflict' })
      }
      if (this.commits.get(data.sha).parents[0] !== this.head)
        return response(422, { message: 'Update is not a fast forward' })
      this.head = data.sha
      return response(200, {})
    }
    throw new Error('Unexpected mock request: ' + method + ' ' + route)
  }
}

class Device {
  entities = new Map()
  privateKeys = []
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
          }),
        readPhoto: async () => this.photo,
        readAudio: async () => this.audio,
        apply: async ({
          kind,
          id,
          data,
          expected,
          photoPath,
          audioPath,
          readPhoto,
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
            return true
          }
          const entity = { kind, id, data }
          if (photoPath) {
            this.photo = await readPhoto()
            entity.photoKey = photoPath
          }
          if (audioPath) {
            this.audio = await readAudio()
            entity.audioKey = audioPath
          }
          this.entities.set(key, entity)
          return true
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
    first.audio =
      'data:audio/mp4;base64,' + Buffer.alloc(1_100_000, 7).toString('base64')
    Object.assign(entity, {
      photoKey: 'device-only-photo',
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
      (p) => p.startsWith('shared/photos/') || p.startsWith('shared/audio/'),
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
