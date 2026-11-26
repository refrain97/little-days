// Kept outside the journal database and its portable backups. The GitHub credential
// never enters a journal entry, export, URL, repository file, or UI status message.
export function isFineGrainedToken(value) {
  return typeof value === 'string' && /^github_pat_[A-Za-z0-9_]+$/.test(value)
}

export function createSyncState() {
  const tokenKey = 'xiaorizi.github.token'
  let opened
  function database() {
    if (opened) return opened
    opened = new Promise((resolve, reject) => {
      if (!globalThis.indexedDB)
        return reject(new Error('此浏览器无法保存同步设置。'))
      const req = indexedDB.open('little-days-github-sync', 1)
      req.onupgradeneeded = () => req.result.createObjectStore('settings')
      req.onsuccess = () => {
        const db = req.result
        db.onversionchange = () => {
          db.close()
          opened = null
        }
        resolve(db)
      }
      req.onerror = () => {
        opened = null
        reject(new Error('无法打开本机同步设置。'))
      }
    })
    return opened
  }
  async function access(mode, action) {
    const db = await database()
    return new Promise((resolve, reject) => {
      const tx = db.transaction('settings', mode)
      const request = action(tx.objectStore('settings'))
      tx.oncomplete = () => resolve(request?.result)
      tx.onabort = () =>
        reject(new Error('同步状态未能保存在此设备上，请检查可用空间。'))
    })
  }
  async function lease(owner, release) {
    const db = await database()
    return new Promise((resolve, reject) => {
      const tx = db.transaction('settings', 'readwrite'),
        store = tx.objectStore('settings')
      const read = store.get('active-sync')
      let held = false
      read.onsuccess = () => {
        const previous = read.result
        if (
          previous?.owner !== owner &&
          (release || previous?.expires > Date.now())
        )
          return
        if (release) store.delete('active-sync')
        else store.put({ owner, expires: Date.now() + 90000 }, 'active-sync')
        held = true
      }
      tx.oncomplete = () => resolve(held)
      tx.onabort = () => reject(new Error('未能取得设备上的同步状态。'))
    })
  }
  return {
    isCurrentToken: (value) => localStorage.getItem(tokenKey) === value,
    async withLock(work) {
      const owner =
        globalThis.crypto?.randomUUID?.() || Math.random().toString(36).slice(2)
      while (!(await lease(owner, false)))
        await new Promise((resolve) => setTimeout(resolve, 250))
      const interval = setInterval(() => {
        void lease(owner, false).catch(() => {})
      }, 20000)
      try {
        return await work()
      } finally {
        clearInterval(interval)
        await lease(owner, true)
      }
    },
    async get(key) {
      const value = await access('readonly', (store) => store.get(key))
      if (key !== 'config' || !value) return value
      let token = localStorage.getItem(tokenKey) || ''
      if (token && !isFineGrainedToken(token)) {
        // Older versions accepted other credential types. Discard that
        // credential but keep the repository binding and unsent changes.
        localStorage.removeItem(tokenKey)
        token = ''
      }
      return {
        owner: value.owner,
        repo: value.repo,
        branch: value.branch,
        token,
      }
    },
    set: (key, value) => access('readwrite', (store) => store.put(value, key)),
    async remove(key) {
      if (key === 'config') localStorage.removeItem(tokenKey)
      await access('readwrite', (store) => store.delete(key))
    },
    async configure({ owner, repo, branch, token }, bound) {
      if (!isFineGrainedToken(token))
        throw new Error('请使用数据仓库的 Fine-grained PAT。')
      const before = localStorage.getItem(tokenKey)
      let problem,
        wroteToken = false
      try {
        await access('readwrite', (store) => {
          const get = store.get('bound')
          get.onsuccess = () => {
            try {
              if (get.result && get.result !== bound)
                throw new Error('本机手记已绑定其他数据仓库。')
              localStorage.setItem(tokenKey, token)
              wroteToken = true
              store.put(bound, 'bound')
              store.put({ owner, repo, branch }, 'config')
            } catch (e) {
              problem = e
              store.transaction.abort()
            }
          }
          return get
        })
      } catch (error) {
        if (wroteToken && localStorage.getItem(tokenKey) === token) {
          if (before === null) localStorage.removeItem(tokenKey)
          else localStorage.setItem(tokenKey, before)
        }
        throw problem || error
      }
    },
  }
}
