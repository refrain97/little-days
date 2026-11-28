// Enable the mobile pre-push check in new checkouts without replacing personal hooks.
import { execFileSync } from 'node:child_process'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../', import.meta.url))
function git(...args) {
  return execFileSync('git', args, {
    cwd: root,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  }).trim()
}

async function install() {
  if (process.env.CI) return
  let checkout
  try {
    checkout = git('rev-parse', '--show-toplevel')
  } catch {
    return
  }
  if (resolve(checkout) !== resolve(root)) return

  try {
    const hooks = git('config', '--get', 'core.hooksPath')
    if (hooks) {
      console.warn(
        '当前使用自定义 Git hooks 路径。请在原 pre-push 中执行 scripts/pre-push，并传入 Git 的参数和标准输入。',
      )
      return
    }
  } catch {
    /* An unset hooksPath uses the default directory. */
  }

  const hook = resolve(root, git('rev-parse', '--git-path', 'hooks/pre-push'))
  const runner =
    '#!/bin/sh\nexec "$(git rev-parse --show-toplevel)/scripts/pre-push" "$@"\n'
  await mkdir(dirname(hook), { recursive: true })
  try {
    await writeFile(hook, runner, { flag: 'wx', mode: 0o755 })
  } catch (error) {
    if (error.code !== 'EEXIST') throw error
    if ((await readFile(hook, 'utf8')) !== runner)
      console.warn(
        '现有 pre-push 已保留。请在其中执行 scripts/pre-push，并传入 Git 的参数和标准输入。',
      )
  }
}
await install()
