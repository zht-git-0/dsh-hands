// 恢复 end-once：日志已有 CANCELLED end 时，恢复进程退出不得再追加 ORPHAN。
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { fileURLToPath, pathToFileURL } from 'node:url'

const repoIndex = fileURLToPath(new URL('../index.js', import.meta.url))
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'hands-recovered-end-once-'))
const home = path.join(root, 'home')
const dsh = path.join(home, '.dsh')
const readyFile = path.join(root, 'ready')
const childFile = path.join(root, 'child.mjs')
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
fs.mkdirSync(dsh, { recursive: true })

const dummy = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore' })
await new Promise((resolve, reject) => {
  dummy.once('spawn', resolve)
  dummy.once('error', reject)
})
assert.ok(dummy.pid)

const startedAt = new Date(Date.now() - 60_000).toISOString()
const start = {
  v: 2, phase: 'start', id: 'run-old', hand: 'opencode', tool: 'hands_run',
  prompt: '已取消的恢复任务', session: 'old', sessionKey: 'opencode/old',
  conversationId: 'sid_old', cwd: 'D:/work', startedAt, at: startedAt,
}
const end = { ...start, phase: 'end', status: 'CANCELLED', ok: false, at: startedAt, error: 'cancelled' }
fs.writeFileSync(path.join(dsh, 'hands-log.jsonl'), [start, end].map(JSON.stringify).join('\n') + '\n')
fs.writeFileSync(path.join(dsh, 'hands-async.json'), JSON.stringify({
  v: 1,
  jobs: {
    'job-old': {
      id: 'job-old', dispatchId: 'run-old', hand: 'opencode', tool: 'hands_run',
      session: 'old', sessionKey: 'opencode/old', conversationId: 'sid_old', cwd: 'D:/work',
      startedAt: Date.parse(startedAt) + 6, status: 'RUNNING', pid: dummy.pid, delivery: 'pending',
    },
  },
}))

fs.writeFileSync(childFile, `
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
const { apply } = await import(${JSON.stringify(pathToFileURL(repoIndex).href)})
let handler = null
const cleanups = []
const ctx = {
  tools: { register: () => () => {} },
  webServer: { register(options) { if (options?.path === '/dsh-hands') handler = options.handler; return () => {} } },
  effect(fn) { const cleanup = fn(); if (typeof cleanup === 'function') cleanups.push(cleanup); return cleanup },
  get: () => undefined,
}
apply(ctx, {})
async function call(url) {
  const req = { url, method: 'GET', on() {} }
  const res = { status: 0, body: '', headersSent: false, writableEnded: false,
    writeHead(status) { this.status = status }, end(value) { this.body = String(value ?? '') } }
  await handler(req, res)
  return JSON.parse(res.body)
}
const before = await call('/dsh-hands/turns?key=' + encodeURIComponent('opencode/sid:sid_old'))
assert.equal(before.turns[0].status, 'CANCELLED')
fs.writeFileSync(${JSON.stringify(readyFile)}, 'ready')
await new Promise((resolve) => setTimeout(resolve, 6500))
const after = await call('/dsh-hands/turns?key=' + encodeURIComponent('opencode/sid:sid_old'))
assert.equal(after.turns.length, 1)
assert.equal(after.turns[0].status, 'CANCELLED')
const records = fs.readFileSync(path.join(process.env.USERPROFILE, '.dsh', 'hands-log.jsonl'), 'utf8')
  .split(/\\r?\\n/).filter(Boolean).map(JSON.parse)
const ends = records.filter((row) => row.id === 'run-old' && row.phase === 'end')
assert.equal(ends.length, 1, '已有 end 不得重复补')
assert.equal(ends[0].status, 'CANCELLED')
const state = JSON.parse(fs.readFileSync(path.join(process.env.USERPROFILE, '.dsh', 'hands-async.json'), 'utf8'))
assert.equal(state.jobs['job-old'].status, 'CANCELLED', 'asyncState 最终状态以日志 end 为准')
assert.equal(state.jobs['job-old'].delivery, 'skipped', '已有 end 的恢复任务必须收敛 delivery')
assert.ok(state.jobs['job-old'].endedAt)
for (const cleanup of cleanups) cleanup()
console.log(JSON.stringify({ status: after.turns[0].status, ends: ends.length }))
`)

let child = null
let stdout = ''
let stderr = ''
try {
  child = spawn(process.execPath, [childFile], {
    env: { ...process.env, USERPROFILE: home, HOME: home },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  child.stdout.on('data', (chunk) => (stdout += chunk))
  child.stderr.on('data', (chunk) => (stderr += chunk))
  const deadline = Date.now() + 5000
  while (!fs.existsSync(readyFile) && Date.now() < deadline) await sleep(20)
  assert.ok(fs.existsSync(readyFile), `子进程未就绪：${stderr}`)
  // 4 秒启动对账先确认进程仍活着，4.6 秒杀死，由 5 秒恢复锁路径检查已有 end。
  await sleep(4600)
  dummy.kill()
  await new Promise((resolve) => dummy.once('close', resolve))
  const code = await new Promise((resolve) => child.on('close', resolve))
  assert.equal(code, 0, `子进程失败：${stderr || stdout}`)
  const result = JSON.parse(stdout.trim().split('\n').at(-1))
  assert.equal(result.status, 'CANCELLED')
  assert.equal(result.ends, 1)
  console.log('recovered end-once ok')
} finally {
  if (dummy.pid && !dummy.killed) dummy.kill()
  if (child && child.exitCode === null) child.kill()
  fs.rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
}
