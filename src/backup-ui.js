import { exportBackup, validateBackup, importBackup } from './backup.js'

export function backupControls() {
  return `<section class="backup-tools" aria-labelledby="backup-title">
    <h3 id="backup-title">本机备份</h3>
    <p>把手记、照片、原声、清单和设置存进一个 JSON 文件。包含「仅自己」的内容，请妥善保存。</p>
    <div class="backup-actions">
      <button type="button" data-backup-export>导出完整备份</button>
      <button type="button" data-backup-choose>导入备份</button>
      <input type="file" accept=".json,application/json" data-backup-file hidden>
    </div>
    <p class="backup-status" role="status" aria-live="polite"></p>
    <div class="backup-confirm" hidden>
      <p>恢复会替换本机现有手记、清单及设置。可以先导出一份当前备份。</p>
      <button type="button" data-backup-cancel>取消</button>
      <button type="button" data-backup-restore>确认替换并恢复</button>
    </div>
  </section>`
}

export function bindBackupControls(root, onRestored) {
  const panel = root.querySelector('.backup-tools')
  const $ = (selector) => panel.querySelector(selector)
  const fileInput = $('[data-backup-file]')
  const confirmation = $('.backup-confirm')
  const status = $('.backup-status')
  let candidate = null
  function reset() {
    confirmation.hidden = true
    candidate = null
    fileInput.value = ''
    status.textContent = ''
  }
  function busy(value) {
    for (const button of panel.querySelectorAll('button'))
      button.disabled = value
  }
  $('[data-backup-export]').onclick = async () => {
    busy(true)
    status.textContent = '正在整理备份…'
    try {
      const backup = await exportBackup()
      const url = URL.createObjectURL(
        new Blob([JSON.stringify(backup)], { type: 'application/json' }),
      )
      const download = document.createElement('a')
      const today = new Date()
      const date = [
        today.getFullYear(),
        today.getMonth() + 1,
        today.getDate(),
      ].join('-')
      download.download = '小日子-完整备份-' + date + '.json'
      download.href = url
      document.body.append(download)
      download.click()
      download.remove()
      setTimeout(() => URL.revokeObjectURL(url), 60000)
      status.textContent = '备份文件已生成。'
    } catch (error) {
      status.textContent = error.message || '备份导出失败，请重试。'
    } finally {
      busy(false)
    }
  }
  $('[data-backup-choose]').onclick = () => {
    reset()
    fileInput.click()
  }
  fileInput.onchange = async () => {
    const file = fileInput.files[0]
    if (!file) return
    busy(true)
    status.textContent = '正在检查备份文件…'
    try {
      const parsed = JSON.parse((await file.text()).replace(/^\uFEFF/, ''))
      const counts = await validateBackup(parsed)
      candidate = parsed
      status.textContent = `找到 ${counts.records} 篇手记、${counts.plans} 件清单事项、${counts.archived} 条归档。`
      confirmation.hidden = false
    } catch (error) {
      reset()
      status.textContent =
        error instanceof SyntaxError
          ? '文件不是有效的 JSON，请重新选择。'
          : error.message || '无法读取这份备份。'
    } finally {
      busy(false)
    }
  }
  $('[data-backup-cancel]').onclick = reset
  $('[data-backup-restore]').onclick = async () => {
    if (!candidate) return
    busy(true)
    status.textContent = '正在恢复到本机…'
    try {
      const counts = await importBackup(candidate)
      reset()
      await onRestored()
      status.textContent = `已恢复 ${counts.records} 篇手记和 ${counts.plans} 件清单事项。`
    } catch (error) {
      status.textContent = error.message || '恢复失败，请检查可用空间后重试。'
    } finally {
      busy(false)
    }
  }
}
