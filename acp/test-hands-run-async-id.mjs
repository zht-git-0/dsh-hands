// hands_run 异步身份测试：临时 USERPROFILE + 假 opencode 进程，不调用模型。
// 断言返回 jobId === 日志 start.id === asyncState key，且 PID 落到同一记录。
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { fileURLToPath, pathToFileURL } from 'node:url'

const repoIndex = fileURLToPath(new URL('../index.js', import.meta.url))
const tempBase = path.join(os.tmpdir(), 'opencode')
fs.mkdirSync(tempBase, { recursive: true })
const root = fs.mkdtempSync(path.join(tempBase, 'hands-async-id-'))
const home = path.join(root, 'home')
const work = path.join(root, 'work')
const fakeScript = path.join(root, 'fake-opencode.mjs')
const fakeBin = path.join(root, process.platform === 'win32' ? 'fake-opencode.cmd' : 'fake-opencode')
const childFile = path.join(root, 'child.mjs')
fs.mkdirSync(path.join(home, '.dsh'), { recursive: true })
fs.mkdirSync(work, { recursive: true })

fs.writeFileSync(fakeScript, `setTimeout(() => console.log(JSON.stringify({ type: 'text', sessionID: 'ses_fake1234567890', part: { text: 'ok' } })), 700)\n`)
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
const ctx = {
  tools: { register(def) { tools.set(def.name, def); return () => tools.delete(def.name) } },
  webServer: { register: () => () => {} },
  effect(fn) { const cleanup = fn(); if (typeof cleanup === 'function') cleanups.push(cleanup); return cleanup },
  get: () => undefined,
  agent: {
    session: { id: 'session-caller', cwd: ${JSON.stringify(work)} },
    async followup(payload) { delivered.push(payload); return { ok: true } },
  },
}
apply(ctx, { opencodeBin: ${JSON.stringify(fakeBin)}, maxAsync: 1 })
const handsRun = tools.get('hands_run')
assert.ok(handsRun)
const result = await handsRun.execute({
  to: 'opencode',
  prompt: '身份测试',
  session: '身份测试会话',
  cwd: ${JSON.stringify(work)},
  write: true,
  async: true,
}, ctx)
assert.ok(result.jobId)
const dsh = path.join(process.env.USERPROFILE, '.dsh')
const logFile = path.join(dsh, 'hands-log.jsonl')
const statePath = path.join(dsh, 'hands-async.json')
const readLog = () => fs.readFileSync(logFile, 'utf8').trim().split(/\\r?\\n/).filter(Boolean).map(JSON.parse)
const readState = () => JSON.parse(fs.readFileSync(statePath, 'utf8'))
let starts = []
for (let i = 0; i < 100 && starts.length === 0; i += 1) {
  if (fs.existsSync(logFile)) starts = readLog().filter((row) => row.phase === 'start')
  if (starts.length) break
  await new Promise((resolve) => setTimeout(resolve, 20))
}
assert.equal(starts.length, 1)
assert.equal(starts[0].id, result.jobId, '返回 jobId 必须等于日志派发 id')
let record = null
for (let i = 0; i < 100; i += 1) {
  record = readState().jobs[result.jobId]
  if (record?.pid || record?.endedAt) break
  await new Promise((resolve) => setTimeout(resolve, 20))
}
assert.ok(record, 'asyncState 必须用同一个 jobId')
assert.equal(record.dispatchId, result.jobId)
assert.equal(record.session, '身份测试会话')
assert.equal(record.cwd, ${JSON.stringify(work)})
assert.equal(record.sessionId, 'session-caller', '调用方 id 与手下 sid 分开存')
assert.ok(Number(record.pid) > 0, '进程启动后 PID 必须落到同一条 async 记录')
for (let i = 0; i < 200 && !record.endedAt; i += 1) {
  await new Promise((resolve) => setTimeout(resolve, 20))
  record = readState().jobs[result.jobId]
}
assert.ok(record.endedAt, '假进程必须正常收尾')
assert.equal(record.conversationId, 'ses_fake1234567890')
const finalLog = readLog()
assert.equal(finalLog.filter((row) => row.phase === 'end' && row.id === result.jobId).length, 1)
assert.equal(delivered.length, 1, '只回传一次')
for (const cleanup of cleanups) cleanup()
console.log(JSON.stringify({ jobId: result.jobId, pid: record.pid }))
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
try {
  assert.equal(code, 0, `子进程失败：${stderr || stdout}`)
  const result = JSON.parse(stdout.trim().split('\n').at(-1))
  assert.ok(result.jobId)
  assert.ok(Number(result.pid) > 0)
  console.log('hands_run async identity ok')
} finally {
  fs.rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
}
