import assert from 'node:assert/strict'
import { createHash, randomBytes } from 'node:crypto'

export const fineToken = () => 'github_pat_' + randomBytes(24).toString('hex')
const sha = (bytes) => createHash('sha1').update(bytes).digest('hex')
const response = (status, body) => ({
  status,
  ok: status >= 200 && status < 300,
  json: async () => structuredClone(body),
})

// Model immutable Git objects and a branch that can only fast-forward. Only the
// injected fetch function is called; no fixture or credential leaves the process.
export class Repository {
  profile = {
    owner: 'example',
    repo: 'journal',
    token: fineToken(),
  }
  blobs = new Map()
  trees = new Map()
  commits = new Map()
  head = ''
  private = true
  online = true
  beforePush = null
  beforeRequest = null
  requests = []

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
    assert.equal(redirect, 'error')
    assert.ok(
      !url.includes(this.profile.token) && !body?.includes(this.profile.token),
    )
    const route = url.slice(root.length).split('?')[0]
    this.requests.push([method, route])
    this.beforeRequest?.(method, route)
    if (!this.online) throw new TypeError('simulated offline')
    if (headers.Authorization !== 'Bearer ' + this.profile.token)
      return response(401, { message: 'Bad credentials' })
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
