// start-only 恢复空窗：进程已死但 4s 补 end 尚未执行时，/turns 必须保留 ORPHAN 占位。
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { fileURLToPath, pathToFileURL } from 'node:url'

const repoIndex = fileURLToPath(new URL('../index.js', import.meta.url))
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'hands-recovery-visibility-'))
const home = path.join(root, 'home')
const dsh = path.join(home, '.dsh')
const readyFile = path.join(root, 'ready')
const resultFile = path.join(root, 'result.json')
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
  v: 2, phase: 'start', id: 'run-window', hand: 'opencode', tool: 'hands_run',
  prompt: '恢复空窗', session: 'old', sessionKey: 'opencode/old', conversationId: 'sid_window',
  cwd: 'D:/work', startedAt, at: startedAt,
}
fs.writeFileSync(path.join(dsh, 'hands-log.jsonl'), JSON.stringify(start) + '\n')
fs.writeFileSync(path.join(dsh, 'hands-async.json'), JSON.stringify({
  v: 1,
  jobs: {
    'job-window': {
      id: 'job-window', dispatchId: 'run-window', hand: 'opencode', tool: 'hands_run',
      session: 'old', sessionKey: 'opencode/old', conversationId: 'sid_window', cwd: 'D:/work',
      startedAt: Date.parse(startedAt) + 6, status: 'RUNNING', pid: dummy.pid, delivery: 'pending',
    },
  },
}))

fs.writeFileSync(childFile, `
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
const { apply } = await import(${JSON.stringify(pathToFileURL(repoIndex).href)})
let handler = null
const cleanups = []
const ctx = {
  tools: { register: () => () => {} },
  webServer: { register(options) { if (options.path === '/dsh-hands') handler = options.handler; return () => {} } },
  effect(fn) { const cleanup = fn(); if (typeof cleanup === 'function') cleanups.push(cleanup); return cleanup },
  get: () => undefined,
}
apply(ctx, {})
async function call(url) {
  const req = { url, method: 'GET', on() {} }
  const res = { status: 0, body: '', headersSent: false, writableEnded: false, writeHead(status) { this.status = status }, end(value) { this.body = String(value ?? '') } }
  await handler(req, res)
  return JSON.parse(res.body)
}
const key = encodeURIComponent('opencode/sid:sid_window')
const before = await call('/dsh-hands/turns?key=' + key)
fs.writeFileSync(${JSON.stringify(readyFile)}, 'ready')
await new Promise((resolve) => setTimeout(resolve, 2500))
const during = await call('/dsh-hands/turns?key=' + key)
const rows = fs.readFileSync(path.join(process.env.USERPROFILE, '.dsh', 'hands-log.jsonl'), 'utf8').split(/\\r?\\n/).filter(Boolean).map(JSON.parse)
const endCount = rows.filter((row) => row.id === 'run-window' && row.phase === 'end').length
for (const cleanup of cleanups) cleanup()
fs.writeFileSync(${JSON.stringify(resultFile)}, JSON.stringify({ before: before.turns, during: during.turns, endCount }))
`)

let child = null
let stdout = ''
let stderr = ''
try {
  child = spawn(process.execPath, [childFile], { env: { ...process.env, USERPROFILE: home, HOME: home }, stdio: ['ignore', 'pipe', 'pipe'] })
  child.stdout.on('data', (chunk) => (stdout += chunk))
  child.stderr.on('data', (chunk) => (stderr += chunk))
  const deadline = Date.now() + 5000
  while (!fs.existsSync(readyFile) && Date.now() < deadline) await sleep(20)
  assert.ok(fs.existsSync(readyFile), `child not ready: ${stderr}`)
  await sleep(1000)
  dummy.kill()
  await new Promise((resolve) => dummy.once('close', resolve))
  const code = await new Promise((resolve) => child.on('close', resolve))
  assert.equal(code, 0, `child failed: ${stderr || stdout}`)
  const result = JSON.parse(fs.readFileSync(resultFile, 'utf8'))
  assert.equal(result.before[0].status, 'RUNNING')
  assert.equal(result.endCount, 0, '测试必须落在补 end 之前')
  assert.equal(result.during.length, 1, '死进程等待补 end 时轮次不得蒸发')
  assert.equal(result.during[0].id, 'run-window')
  assert.equal(result.during[0].status, 'ORPHAN')
  assert.equal(result.during[0].running, false)
  console.log('recovery visibility placeholder ok')
} finally {
  if (dummy.pid && !dummy.killed) dummy.kill()
  if (child && child.exitCode === null) child.kill()
  fs.rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
}
