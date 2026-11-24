// 会话级串行化端到端测试：临时 USERPROFILE + 假 opencode，不调用模型。
// A 在跑 → B/C/D 排队 → 第 4 个驳回 → 取消 A → B 自动接棒；另一会话并行。
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { fileURLToPath, pathToFileURL } from 'node:url'

const repoIndex = fileURLToPath(new URL('../index.js', import.meta.url))
const tempBase = path.join(os.tmpdir(), 'opencode')
fs.mkdirSync(tempBase, { recursive: true })
const root = fs.mkdtempSync(path.join(tempBase, 'hands-session-queue-'))
const home = path.join(root, 'home')
const work = path.join(root, 'work')
const control = path.join(root, 'control')
const fakeScript = path.join(root, 'fake-opencode.mjs')
const fakeBin = path.join(root, process.platform === 'win32' ? 'fake-opencode.cmd' : 'fake-opencode')
const childFile = path.join(root, 'child.mjs')
fs.mkdirSync(path.join(home, '.dsh'), { recursive: true })
fs.mkdirSync(work, { recursive: true })
fs.mkdirSync(control, { recursive: true })
fs.writeFileSync(path.join(home, '.dsh', 'opencode-sessions.json'), JSON.stringify({
  same: { id: 'ses_same', cwd: work },
  other: { id: 'ses_other', cwd: work },
}))
fs.writeFileSync(fakeScript, `
import fs from 'node:fs'
import path from 'node:path'
const control = ${JSON.stringify(control)}
const prompt = process.argv.at(-1)
fs.writeFileSync(path.join(control, prompt + '.started'), String(process.pid))
const deadline = Date.now() + 15000
while (!fs.existsSync(path.join(control, prompt + '.release'))) {
  if (Date.now() > deadline) process.exit(2)
  await new Promise((resolve) => setTimeout(resolve, 20))
}
console.log(JSON.stringify({ type: 'text', sessionID: 'ses_' + prompt, part: { text: 'done ' + prompt } }))
`)
if (process.platform === 'win32') {
  fs.writeFileSync(fakeBin, `@echo off\r\nnode "${fakeScript}" %*\r\n`)
} else {
  fs.writeFileSync(fakeBin, `#!/bin/sh\nexec node "${fakeScript}" "$@"\n`, { mode: 0o755 })
}
fs.writeFileSync(childFile, `
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
const { apply } = await import(${JSON.stringify(pathToFileURL(repoIndex).href)})
const tools = new Map()
const cleanups = []
const delivered = []
let handler = null
const ctx = {
  tools: { register(def) { tools.set(def.name, def); return () => tools.delete(def.name) } },
  webServer: { register(options) { if (options?.path === '/dsh-hands' && options.handler) handler = options.handler; return () => {} } },
  effect(fn) { const cleanup = fn(); if (typeof cleanup === 'function') cleanups.push(cleanup); return cleanup },
  get: () => undefined,
  agent: {
    session: { id: 'session-caller', cwd: ${JSON.stringify(work)} },
    async followup(payload) { delivered.push(payload); return { ok: true } },
  },
}
apply(ctx, { opencodeBin: ${JSON.stringify(fakeBin)}, maxAsync: 4, maxSessionQueue: 3 })
const handsRun = tools.get('hands_run')
assert.ok(handsRun)
const control = ${JSON.stringify(control)}
const statePath = path.join(process.env.USERPROFILE, '.dsh', 'hands-async.json')
const readState = () => JSON.parse(fs.readFileSync(statePath, 'utf8'))
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
async function waitFor(fn, label, timeout = 5000) {
  const end = Date.now() + timeout
  while (Date.now() < end) {
    const value = fn()
    if (value) return value
    await sleep(20)
  }
  throw new Error('timeout: ' + label)
}
async function callRoute(url, body) {
  const req = {
    url,
    method: body === undefined ? 'GET' : 'POST',
    on(event, fn) {
      if (event === 'data' && body !== undefined) queueMicrotask(() => fn(JSON.stringify(body)))
      if (event === 'end') queueMicrotask(() => fn())
    },
  }
  const res = {
    status: 0,
    body: '',
    writeHead(status) { this.status = status },
    end(value) { this.body = String(value ?? '') },
  }
  await handler(req, res)
  return { status: res.status, json: JSON.parse(res.body) }
}
const run = (prompt, session = 'same') => handsRun.execute({
  to: 'opencode', prompt, session, cwd: ${JSON.stringify(work)}, write: true, async: true,
}, ctx)

const a = await run('A')
assert.equal(a.status, 'RUNNING')
assert.equal(a.queuePosition, 0)
await waitFor(() => fs.existsSync(path.join(control, 'A.started')), 'A process')
await waitFor(() => readState().jobs[a.jobId]?.pid, 'A pid')

const b = await run('B')
const c = await tools.get('opencode_run').execute({
  prompt: 'C', session: 'same', cwd: ${JSON.stringify(work)}, auto: true, async: true,
}, ctx)
const d = await run('D')
assert.deepEqual([b.status, c.status, d.status], ['QUEUED', 'QUEUED', 'QUEUED'])
assert.deepEqual([b.queuePosition, c.queuePosition, d.queuePosition], [1, 2, 3])
assert.match(b.note, /已排队，前面还有 1 个/)
assert.equal(fs.existsSync(path.join(control, 'B.started')), false, 'B 不能提前起进程')

await assert.rejects(() => run('E'), /该会话已有任务在跑，且排队已满.*上限 3/)
const other = await run('X', 'other')
assert.equal(other.status, 'RUNNING', '不同会话互不影响')
await waitFor(() => fs.existsSync(path.join(control, 'X.started')), 'other session process')

const log = await callRoute('/dsh-hands/log')
assert.equal(log.json.queued.length, 3)
assert.equal(log.json.running.length, 2)
for (const [id, position] of [[b.jobId, 1], [c.jobId, 2], [d.jobId, 3]]) {
  const queued = log.json.queued.find((job) => job.id === id)
  assert.equal(queued.status, 'QUEUED')
  assert.equal(queued.running, false)
  assert.equal(queued.queuePosition, position)
  assert.equal(log.json.entries.find((job) => job.id === id)?.status, 'QUEUED', '历史也显示 QUEUED')
}
const asyncApi = await callRoute('/dsh-hands/async?n=20')
for (const [id, position] of [[b.jobId, 1], [c.jobId, 2], [d.jobId, 3]]) {
  const job = asyncApi.json.live.find((item) => item.id === id)
  assert.equal(job.status, 'QUEUED')
  assert.equal(job.queuePosition, position)
  assert.equal(job.queueLimit, 3)
}

const cancelled = await callRoute('/dsh-hands/cancel', { id: a.jobId })
assert.equal(cancelled.status, 200)
assert.equal(cancelled.json.ok, true)
assert.ok(cancelled.json.cancelled === 'queued' || cancelled.json.killed === true, '运行中的 A 走杀进程，排队任务走摘下')
await waitFor(() => fs.existsSync(path.join(control, 'B.started')), 'B starts after A cancel')
await waitFor(() => readState().jobs[a.jobId]?.endedAt, 'A cancelled settlement')
assert.equal(readState().jobs[a.jobId].status, 'CANCELLED')
assert.equal(readState().jobs[b.jobId].status, 'RUNNING')
assert.equal(readState().jobs[c.jobId].queuePosition, 1)
assert.equal(readState().jobs[d.jobId].queuePosition, 2)

fs.writeFileSync(path.join(control, 'B.release'), 'go')
await waitFor(() => fs.existsSync(path.join(control, 'C.started')), 'C starts after B')
fs.writeFileSync(path.join(control, 'C.release'), 'go')
await waitFor(() => fs.existsSync(path.join(control, 'D.started')), 'D starts after C')
fs.writeFileSync(path.join(control, 'D.release'), 'go')
fs.writeFileSync(path.join(control, 'X.release'), 'go')
await waitFor(() => [b.jobId, c.jobId, d.jobId, other.jobId].every((id) => readState().jobs[id]?.endedAt), 'all jobs settle')
for (const id of [b.jobId, c.jobId, d.jobId, other.jobId]) assert.equal(readState().jobs[id].status, 'OK')
assert.equal(Object.keys(readState().jobs).length, 5, '被驳回的 E 不留幽灵 job')
assert.equal(delivered.length, 5, '每个被接受的 job 只回传一次')
for (const cleanup of cleanups) cleanup()
console.log(JSON.stringify({ a: a.jobId, b: b.jobId, c: c.jobId, d: d.jobId, other: other.jobId }))
`)

const child = spawn(process.execPath, [childFile], {
  env: { ...process.env, USERPROFILE: home, HOME: home },
  stdio: ['ignore', 'pipe', 'pipe'],
})
let stdout = ''
let stderr = ''
child.stdout.on('data', (chunk) => (stdout += chunk))
child.stderr.on('data', (chunk) => (stderr += chunk))
const code = await new Promise((resolve) => child.on('close', resolve))
let failure = null
try {
  assert.equal(code, 0, `子进程失败：${stderr || stdout}`)
  const result = JSON.parse(stdout.trim().split('\n').at(-1))
  assert.ok(result.a && result.b && result.c && result.d && result.other)
  console.log('session queue integration ok')
} catch (error) {
  failure = error
}
try {
  fs.rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
} catch (error) {
  if (!failure) throw error
  console.error(`cleanup warning: ${error.message}`)
}
if (failure) throw failure
