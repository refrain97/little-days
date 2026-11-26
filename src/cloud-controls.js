import { getAISettings, saveAISettings, clearAISettings } from './device-ai.js'
import { readProfile, saveProfile, profileFrom } from './cloud-profile.js'

const by = (root, selector) => root.querySelector(selector)
const kinds = { entries: '手记', places: '店铺', freetime: '清单' }
const field = (label, attributes) =>
  `<label class="cloud-field"><span>${label}</span><input ${attributes}></label>`
const secret =
  'type="password" autocomplete="new-password" autocapitalize="none" spellcheck="false"'
const plain = 'type="text" autocomplete="off"'
const repoField = field(
  '私有数据仓库',
  plain +
    ' data-space-repo placeholder="组织名/仓库名" autocapitalize="none" spellcheck="false" required',
)

export function cloudControls() {
  return `<section class="cloud-tools" aria-labelledby="space-heading"><h3 id="space-heading">双人云空间</h3>
    <p data-space-state aria-live="polite"></p>
    <div data-connected hidden class="cloud-actions"><button type="button" data-sync>立即同步</button><button type="button" data-trash>回收站</button><button type="button" data-disconnect>断开连接</button></div>
    <div data-trash-list class="trash-list" hidden></div>
    <details data-space-setup><summary data-space-summary>连接双人云空间</summary>
      <form data-space-form>
        ${repoField}
        <div class="cloud-profile-fields">${field('我的昵称', plain + ' data-space-name placeholder="你的昵称" maxlength="48" required')}${field('头像首字', plain + ' data-space-initial placeholder="取昵称首字" maxlength="12"')}</div>
        ${field('GitHub Fine-grained PAT', secret + ' data-space-token placeholder="仅保存在这台设备" required')}
        <p>连接后，已有和新建的「一起看」内容会同步到这个仓库。请使用仅有该私库 Contents 读写权限的 Token。</p>
        <button class="solid" type="submit" data-connect>验证并连接</button>
      </form>
    </details>
    <p data-cloud-message role="status"></p>
  </section>
  <details class="cloud-tools ai-tools"><summary>AI 识别配置 <small>选填</small></summary>
    <form data-ai-form>
      ${field('兼容接口地址', 'type="url" autocomplete="off" autocapitalize="none" spellcheck="false" data-ai-endpoint required placeholder="https://…/v1"')}
      ${field('模型名', plain + ' data-ai-model autocapitalize="none" spellcheck="false" required')}
      ${field('API Key', secret + ' data-ai-key placeholder="仅保存在这台设备"')}
      <p>对「一起看」的手记点识别并确认后，会把所选素材发给此服务。接口须支持浏览器跨域访问。</p>
      <div class="cloud-actions"><button type="submit">保存 AI 配置</button><button type="button" data-forget-ai>清除配置</button></div>
      <p data-ai-status role="status"></p>
    </form></details>`
}

export function paintSpaceStatus(root, status) {
  const info = by(root, '[data-space-state]')
  if (!info) return
  const place = status.connected ? status.owner + '/' + status.repo : ''
  const time = status.lastSync && new Date(status.lastSync)
  const last =
    time && !Number.isNaN(time.getTime())
      ? ' · 上次同步 ' +
        time.toLocaleString('zh-CN', {
          month: 'numeric',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        })
      : ''
  const pending = status.pending ? ' · ' + status.pending + ' 项待同步' : ''
  const phase = {
    syncing: '同步中…',
    offline: '离线，修改暂存在本机',
    error: status.error || '同步遇到问题',
  }
  info.textContent = status.connected
    ? place + ' · ' + (phase[status.phase] || '已连接') + pending + last
    : status.boundSpace
      ? '已断开 · 本机账本关联 ' + status.boundSpace
      : '尚未连接，手记保存在本机。'
  by(root, '[data-connected]').hidden = !status.connected
  by(root, '[data-sync]').disabled = status.phase === 'syncing'
  const token = by(root, '[data-space-token]')
  token.required = !status.connected
  token.placeholder = status.connected ? '已保存，留空沿用' : '仅保存在这台设备'
  by(root, '[data-space-summary]').textContent = status.connected
    ? '更新我的资料或 Token'
    : '连接双人云空间'
}
export function bindCloudControls(root, sync) {
  root = by(root, '.settings-inner') || root
  const $ = (s) => by(root, s)
  const form = $('[data-space-form]')
  const tell = (msg) => {
    $('[data-cloud-message]').textContent = msg
  }
  const status = sync.status()
  const profile = readProfile()
  $('[data-space-name]').value = profile?.nickname || ''
  $('[data-space-initial]').value = profile?.initial || ''
  const codeRepo = document.querySelector(
    'meta[name="little-days-code-repo"]',
  )?.content
  $('[data-space-repo]').value = status.connected
    ? status.owner + '/' + status.repo
    : (status.boundSpace || '').split('@')[0] ||
      (codeRepo ? codeRepo + '-data' : '')
  paintSpaceStatus(root, status)
  form.onsubmit = async (e) => {
    e.preventDefault()
    const save = $('[data-connect]')
    if (save.disabled) return
    save.disabled = true
    const previous = readProfile()
    let candidate
    try {
      const value = $('[data-space-repo]').value.trim()
      const match = /^([A-Za-z0-9][A-Za-z0-9-]*)\/([A-Za-z0-9_.-]+)$/.exec(
        value,
      )
      if (!match) throw Error('仓库名称请写成 owner/repo。')
      candidate = profileFrom(
        $('[data-space-name]').value,
        $('[data-space-initial]').value,
      )
      const token = $('[data-space-token]').value.trim()
      if (!token) {
        const current = sync.status()
        if (
          !current.connected ||
          value.toLowerCase() !==
            (current.owner + '/' + current.repo).toLowerCase()
        )
          throw Error('请填写此私库的 Fine-grained PAT。')
        saveProfile(candidate)
        $('[data-space-setup]').open = false
        tell('本机记录者资料已更新。')
        return
      }
      saveProfile(candidate)
      tell('正在验证私有仓库及权限…')
      await sync.connect({
        owner: match[1],
        repo: match[2],
        token,
        ...candidate,
      })
      $('[data-space-token]').value = ''
      $('[data-space-setup]').open = false
      tell('云空间已连接。')
    } catch (error) {
      if (
        candidate &&
        sync.status().phase !== 'offline' &&
        sync.status().phase !== 'error'
      )
        saveProfile(previous)
      tell(error.message || '未能连接。请检查仓库名称和 Token 权限。')
    } finally {
      save.disabled = false
      paintSpaceStatus(root, sync.status())
    }
  }
  $('[data-sync]').onclick = async () => {
    try {
      await sync.sync()
      tell(
        sync.status().error ||
          (sync.status().phase === 'offline'
            ? '修改已留在本机，联网后继续。'
            : '同步完成。'),
      )
    } catch (error) {
      tell(error.message)
    }
  }
  $('[data-disconnect]').onclick = async () => {
    try {
      await sync.disconnect()
      $('[data-space-token]').value = ''
      $('[data-trash-list]').replaceChildren()
      $('[data-trash-list]').hidden = true
      tell('此设备已断开，GitHub Token 已移除。本机手记仍可使用。')
    } catch (e) {
      tell(e.message)
    }
    paintSpaceStatus(root, sync.status())
  }
  async function trash() {
    const container = $('[data-trash-list]')
    container.hidden = false
    container.textContent = '正在读取回收站…'
    try {
      const items = await sync.listTrash()
      container.replaceChildren()
      const intro = document.createElement('p')
      intro.textContent = items.length
        ? '近 30 天删除的内容与修改前的版本。'
        : '近 30 天没有可恢复的内容。'
      container.append(intro)
      for (const item of items) {
        const row = document.createElement('div')
        row.className = 'trash-item'
        const content = document.createElement('span'),
          title = document.createElement('strong'),
          info = document.createElement('small')
        title.textContent = item.title || item.entityId
        const when = new Date(item.archivedAt)
        info.textContent = [
          kinds[item.kind] || '记录',
          item.reason === 'delete' || item.reason === 'deleted'
            ? '已删除'
            : '历史版本',
          Number.isNaN(when.getTime()) ? '' : when.toLocaleString('zh-CN'),
        ]
          .filter(Boolean)
          .join(' · ')
        content.append(title, info)
        const restore = document.createElement('button')
        restore.type = 'button'
        restore.textContent = '恢复'
        restore.onclick = async () => {
          restore.disabled = true
          try {
            await sync.restoreTrash(item.id)
            tell('已恢复到云空间。')
            await trash()
          } catch (e) {
            tell(e.message)
            restore.disabled = false
          }
        }
        row.append(content, restore)
        container.append(row)
      }
    } catch (e) {
      container.textContent = e.message || '回收站读取失败，可联网后重试。'
    }
  }
  $('[data-trash]').onclick = () => {
    const list = $('[data-trash-list]')
    if (list.hidden) void trash()
    else list.hidden = true
  }
  const aiForm = $('[data-ai-form]')
  function aiState() {
    const ai = getAISettings()
    $('[data-ai-endpoint]').value = ai.endpoint || ''
    $('[data-ai-model]').value = ai.model || ''
    $('[data-ai-key]').value = ''
    $('[data-ai-key]').placeholder = ai.hasKey
      ? '已保存，留空保留'
      : '仅保存在这台设备'
    $('[data-forget-ai]').hidden = !ai.configured && !ai.hasKey
    $('[data-ai-status]').textContent = ai.configured
      ? '已配置，识别请求发往 ' + ai.origin
      : '未配置，可使用拍照、打字和系统听写。'
  }
  aiForm.onsubmit = (e) => {
    e.preventDefault()
    try {
      saveAISettings({
        endpoint: $('[data-ai-endpoint]').value.trim(),
        model: $('[data-ai-model]').value.trim(),
        key: $('[data-ai-key]').value.trim(),
      })
      aiState()
    } catch (error) {
      $('[data-ai-status]').textContent = error.message
    }
  }
  $('[data-forget-ai]').onclick = () => {
    try {
      clearAISettings()
      aiState()
    } catch (e) {
      $('[data-ai-status]').textContent = e.message
    }
  }
  aiState()
}
