import {
  exportBackup,
  validateBackup,
  importBackup,
  exportPrivateBackup,
  validatePrivateBackup,
  importPrivateBackup,
  privateBackupStatus,
  markPrivateBackupSaved,
} from './backup.js'

function controls(scope, privateOnly) {
  const title = privateOnly ? '私人备份' : '完整备份'
  return `<div class="backup-actions">
      <button type="button" data-${scope}-export>导出${title}</button>
      <button type="button" data-${scope}-choose>${privateOnly ? '导入私人备份' : '导入备份'}</button>
      <input type="file" accept=".json,application/json" data-${scope}-file hidden>
    </div>
    <p class="backup-status" role="status" aria-live="polite" data-${scope}-status></p>
    <div data-${scope}-download-panel hidden>
      <a data-${scope}-download>再次下载 JSON</a>
      <button type="button" data-${scope}-saved>文件已保存</button>
      <button type="button" data-${scope}-skip>取消</button>
    </div>
    <div class="backup-confirm" data-${scope}-confirmation hidden>
      <p ${privateOnly ? '' : 'data-backup-confirm-note'}>${
        privateOnly
          ? '合并到本机。已有的同一篇私人记录会更新；其他手记和共享空间保持原样。'
          : '恢复会替换本机现有手记、清单及设置。可以先导出一份当前备份。'
      }</p>
      <button type="button" data-${scope}-cancel>取消</button>
      <button type="button" data-${scope}-restore>${privateOnly ? '确认合并私人备份' : '确认替换并恢复'}</button>
    </div>`
}

export function backupControls() {
  return `<section class="backup-tools" aria-labelledby="private-backup-title">
    <h3 id="private-backup-title">私人手记备份</h3>
    <p>把「仅自己」的手记、照片、早餐点子、清单及归档收进一个 JSON 文件。</p>
    <p data-private-backup-date></p>
    ${controls('private-backup', true)}
    <h3 id="backup-title">整本备份与迁移</h3>
    <p>完整备份包含两种可见范围的内容、店铺、早餐池和偏好。请将文件保存在自己的设备。</p>
    ${controls('backup', false)}
  </section>`
}

export function refreshPrivateBackupStatus(
  root,
  entries,
  plans,
  breakfast = [],
) {
  const label = root.querySelector('[data-private-backup-date]')
  if (!label) return
  const { lastBackupAt, due } = privateBackupStatus(
    entries,
    plans,
    Date.now(),
    breakfast,
  )
  const last = lastBackupAt
    ? new Date(lastBackupAt).toLocaleString('zh-CN', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : ''
  label.textContent =
    (last ? '上次手动备份 · ' + last : '这台设备还没有手动备份记录。') +
    (due ? ' 已超过两周，可以存一份了。' : '')
}

// Keep each attachment's JSON encoding separate instead of building one additional
// monolithic UTF-16 string containing the whole photo/recording library.
function backupBlob(backup) {
  const { records, plans, ...header } = backup
  const parts = [JSON.stringify(header).slice(0, -1)]
  for (const [key, rows] of [
    ['records', records],
    ['plans', plans],
  ]) {
    parts.push(',"' + key + '":[')
    rows.forEach((row, index) => {
      if (index) parts.push(',')
      parts.push(JSON.stringify(row))
    })
    parts.push(']')
  }
  parts.push('}')
  return new Blob(parts, { type: 'application/json' })
}

async function writeFile(handle, blob) {
  const stream = await handle.createWritable()
  try {
    await stream.write(blob)
    await stream.close()
  } catch (error) {
    try {
      await stream.abort()
    } catch {}
    throw error
  }
}

export function bindBackupControls(
  root,
  onRestored,
  { entries = [], plans = [], breakfast = [] } = {},
) {
  const panel = root.querySelector('.backup-tools')
  const busy = (value) => {
    for (const button of panel.querySelectorAll('button'))
      button.disabled = value
  }
  refreshPrivateBackupStatus(root, entries, plans, breakfast)
  for (const privateOnly of [true, false]) {
    const scope = privateOnly ? 'private-backup' : 'backup'
    const at = (name) =>
      panel.querySelector('[data-' + scope + '-' + name + ']')
    const status = at('status'),
      fileInput = at('file'),
      confirmation = at('confirmation')
    const downloadPanel = at('download-panel'),
      download = at('download')
    let observer
    let candidate = null,
      url = '',
      exportedAt = '',
      expiry
    function clearDownload() {
      clearTimeout(expiry)
      observer?.disconnect()
      observer = undefined
      if (url) URL.revokeObjectURL(url)
      url = ''
      exportedAt = ''
      download.removeAttribute('href')
      downloadPanel.hidden = true
    }
    function clearImport() {
      confirmation.hidden = true
      candidate = null
      fileInput.value = ''
    }
    function saved() {
      try {
        markPrivateBackupSaved(exportedAt)
        refreshPrivateBackupStatus(root, entries, plans, breakfast)
        status.textContent = '备份已保存，已更新上次备份时间。'
      } catch {
        status.textContent = '文件已保存，本机暂时无法记录备份时间。'
      }
      clearDownload()
    }
    at('export').onclick = async () => {
      clearImport()
      clearDownload()
      busy(true)
      status.textContent = '正在整理备份…'
      try {
        const now = new Date()
        const date = [
          now.getFullYear(),
          String(now.getMonth() + 1).padStart(2, '0'),
          String(now.getDate()).padStart(2, '0'),
        ].join('-')
        const name =
          '小日子-' +
          (privateOnly ? '私人备份' : '完整备份') +
          '-' +
          date +
          '.json'
        // A native picker is called during the click gesture. Its close() result
        // confirms the file was actually written; a cancelled picker leaves no timestamp.
        const handle =
          privateOnly && typeof globalThis.showSaveFilePicker === 'function'
            ? await globalThis.showSaveFilePicker({
                suggestedName: name,
                types: [
                  {
                    description: 'JSON 备份',
                    accept: { 'application/json': ['.json'] },
                  },
                ],
              })
            : null
        const backup = privateOnly
          ? await exportPrivateBackup()
          : await exportBackup()
        const blob = backupBlob(backup)
        const includesPrivate =
          privateOnly ||
          backup.records.some((row) => row.visibility === 'private') ||
          backup.plans.some((row) => row.visibility === 'private')
        exportedAt = backup.exportedAt
        if (handle) {
          await writeFile(handle, blob)
          saved()
        } else {
          url = URL.createObjectURL(blob)
          download.href = url
          observer = new MutationObserver(() => {
            if (!panel.isConnected) clearDownload()
          })
          observer.observe(root, { childList: true, subtree: true })
          download.download = name
          downloadPanel.hidden = false
          download.click()
          at('saved').hidden = !includesPrivate
          status.textContent = includesPrivate
            ? '请在文件保存后点「文件已保存」，记录这次备份。'
            : '完整备份文件已生成。'
          // The large Blob can be released independently of the user's confirmation.
          expiry = setTimeout(
            () => {
              URL.revokeObjectURL(url)
              url = ''
              download.removeAttribute('href')
              download.hidden = true
            },
            5 * 60 * 1000,
          )
        }
      } catch (error) {
        clearDownload()
        status.textContent =
          error?.name === 'AbortError'
            ? '已取消，备份时间未更新。'
            : error.message || '备份失败，请再试一次。'
      } finally {
        download.hidden = false
        busy(false)
      }
    }
    at('saved').onclick = saved
    at('skip').onclick = () => {
      clearDownload()
      status.textContent = ''
    }
    at('choose').onclick = () => {
      clearDownload()
      clearImport()
      status.textContent = ''
      fileInput.click()
    }
    fileInput.onchange = async () => {
      const file = fileInput.files[0]
      if (!file) return
      clearDownload()
      busy(true)
      status.textContent = '正在检查备份文件…'
      try {
        const parsed = JSON.parse((await file.text()).replace(/^\uFEFF/, ''))
        const summary = privateOnly
          ? validatePrivateBackup(parsed)
          : validateBackup(parsed)
        candidate = parsed
        status.textContent = `找到 ${summary.records} 篇手记、${summary.plans} 件清单事项、${summary.archived} 条归档${summary.breakfastIdeas ? `、${summary.breakfastIdeas} 个早餐点子` : ''}。`
        confirmation.hidden = false
      } catch (error) {
        clearImport()
        status.textContent =
          error instanceof SyntaxError
            ? '文件不是有效的 JSON，请重新选择。'
            : error.message || '无法读取这份备份。'
      } finally {
        busy(false)
      }
    }
    at('cancel').onclick = () => {
      clearImport()
      status.textContent = ''
    }
    at('restore').onclick = async () => {
      if (!candidate) return
      busy(true)
      status.textContent = '正在恢复到本机…'
      try {
        const summary = privateOnly
          ? await importPrivateBackup(candidate)
          : await importBackup(candidate)
        clearImport()
        await onRestored()
        status.textContent = `已恢复 ${summary.records} 篇手记和 ${summary.plans} 件清单事项${summary.breakfastIdeas ? `、${summary.breakfastIdeas} 个早餐点子` : ''}。`
      } catch (error) {
        status.textContent = error.message || '恢复失败，请检查可用空间后重试。'
      } finally {
        busy(false)
      }
    }
  }
}
