// Kept outside the journal database and its portable backups. The GitHub credential
// never enters a journal entry, export, URL, repository file, or UI status message.
export function createSyncState() {
  const tokenKey = 'xiaorizi.github.token'
  let opened
  function database() {
    if (opened) return opened
    opened = new Promise((resolve, reject) => {
      if (!globalThis.indexedDB) return reject(new Error('此浏览器无法保存同步设置。'))
      const req = indexedDB.open('little-days-github-sync', 1)
      req.onupgradeneeded = () => req.result.createObjectStore('settings')
      req.onsuccess = () => {
        const db = req.result
        db.onversionchange = () => {db.close(); opened = null}
        resolve(db)
      }
      req.onerror = () => {opened = null; reject(new Error('无法打开本机同步设置。'))}
    })
    return opened
  }
  async function access(mode, action) {
    const db = await database()
    return new Promise((resolve, reject) => {
      const tx = db.transaction('settings', mode)
      const request = action(tx.objectStore('settings'))
      tx.oncomplete = () => resolve(request?.result)
      tx.onabort = () => reject(new Error('同步状态未能保存在此设备上，请检查可用空间。'))
    })
  }
  return {
    async get(key) {
      const value=await access('readonly', store => store.get(key))
      if(key!=='config'||!value)return value
      const token=localStorage.getItem(tokenKey)
      return token?{owner:value.owner,repo:value.repo,branch:value.branch,token}:null
    },
    set: (key, value) => access('readwrite', store => store.put(value,key)),
    async remove(key) {
      if(key==='config')localStorage.removeItem(tokenKey)
      await access('readwrite', store=>store.delete(key))
    },
    async configure({owner,repo,branch,token},bound) {
      const before=localStorage.getItem(tokenKey)
      localStorage.setItem(tokenKey,token)
      try {
        await access('readwrite', store => {
          store.put(bound,'bound')
          return store.put({owner,repo,branch},'config')
        })
      } catch(error) {
        if(before===null)localStorage.removeItem(tokenKey)
        else localStorage.setItem(tokenKey,before)
        throw error
      }
    },
  }
}
