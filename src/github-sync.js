import {
  legacyRecordingFile,
  migrateSharedDocument,
  migrateSyncState,
} from './legacy-sync.js'
import { createSyncState, isFineGrainedToken } from './sync-state.js'

const DAY = 86400000
const retain = 30 * DAY
const marker = 'shared/.little-days.json'
const renewTokenText =
  'GitHub Token 已过期或失效。本机记录已保留，更新 Token 并验证后会自动补传。'
const fineTokenText =
  '请使用以 github_pat_ 开头、仅授权该私库的 Fine-grained PAT。更新后会自动同步本机更改。'
const signature = { format: 'little-days-shared', version: 2 }
const previousSignature = { ...signature, version: 1 }
const groups = ['entries', 'places', 'freetime', 'breakfast']
const groupSet = new Set(groups)
const windows = {
  thumb: /^shared\/thumbs\/[0-9a-f]{40}\.jpg$/,
  photo: /^shared\/photos\/[0-9a-f]{40}\.jpg$/,
}
const uid = () =>
  globalThis.crypto?.randomUUID?.() ||
  Math.random().toString(36).slice(2) + Date.now().toString(36)
const object = (value) =>
  !!value && typeof value === 'object' && !Array.isArray(value)
const keyFor = (kind, id) => kind + '/' + encodeURIComponent(id)
const keyOf = (item) => keyFor(item.kind, item.id)
const jsonPath = (key) => 'shared/' + key + '.json'
const forbidden =
  /^(?:__proto__|constructor|prototype|image|audio(?:Key|Path|Type|Blob|Data|Base64|MimeType)?|photoKey|thumbKey|cloudPhotoPath|cloudThumbPath|cloudAudioPath|githubToken|accessToken|token|apiKey|secret|password|credential|authorization|aiConfig|localAiConfig)$/i
const bucketKey = (c) => (c.owner + '/' + c.repo).toLowerCase() + '@' + c.branch
const safely = (s) => String(s ?? '').trim()
function cleanTree(value) {
  if (Array.isArray(value)) return value.map(cleanTree)
  if (!object(value)) return value
  const result = {}
  for (const key of Object.keys(value).sort()) {
    if (
      forbidden.test(key) ||
      (key === 'visibility' && value[key] !== 'shared')
    )
      throw new Error('共享数据含有仅限本机的字段，已停止同步。')
    result[key] = cleanTree(value[key])
  }
  return result
}
function canonical(v) {
  if (v === undefined) return 'undefined'
  if (Array.isArray(v)) return '[' + v.map(canonical).join(',') + ']'
  if (object(v))
    return (
      '{' +
      Object.keys(v)
        .sort()
        .map((k) => JSON.stringify(k) + ':' + canonical(v[k]))
        .join(',') +
      '}'
    )
  return JSON.stringify(v)
}
const equal = (a, b) => canonical(a) === canonical(b)
function validateEntity(kind, id, data) {
  if (
    !groupSet.has(kind) ||
    typeof id !== 'string' ||
    !id ||
    data?.visibility !== 'shared' ||
    data.isSample === true ||
    (data.id !== undefined && data.id !== id)
  )
    throw new Error('共享记录格式无效，已停止同步。')
  if (
    data.reactions !== undefined &&
    (!Array.isArray(data.reactions) ||
      !data.reactions.every(
        (row) =>
          object(row) &&
          object(row.actor) &&
          typeof row.actor.id === 'string' &&
          (row.stamp === null || typeof row.stamp === 'string') &&
          typeof row.at === 'string' &&
          Number.isFinite(Date.parse(row.at)),
      ))
  )
    throw new Error('共享盖章回应格式无效。')
  return cleanTree(data)
}
function localDigest(e) {
  return e ? canonical([e.data, e.photoKey || '', e.thumbKey || '']) : ''
}
function emptyWire(data) {
  return { data, photoPath: '' }
}
// A stamp is a single per-actor choice, including a null stamp that records removal.
// Independent actors commute. Concurrent writes for the same actor choose one whole stamp.
function mergeReactions(base, local, remote) {
  const indexed = (rows) =>
    new Map((rows || []).map((row) => [row.actor.id, row]))
  const b = indexed(base),
    l = indexed(local),
    r = indexed(remote)
  const result = []
  for (const id of [...new Set([...l.keys(), ...r.keys()])].sort()) {
    const left = l.get(id),
      right = r.get(id),
      previous = b.get(id)
    let row
    if (equal(left, previous)) row = right
    else if (equal(right, previous)) row = left
    else if (!left || !right) row = left || right
    else
      row =
        Date.parse(left.at) === Date.parse(right.at)
          ? canonical(left) >= canonical(right)
            ? left
            : right
          : Date.parse(left.at) > Date.parse(right.at)
            ? left
            : right
    if (row) result.push(row)
  }
  return result
}
function mergeFields(base, local, remote, conflict, field) {
  if (
    field === 'reactions' &&
    [base, local, remote].every((v) => v === undefined || Array.isArray(v))
  ) {
    return mergeReactions(base, local, remote)
  }
  if (equal(local, remote) || equal(remote, base)) return local
  if (equal(local, base)) return remote
  if (object(local) && object(remote) && (base === undefined || object(base))) {
    const result = {}
    for (const k of new Set([
      ...Object.keys(local),
      ...Object.keys(remote),
      ...Object.keys(base || {}),
    ])) {
      const value = mergeFields(base?.[k], local[k], remote[k], conflict, k)
      if (value !== undefined) result[k] = value
    }
    return result
  }
  // Each birthday stage/annual occurrence has its own key; co-edited lists retain independent changes.
  const rows = [
    ...(Array.isArray(base) ? base : []),
    ...(Array.isArray(local) ? local : []),
    ...(Array.isArray(remote) ? remote : []),
  ]
  if (
    Array.isArray(local) &&
    Array.isArray(remote) &&
    (base === undefined || Array.isArray(base)) &&
    rows.length &&
    rows.every((row) => object(row) && typeof (row.key || row.id) === 'string')
  ) {
    const asMap = (arr) =>
      new Map((arr || []).map((row) => [row.key || row.id, row]))
    const b = asMap(base),
      l = asMap(local),
      r = asMap(remote)
    return [...new Set([...l.keys(), ...r.keys(), ...b.keys()])].flatMap(
      (id) => {
        const value = mergeFields(b.get(id), l.get(id), r.get(id), conflict)
        return value === undefined ? [] : [value]
      },
    )
  }
  conflict.value = true
  return local
}
function encodeJSON(data) {
  const bytes = new TextEncoder().encode(JSON.stringify(data))
  const parts = []
  for (let i = 0; i < bytes.length; i += 12288)
    parts.push(btoa(String.fromCharCode(...bytes.subarray(i, i + 12288))))
  return parts.join('')
}
function decodeJSON(base64) {
  const str = atob(base64),
    bytes = new Uint8Array(str.length)
  for (let i = 0; i < str.length; i++) bytes[i] = str.charCodeAt(i)
  return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes))
}
function configOf(value, { saved = false } = {}) {
  const owner = safely(value?.owner),
    repo = safely(value?.repo),
    token = safely(value?.token),
    branch = safely(value?.branch)
  if (
    !/^[A-Za-z0-9][A-Za-z0-9-]*$/.test(owner) ||
    !/^[A-Za-z0-9_.-]+$/.test(repo) ||
    /^\.+$/.test(repo)
  )
    throw new Error('请填写正确的 GitHub 数据仓库名称。')
  if (!saved && !isFineGrainedToken(token)) throw new Error(fineTokenText)
  if (
    branch &&
    (branch.includes('..') ||
      branch.includes('@{') ||
      branch.startsWith('/') ||
      branch.endsWith('/') ||
      /[\s\\~^:?*\[\x00-\x1f]/.test(branch))
  )
    throw new Error('GitHub 分支名称无效。')
  const page = globalThis.location
  const pagesRepo = page?.hostname?.endsWith('.github.io')
    ? page.hostname.split('.')[0] +
      '/' +
      (page.pathname.split('/')[1] || page.hostname)
    : ''
  const codeRepo =
    globalThis.document?.querySelector('meta[name="little-days-code-repo"]')
      ?.content || pagesRepo
  if (codeRepo && codeRepo.toLowerCase() === (owner + '/' + repo).toLowerCase())
    throw new Error('请选择专门存放手记的私有仓库，代码仓库无法用来同步。')
  return { owner, repo, token, branch }
}
class GitError extends Error {
  constructor(status, response) {
    super(
      status === 401
        ? renewTokenText
        : status === 403 || status === 429
          ? 'GitHub 拒绝了请求，请检查仓库授权或稍后重试。'
          : status === 404
            ? '找不到仓库或分支，请检查名称和令牌授权。'
            : status === 409 || status === 422
              ? '共享仓库已发生变化，正在重新合并。'
              : '暂时无法访问 GitHub，请稍后重试。',
    )
    this.status = status
    this.detail = [
      response?.message,
      ...(Array.isArray(response?.errors)
        ? response.errors.map((item) => item?.message || item?.code || '')
        : []),
    ].join(' ')
  }
}
function client(config, fetcher) {
  const base =
    'https://api.github.com/repos/' +
    encodeURIComponent(config.owner) +
    '/' +
    encodeURIComponent(config.repo)
  return async (path = '', method = 'GET', body) => {
    if (!isFineGrainedToken(config.token)) throw new Error(fineTokenText)
    const res = await fetcher(base + path, {
      method,
      redirect: 'error',
      credentials: 'omit',
      cache: 'no-store',
      ...(globalThis.AbortSignal?.timeout
        ? { signal: AbortSignal.timeout(60000) }
        : {}),
      headers: {
        Authorization: 'Bearer ' + config.token,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    })
    if (!res.ok) {
      let info
      try {
        info = await res.json()
      } catch {}
      throw new GitError(res.status, info)
    }
    return res.status === 204 ? null : res.json()
  }
}
const fileOK = /^(?:README(?:\.md|\.txt)?|LICENSE(?:\.md|\.txt)?|\.gitignore)$/i
const trashPath = /^shared\/trash\/(\d{13})-([\w-]+)\.json$/
const fileKey = /^shared\/(entries|places|freetime|breakfast)\/([^/]+)\.json$/
function keyFromPath(path) {
  const m = path.match(fileKey)
  if (!m) return ''
  const id = decodeURIComponent(m[2])
  if (!id || encodeURIComponent(id) !== m[2])
    throw new Error('共享文件名格式无效。')
  return keyFor(m[1], id)
}
function validLayout(items) {
  for (const item of items) {
    if (item.type === 'tree') {
      if (
        !/^shared(?:\/(?:entries|places|freetime|breakfast|photos|thumbs|audio|trash))?$/.test(
          item.path,
        )
      )
        return false
      continue
    }
    if (item.type !== 'blob' || item.mode !== '100644') return false
    if (
      item.path !== marker &&
      !fileOK.test(item.path) &&
      !fileKey.test(item.path) &&
      !windows.photo.test(item.path) &&
      !windows.thumb.test(item.path) &&
      !legacyRecordingFile.test(item.path) &&
      !trashPath.test(item.path)
    )
      return false
  }
  return true
}
async function jsonBlob(api, sha) {
  const v = await api('/git/blobs/' + sha)
  if (v.encoding !== 'base64' || typeof v.content !== 'string')
    throw new Error('共享文件无法读取。')
  return decodeJSON(v.content)
}
async function verify(api, config) {
  const repo = await api()
  if (
    repo.private !== true ||
    (repo.visibility && repo.visibility !== 'private')
  )
    throw new Error('只能连接私有仓库，请检查仓库的可见范围。')
  if (repo.archived || repo.disabled || repo.permissions?.push === false)
    throw new Error('此令牌没有数据仓库的写入权限。')
  if (!config.branch) config.branch = repo.default_branch || 'main'
}
const refPath = (branch) =>
  '/git/ref/heads/' + branch.split('/').map(encodeURIComponent).join('/')
async function inspect(
  api,
  config,
  { init = false, inventory, verified = false } = {},
) {
  if (!verified) await verify(api, config)
  let ref
  try {
    ref = await api(refPath(config.branch))
  } catch (e) {
    if (!init || (e.status !== 409 && e.status !== 404)) throw e
    // Contents API can bootstrap an empty repository. Missing non-default branches remain untouched.
    const info = await api()
    if (info.size !== 0 || config.branch !== info.default_branch) throw e
    try {
      await api('/contents/' + marker, 'PUT', {
        message: '初始化小日子共享空间',
        content: encodeJSON(signature),
      })
    } catch (err) {
      if (err.status !== 409 && err.status !== 422) throw err
    }
    ref = await api(refPath(config.branch))
  }
  const head = ref.object.sha
  // A commit and all of its Git objects are immutable. Always recheck repository
  // privacy and branch HEAD, but reuse a previously validated tree when it matches.
  if (inventory?.head === head)
    return { head, tree: inventory.tree, files: new Map(inventory.files) }
  const commit = await api('/git/commits/' + head)
  const tree = await api('/git/trees/' + commit.tree.sha + '?recursive=1')
  if (tree.truncated || !Array.isArray(tree.tree) || !validLayout(tree.tree))
    throw new Error('仓库里有应用代码或其他文件，请选择单独的私有数据仓库。')
  const files = new Map(
    tree.tree.filter((x) => x.type === 'blob').map((x) => [x.path, x.sha]),
  )
  if (!files.has(marker)) {
    if (!init || [...files.keys()].some((p) => !fileOK.test(p)))
      throw new Error('此仓库缺少小日子数据标记，请使用空的私有数据仓库。')
    try {
      await api('/contents/' + marker, 'PUT', {
        message: '初始化小日子共享空间',
        content: encodeJSON(signature),
        branch: config.branch,
      })
    } catch (e) {
      if (e.status !== 409 && e.status !== 422) throw e
    }
    return inspect(api, config, { inventory })
  }
  if (inventory?.markerSha !== files.get(marker)) {
    const sig = await jsonBlob(api, files.get(marker))
    if (equal(sig, previousSignature))
      return { head, tree: commit.tree.sha, files, legacy: true }
    if (!equal(sig, signature))
      throw new Error('共享仓库标记无效，请检查连接的仓库。')
  }
  return { head, tree: commit.tree.sha, files }
}
function inventoryOf({ head, tree, files, legacy }) {
  if (legacy) return null
  return { head, tree, files: [...files], markerSha: files.get(marker) }
}
async function putBlob(api, base64) {
  const response = await api('/git/blobs', 'POST', {
    encoding: 'base64',
    content: base64,
  })
  if (!/^[a-f0-9]{40}$/.test(response.sha))
    throw new Error('GitHub 没有返回有效的文件版本。')
  return response.sha
}
async function atomicWrite(
  api,
  config,
  remote,
  changes,
  message,
  beforePublish,
) {
  const items = [...changes].filter(
    ([path, sha]) => (remote.files.get(path) || null) !== sha,
  )
  if (!items.length) return remote
  const tree = await api('/git/trees', 'POST', {
    base_tree: remote.tree,
    tree: items.map(([path, sha]) => ({
      path,
      mode: '100644',
      type: 'blob',
      sha,
    })),
  })
  const commit = await api('/git/commits', 'POST', {
    message,
    tree: tree.sha,
    parents: [remote.head],
  })
  await beforePublish()
  await api(
    refPath(config.branch).replace('/git/ref/', '/git/refs/'),
    'PATCH',
    { sha: commit.sha, force: false },
  )
  const files = new Map(remote.files)
  for (const [path, sha] of items) {
    if (sha) files.set(path, sha)
    else files.delete(path)
  }
  return { head: commit.sha, tree: tree.sha, files }
}
function trashSummary(path, sha, doc) {
  const id = path.slice('shared/trash/'.length, -5)
  const date = Number(path.match(trashPath)?.[1])
  if (
    doc.id !== id ||
    !groupSet.has(doc.kind) ||
    typeof doc.entityId !== 'string'
  )
    throw new Error('回收站记录无效。')
  return {
    id,
    sha,
    kind: doc.kind,
    entityId: doc.entityId,
    title: String(doc.title || '未命名'),
    reason: doc.reason,
    archivedAt: new Date(date).toISOString(),
    expiresAt: new Date(date + retain).toISOString(),
    photoPath: doc.record?.photoPath || '',
    thumbPath: doc.record?.thumbPath || '',
  }
}
function fileDocument(kind, id, wire) {
  return { version: 1, kind, id, ...wire }
}
function wireFrom(doc, kind, id) {
  if (!doc || doc.version !== 1 || doc.kind !== kind || doc.id !== id)
    throw new Error('共享文件的编号或版本无效。')
  const data = validateEntity(kind, id, doc.data)
  if (
    (kind !== 'entries' && (doc.photoPath || doc.thumbPath)) ||
    (doc.photoPath && !windows.photo.test(doc.photoPath)) ||
    (doc.thumbPath && (!doc.photoPath || !windows.thumb.test(doc.thumbPath)))
  )
    throw new Error('共享附件的路径或格式无效。')
  return {
    data,
    ...(doc.thumbPath ? { thumbPath: doc.thumbPath } : {}),
    photoPath: doc.photoPath || '',
  }
}
function mediaBytes(uri, kind) {
  if (typeof uri !== 'string') throw new Error('共享附件暂时无法读取。')
  const header = uri.slice(0, uri.indexOf(','))
  const match = /^data:(.+);base64$/i.exec(header)
  if (!match || !/^image\/jpeg$/i.test(match[1]))
    throw new Error('共享附件格式未受支持。')
  const bytes = uri.slice(header.length + 1)
  const max = (kind === 'thumb' ? 40 : 256) * 1024
  if (
    !bytes ||
    bytes.length > Math.ceil(max / 3) * 4 ||
    bytes.length % 4 ||
    !/^[A-Za-z0-9+/]+={0,2}$/.test(bytes)
  )
    throw new Error('共享附件超出大小限制或内容无效。')
  return bytes
}
// Move v1's current branch and its restorable history to the photo-only format in
// one fast-forward. Older clients reject the new marker; a concurrent writer makes
// the entire migration retry from the new head. Recording blobs are never fetched.
async function upgradeSharedSpace(api, config, remote, now) {
  const changes = new Map()
  for (const [path, sha] of remote.files) {
    if (
      legacyRecordingFile.test(path) ||
      (trashPath.test(path) && !withinRetention(path, now))
    ) {
      changes.set(path, null)
      continue
    }
    if (!fileKey.test(path) && !trashPath.test(path)) continue
    const doc = await jsonBlob(api, sha)
    const clean = migrateSharedDocument(doc)
    if (trashPath.test(path)) {
      const meta = trashSummary(path, sha, clean)
      wireFrom(clean.record, meta.kind, meta.entityId)
    } else {
      const key = keyFromPath(path)
      wireFrom(clean, kindForKey(key), idForKey(key))
    }
    if (!equal(doc, clean))
      changes.set(path, await putBlob(api, encodeJSON(clean)))
  }
  changes.set(marker, await putBlob(api, encodeJSON(signature)))
  return atomicWrite(api, config, remote, changes, '更新小日子手账格式', () =>
    verify(api, config),
  )
}
function parseSnapshot(snap) {
  const entities = new Map(),
    privates = new Set()
  for (const item of snap.privateKeys || []) privates.add(keyOf(item))
  for (const entity of snap.entities || []) {
    if (entity.data?.visibility !== 'shared' || entity.data.isSample) continue
    const key = keyOf(entity)
    if (!privates.has(key))
      entities.set(key, {
        ...entity,
        data: validateEntity(entity.kind, entity.id, entity.data),
      })
  }
  return { entities, privates }
}

function freshState() {
  return {
    version: 2,
    base: {},
    published: [],
    pending: [],
    trash: [],
    lastSync: '',
    restores: [],
  }
}
function needsPreview(entity, base) {
  return Boolean(
    entity?.thumbKey && base?.wire.photoPath && !base.wire.thumbPath,
  )
}
function calculatePending(snap, base, publishedKeys = []) {
  const pending = []
  // A previously deleted shared item can still have versions in the 30-day trash.
  // A privacy withdrawal for it remains work even when there is no live base file.
  const withdrawn = new Set(
    [...publishedKeys].filter((key) => snap.privates.has(key)),
  )
  for (const key of new Set([
    ...snap.entities.keys(),
    ...Object.keys(base),
    ...withdrawn,
  ])) {
    const local = snap.entities.get(key),
      previous = base[key]
    if (
      !withdrawn.has(key) &&
      !needsPreview(local, previous) &&
      localDigest(local) === (previous?.localDigest || '')
    )
      continue
    pending.push({
      key,
      operation: local
        ? 'upsert'
        : snap.privates.has(key)
          ? 'withdraw'
          : 'delete',
    })
  }
  return pending
}
const idForKey = (key) => decodeURIComponent(key.slice(key.indexOf('/') + 1))
const kindForKey = (key) => key.slice(0, key.indexOf('/'))
const withinRetention = (path, now) =>
  now - Number(path.match(trashPath)?.[1]) < retain
const race = (e) =>
  e.status === 409 ||
  (e.status === 422 &&
    /fast.forward|reference|already exists|not a fast forward/i.test(
      e.detail || '',
    ))
class LocalRace extends Error {}
async function processCommit({
  api,
  config,
  adapter,
  state,
  now,
  prune,
  restoring,
}) {
  let remote = await inspect(api, config, { inventory: state.inventory })
  if (remote.legacy) {
    remote = await upgradeSharedSpace(api, config, remote, now)
    // An expired v1 archive can have been the last reference to a photograph.
    prune = true
  }
  const { files } = remote
  const changes = new Map(),
    documents = new Map(),
    known = new Map(),
    next = new Map(),
    archives = []
  const trashFiles = [...files.keys()].filter((p) => trashPath.test(p))
  const withdrawn = new Set()
  const snap = parseSnapshot(await adapter.snapshot())
  const published = new Set([
    ...(state.published || []),
    ...Object.keys(state.base),
  ])
  const initialLocal = new Map(
    [...snap.entities].map(([k, l]) => [k, localDigest(l)]),
  )
  async function readJSON(path) {
    if (!documents.has(path))
      documents.set(path, await jsonBlob(api, files.get(path)))
    return documents.get(path)
  }
  const trashCache = new Map(
    (state.trash || []).map((meta) => [
      'shared/trash/' + meta.id + '.json',
      meta,
    ]),
  )
  async function trashInfo(path) {
    const sha = files.get(path)
    if (trashCache.get(path)?.sha !== sha)
      trashCache.set(path, trashSummary(path, sha, await readJSON(path)))
    return trashCache.get(path)
  }
  let historyKeys
  async function historyIndex() {
    if (historyKeys) return historyKeys
    historyKeys = new Map()
    for (const path of trashFiles) {
      const d = await trashInfo(path)
      historyKeys.set(path, {
        key: keyFor(d.kind, d.entityId),
        reason: d.reason,
      })
    }
    return historyKeys
  }
  async function getWire(key) {
    if (known.has(key)) return known.get(key)
    const sha = files.get(jsonPath(key)),
      base = state.base[key]
    const wire = sha
      ? base?.sha === sha
        ? base.wire
        : wireFrom(
            await readJSON(jsonPath(key)),
            kindForKey(key),
            idForKey(key),
          )
      : null
    if (wire)
      for (const path of [wire.photoPath, wire.thumbPath])
        if (
          path &&
          (!files.has(path) ||
            files.get(path) !== path.match(/[a-f0-9]{40}/)[0])
        )
          throw new Error('共享照片文件缺失或版本不符。')
    known.set(key, wire)
    return wire
  }
  const attachCache = new Map()
  async function materialize(entity, base) {
    if (!entity) return null
    const wire = emptyWire(entity.data)
    for (const kind of ['photo', 'thumb']) {
      const localKey = entity[kind + 'Key']
      if (!localKey) continue
      const ref =
        base?.[kind + 'Key'] === localKey ? base.wire[kind + 'Path'] : localKey
      if (windows[kind].test(ref || '') && files.has(ref)) {
        wire[kind + 'Path'] = ref
        continue
      }
      const cacheKey = keyOf(entity) + '/' + kind + '/' + localKey
      let attachment = attachCache.get(cacheKey)
      if (!attachment) {
        const method = kind === 'photo' ? adapter.readPhoto : adapter.readThumb
        if (!method) throw new Error('设备暂时无法提供共享附件。')
        const bytes = mediaBytes(await method.call(adapter, entity), kind)
        const sha = await putBlob(api, bytes)
        const path =
          'shared/' +
          (kind === 'photo' ? 'photos' : 'thumbs') +
          '/' +
          sha +
          '.jpg'
        attachment = { sha, path }
        attachCache.set(cacheKey, attachment)
      }
      changes.set(attachment.path, attachment.sha)
      wire[kind + 'Path'] = attachment.path
    }
    return wire
  }
  function archive(key, wire, reason) {
    if (!wire) return
    const id = String(now) + '-' + uid()
    const kind = kindForKey(key),
      entityId = idForKey(key)
    const info = {
      id,
      kind,
      entityId,
      title: String(wire.data.title || wire.data.name || '未命名'),
      reason,
      archivedAt: new Date(now).toISOString(),
      expiresAt: new Date(now + retain).toISOString(),
    }
    archives.push({
      path: 'shared/trash/' + id + '.json',
      doc: { ...info, record: fileDocument(kind, entityId, wire) },
    })
  }
  let restoreKey = '',
    restoreWire
  if (restoring) {
    const path = 'shared/trash/' + restoring + '.json'
    if (!trashPath.test(path) || !withinRetention(path, now))
      throw new Error('这份历史版本已经到期。')
    if (files.has(path)) {
      const archiveDoc = await readJSON(path)
      restoreKey = keyOf({ kind: archiveDoc.kind, id: archiveDoc.entityId })
      if (snap.privates.has(restoreKey))
        throw new Error('此设备已有同编号的私密内容，不能覆盖它。')
      restoreWire = wireFrom(
        archiveDoc.record,
        kindForKey(restoreKey),
        idForKey(restoreKey),
      )
      changes.set(path, null)
    }
  }
  const remoteKeys = [...files.keys()].map(keyFromPath).filter(Boolean)
  for (const key of new Set([
    ...remoteKeys,
    ...Object.keys(state.base),
    ...snap.entities.keys(),
    ...[...snap.privates].filter((k) => published.has(k)),
    ...(restoreKey ? [restoreKey] : []),
  ])) {
    const local = snap.entities.get(key) || null,
      privateHere = snap.privates.has(key),
      base = state.base[key]
    if (privateHere && !published.has(key) && key !== restoreKey) continue
    const current = await getWire(key)
    const localChanged =
      localDigest(local) !== (base?.localDigest || '') ||
      needsPreview(local, base)
    // A peer removed this entity without any recoverable deletion. Do not upload locally
    // edited bytes or re-create a recoverable copy of material withdrawn from sharing.
    const revoked =
      base &&
      !current &&
      local &&
      localChanged &&
      key !== restoreKey &&
      ![...(await historyIndex())].some(
        ([path, v]) =>
          v.key === key && v.reason === 'deleted' && withinRetention(path, now),
      )
    const localWire = revoked
      ? null
      : localChanged
        ? await materialize(local, base)
        : base?.wire || null
    let target = current
    if (key === restoreKey) {
      target = restoreWire
      if (
        localChanged &&
        localWire &&
        !equal(localWire, current) &&
        !equal(localWire, target)
      )
        archive(key, localWire, 'conflict')
    } else if (privateHere || revoked) {
      target = null
      if (privateHere) withdrawn.add(key)
    } else if (localChanged) {
      const remoteChanged = !equal(current, base?.wire || null)
      if (!remoteChanged || equal(localWire, current)) target = localWire
      else if (!localWire || !current) {
        // A deletion wins over a concurrent edit; the edit remains recoverable in history.
        if (localWire && !current) archive(key, localWire, 'conflict')
        target = null
      } else {
        const conflict = { value: false }
        target = mergeFields(
          base?.wire || undefined,
          localWire,
          current,
          conflict,
        )
        // Thumbnails must follow their full photo when both people replaced the image.
        if (localWire.photoPath !== current.photoPath) {
          const chosen =
            target.photoPath === localWire.photoPath ? localWire : current
          if (chosen.thumbPath) target.thumbPath = chosen.thumbPath
          else delete target.thumbPath
        }
        if (conflict.value && !equal(localWire, target))
          archive(key, localWire, 'conflict')
      }
    }
    if (!equal(target, current)) {
      if (current && !privateHere)
        archive(key, current, target ? 'updated' : 'deleted')
      documents.set(
        jsonPath(key),
        target ? fileDocument(kindForKey(key), idForKey(key), target) : null,
      )
      changes.set(jsonPath(key), null)
    }
    next.set(key, {
      target,
      local,
      localWire,
      privateHere,
      apply: !privateHere && (revoked || !equal(target, localWire)),
    })
  }
  for (const path of trashFiles)
    if (!withinRetention(path, now)) changes.set(path, null)
  if (withdrawn.size)
    for (const [path, item] of await historyIndex())
      if (withdrawn.has(item.key)) changes.set(path, null)
  for (const { path, doc } of archives) {
    documents.set(path, doc)
    changes.set(path, null)
  }
  async function verifyLocalSnapshot() {
    const check = parseSnapshot(await adapter.snapshot())
    // Capture again before publishing edits discovered in the first pass.
    for (const [key] of next) {
      if (
        (initialLocal.get(key) || '') !==
          localDigest(check.entities.get(key)) ||
        snap.privates.has(key) !== check.privates.has(key)
      )
        throw new LocalRace()
    }
  }
  if (changes.size) await verifyLocalSnapshot()
  for (const [path, value] of documents)
    if (
      value &&
      changes.has(path) &&
      (fileKey.test(path) || archives.some((a) => a.path === path))
    )
      changes.set(path, await putBlob(api, encodeJSON(value)))
  if (
    prune ||
    withdrawn.size ||
    trashFiles.some((p) => !withinRetention(p, now))
  ) {
    const used = new Set()
    const mark = (wire) => {
      if (wire?.photoPath) used.add(wire.photoPath)
      if (wire?.thumbPath) used.add(wire.thumbPath)
    }
    for (const key of remoteKeys) if (!next.has(key)) mark(await getWire(key))
    for (const row of next.values()) mark(row.target)
    for (const path of trashFiles)
      if (changes.get(path) !== null) mark(await trashInfo(path))
    for (const { doc } of archives) mark(doc.record)
    for (const p of files.keys())
      if ((windows.photo.test(p) || windows.thumb.test(p)) && !used.has(p))
        changes.set(p, null)
  }
  const committed = await atomicWrite(
    api,
    config,
    remote,
    changes,
    restoring ? '恢复共享手记历史版本' : '同步小日子共享记录',
    async () => {
      await verify(api, config)
      await verifyLocalSnapshot()
    },
  )
  function download(path, type) {
    return async () => {
      if (!path) return null
      const sha = changes.get(path) || files.get(path)
      if (!sha || !path.includes('/' + sha + '.'))
        throw new Error('共享附件未找到或版本不符。')
      const cached = await adapter.readCachedAttachment?.(path, type)
      if (cached) return cached
      const result = await api('/git/blobs/' + sha)
      if (
        result.sha !== sha ||
        result.encoding !== 'base64' ||
        typeof result.content !== 'string'
      )
        throw new Error('共享附件无法读取。')
      return 'data:' + type + ';base64,' + result.content.replace(/\s+/g, '')
    }
  }
  const updated = { ...state.base }
  for (const [key, row] of next) {
    const { target, local, apply } = row
    let acknowledged = local
    if (apply) {
      const result = await adapter.apply({
        kind: kindForKey(key),
        id: idForKey(key),
        data: target?.data || null,
        photoPath: target?.photoPath || '',
        thumbPath: target?.thumbPath || '',
        keepPhoto:
          !!local?.photoKey &&
          !!target?.photoPath &&
          target.photoPath === row.localWire?.photoPath,
        keepThumb:
          !!local?.thumbKey &&
          !!target?.thumbPath &&
          target.photoPath === row.localWire?.photoPath &&
          target.thumbPath === row.localWire?.thumbPath,
        readPhoto: download(target?.photoPath, 'image/jpeg'),
        readThumb: download(target?.thumbPath, 'image/jpeg'),
        expected: local,
      })
      if (result === false) {
        continue
      }
      // Only acknowledge the version actually written in the IDB transaction.
      // Its media may already have been replaced when the final snapshot is read.
      acknowledged = result.entity
    }
    if (!target) {
      delete updated[key]
      continue
    }
    updated[key] = {
      wire: target,
      sha: changes.get(jsonPath(key)) || files.get(jsonPath(key)),
      photoKey: acknowledged?.photoKey || '',
      thumbKey: acknowledged?.thumbKey || '',
      localDigest: localDigest(acknowledged),
    }
  }
  const finalSnap = parseSnapshot(await adapter.snapshot())
  for (const [path, meta] of trashCache)
    if (committed.files.get(path) !== meta.sha) trashCache.delete(path)
  for (const { path, doc } of archives)
    trashCache.set(path, trashSummary(path, committed.files.get(path), doc))
  for (const k of Object.keys(updated)) published.add(k)
  for (const k of withdrawn) published.delete(k)
  return {
    ...state,
    base: updated,
    inventory: inventoryOf(committed),
    published: [...published],
    pending: calculatePending(finalSnap, updated, published),
    trash: [...trashCache.values()],
    lastSync: new Date(now).toISOString(),
  }
}

export function createGitHubSync({
  adapter,
  onStatus,
  storage = createSyncState(),
  fetcher = globalThis.fetch?.bind(globalThis),
  clock = Date.now,
} = {}) {
  if (!adapter?.snapshot || !adapter?.apply)
    throw new Error('缺少本地共享数据接口。')
  let config = null,
    boundSpace = '',
    phase = 'idle',
    lastSync = '',
    pending = 0,
    error = '',
    needsToken = false,
    timer = null,
    retry = null,
    attempt = 0,
    epoch = 0
  let queue = Promise.resolve(),
    active = null
  const tasks = new Set()
  function serialized(fn) {
    const job = queue.then(fn)
    queue = job.catch(() => {})
    return job
  }
  const status = () => ({
    connected: !!config,
    owner: config?.owner || '',
    repo: config?.repo || '',
    branch: config?.branch || '',
    boundSpace,
    phase,
    pending,
    lastSync,
    error,
    needsToken,
  })
  const publish = () => {
    onStatus?.(status())
    for (const listener of tasks) listener(status())
  }
  function clearTimers() {
    clearTimeout(timer)
    clearTimeout(retry)
    timer = null
    retry = null
  }
  function schedule(delay = 450) {
    if (!config) return
    clearTimeout(timer)
    timer = setTimeout(
      () => {
        timer = null
        void sync().catch(() => {})
      },
      typeof delay === 'number' ? delay : 450,
    )
    timer.unref?.()
  }
  function lock(fn) {
    const locks = globalThis.navigator?.locks
    return locks
      ? locks.request('little-days-github-account', fn)
      : storage.withLock
        ? storage.withLock(fn)
        : fn()
  }
  function setupAPI(c) {
    const version = epoch,
      api = client(c, fetcher)
    return (...args) => {
      if (
        epoch !== version ||
        (storage.isCurrentToken && !storage.isCurrentToken(c.token))
      )
        throw new Error('同步空间已断开或令牌已更换。')
      return api(...args)
    }
  }
  async function readState(c) {
    const saved = await storage.get('state:' + bucketKey(c))
    return saved ? migrateSyncState(saved) : freshState()
  }
  async function saveState(c, state) {
    await storage.set('state:' + bucketKey(c), state)
  }
  const offline = () => globalThis.navigator?.onLine === false
  function indicateFailure(e) {
    const isNetwork =
      e.status !== 401 &&
      (offline() ||
        e instanceof TypeError ||
        e.name === 'AbortError' ||
        e.name === 'TimeoutError')
    phase = isNetwork ? 'offline' : 'error'
    error = isNetwork
      ? '暂时无法连接 GitHub，本机更改已保留。'
      : e.message || '同步未完成，本机更改已保留。'
    const canRetry =
      isNetwork ||
      e instanceof LocalRace ||
      [409, 422, 429, 500, 502, 503, 504].includes(e.status)
    if (canRetry && config && !offline()) {
      clearTimeout(retry)
      retry = setTimeout(
        () => {
          retry = null
          void sync().catch(() => {})
        },
        Math.min(180000, 2000 * 2 ** Math.min(7, attempt++)),
      )
      retry.unref?.()
    }
    publish()
  }
  async function reportFailure(c, state, e) {
    if (config !== c) return
    if (e.status === 401) {
      needsToken = true
      state.needsToken = true
      await saveState(c, state)
      clearTimeout(retry)
    }
    indicateFailure(e)
  }
  async function run(options = {}) {
    if (!config) return status()
    const latest = await storage.get('config')
    if (!latest) {
      config = null
      needsToken = false
      phase = 'idle'
      lastSync = ''
      pending = 0
      error = ''
      clearTimers()
      publish()
      return status()
    }
    config = configOf(latest, { saved: true })
    const c = config
    let state = await readState(c)
    const original = await adapter.snapshot()
    state.pending = calculatePending(
      parseSnapshot(original),
      state.base,
      state.published,
    )
    if (options.restore && !state.restores.includes(options.restore))
      state.restores.push(options.restore)
    pending = state.pending.length + state.restores.length
    lastSync = state.lastSync
    await saveState(c, state)
    needsToken = Boolean(state.needsToken) || !isFineGrainedToken(c.token)
    if (needsToken) {
      phase = 'error'
      error = isFineGrainedToken(c.token) ? renewTokenText : fineTokenText
      publish()
      throw new Error(error)
    }
    phase = 'syncing'
    error = ''
    publish()
    const api = setupAPI(c)
    try {
      if (offline()) throw new TypeError('offline')
      let remaining = 4
      for (;;) {
        const restoring = state.restores[0]
        try {
          state = await processCommit({
            api,
            config: c,
            adapter,
            state,
            now: clock(),
            prune: !!options.prune,
            restoring,
          })
          if (restoring)
            state.restores = state.restores.filter((id) => id !== restoring)
          await saveState(c, state)
          if (state.restores.length) continue
          break
        } catch (e) {
          if (remaining-- > 0 && (race(e) || e instanceof LocalRace)) continue
          // An unavailable/private historical item must not block later ordinary uploads.
          if (
            restoring &&
            !e.status &&
            !(e instanceof TypeError) &&
            !(e instanceof LocalRace)
          ) {
            state.restores = state.restores.filter((id) => id !== restoring)
            await saveState(c, state)
          }
          throw e
        }
      }
      attempt = 0
      clearTimeout(retry)
      phase = 'idle'
      error = ''
      lastSync = state.lastSync
      pending = state.pending.length
      publish()
      if (!pending && original.outboxRevision)
        await adapter.ackOutbox?.(original.outboxRevision)
      if (pending) schedule(1500)
      return status()
    } catch (e) {
      await reportFailure(c, state, e)
      throw new Error(error || '同步未完成。')
    }
  }
  function sync() {
    if (!active)
      active = serialized(() => lock(() => run())).finally(() => {
        active = null
      })
    return active
  }
  async function connect(values, onVerified) {
    const c = configOf(values)
    return serialized(() =>
      lock(async () => {
        const bound = await storage.get('bound')
        if (
          bound &&
          bound.split('@')[0] !== (c.owner + '/' + c.repo).toLowerCase()
        )
          throw new Error(
            '此设备的手记已绑定 ' +
              bound +
              '。请用独立的浏览器资料空间连接其他仓库。',
          )
        const api = client(c, fetcher)
        await verify(api, c)
        const binding = bucketKey(c)
        if (bound && bound !== binding)
          throw new Error(
            '此设备已绑定 ' + bound + '，不能将原有手记传入另一个分支。',
          )
        const state = await readState(c)
        const remote = await inspect(api, c, {
          init: true,
          inventory: state.inventory,
          verified: true,
        })
        // A pre-initialized empty space still needs a real write-permission check.
        // The marker already has these bytes, so this does not create a commit or user record.
        await putBlob(api, encodeJSON(signature))
        await storage.configure(c, binding)
        state.needsToken = false
        state.inventory = inventoryOf(remote)
        await saveState(c, state)
        needsToken = false
        onVerified?.()
        epoch++
        clearTimers()
        config = c
        boundSpace = binding
        phase = 'idle'
        error = ''
        publish()
        await run()
        return status()
      }),
    )
  }
  async function start() {
    boundSpace = (await storage.get('bound')) || ''
    const c = await storage.get('config')
    if (c) {
      config = configOf(c, { saved: true })
      const saved = await readState(config)
      pending = saved.pending.length + saved.restores.length
      lastSync = saved.lastSync
      needsToken = Boolean(saved.needsToken) || !isFineGrainedToken(c.token)
      if (needsToken) {
        phase = 'error'
        error = isFineGrainedToken(c.token) ? renewTokenText : fineTokenText
      }
    }
    publish()
    if (config)
      try {
        await sync()
      } catch {}
    return status()
  }
  async function disconnect() {
    epoch++
    clearTimers()
    return serialized(() =>
      lock(async () => {
        await storage.remove('config')
        config = null
        needsToken = false
        phase = 'idle'
        lastSync = ''
        error = ''
        pending = 0
        publish()
        return status()
      }),
    )
  }
  async function listTrash() {
    return serialized(() =>
      lock(async () => {
        if (!config) return []
        const state = await readState(config),
          now = clock()
        if (offline())
          return state.trash
            .filter((t) => Date.parse(t.expiresAt) > now)
            .sort((a, b) => b.archivedAt.localeCompare(a.archivedAt))
        if (!isFineGrainedToken(config.token)) throw new Error(fineTokenText)
        if (state.needsToken) throw new Error(renewTokenText)
        const c = config
        try {
          const api = setupAPI(c),
            remote = await inspect(api, c, { inventory: state.inventory })
          const previous = new Map(state.trash.map((t) => [t.id, t])),
            results = []
          for (const [path, sha] of remote.files) {
            const m = path.match(trashPath)
            if (!m || !withinRetention(path, now)) continue
            const id = path.slice('shared/trash/'.length, -5)
            const old = previous.get(id)
            const meta =
              old?.sha === sha
                ? old
                : trashSummary(path, sha, await jsonBlob(api, sha))
            results.push(meta)
          }
          state.inventory = inventoryOf(remote)
          state.trash = results
          await saveState(config, state)
          return results.sort((a, b) =>
            b.archivedAt.localeCompare(a.archivedAt),
          )
        } catch (e) {
          await reportFailure(c, state, e)
          throw e
        }
      }),
    )
  }
  return {
    status,
    start,
    connect,
    disconnect,
    schedule,
    sync,
    listTrash,
    restoreTrash: (id) => serialized(() => lock(() => run({ restore: id }))),
    cleanTrash: () => serialized(() => lock(() => run({ prune: true }))),
    subscribe(fn) {
      tasks.add(fn)
      return () => tasks.delete(fn)
    },
  }
}
