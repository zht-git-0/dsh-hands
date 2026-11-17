// killProcessTree 纯函数测试：node acp/test-cancel.mjs
// 起一个只会 sleep 的假任务，杀它，断言 2 秒内真的消失（process.kill(pid, 0) 抛 ESRCH）。
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { killProcessTree } from '../index.js'

function spawnFake() {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['-e', 'setTimeout(() => {}, 60000)'], {
      stdio: 'ignore',
      windowsHide: true,
    })
    child.once('spawn', () => resolve(child))
    child.once('error', reject)
  })
}

// ESRCH = 这个 pid 已经不存在了
function isGone(pid) {
  try {
    process.kill(pid, 0)
    return false
  } catch (error) {
    return error.code === 'ESRCH'
  }
}

const child = await spawnFake()
const pid = child.pid
assert.ok(Number.isInteger(pid) && pid > 0, '假任务应该拿到 pid')
assert.equal(isGone(pid), false, '刚起来的进程还活着')

const killed = await killProcessTree(pid)
assert.equal(killed, true, 'killProcessTree 应该报告杀掉了')

const deadline = Date.now() + 2000
while (Date.now() < deadline) {
  if (isGone(pid)) break
  await new Promise((resolve) => setTimeout(resolve, 50))
}
assert.equal(isGone(pid), true, `进程 ${pid} 应该在 2 秒内消失`)

// 无效 pid 直接 false，不能误伤别人
assert.equal(await killProcessTree(0), false)
assert.equal(await killProcessTree(null), false)

console.log('ok')
