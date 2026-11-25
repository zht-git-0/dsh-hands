// 取消竞态回归：agy 无输出被杀也必须报 CANCELLED，不能落成 ERROR。
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { fileURLToPath, pathToFileURL } from 'node:url'

const repoIndex = fileURLToPath(new URL('../index.js', import.meta.url))
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'hands-cancel-race-'))
const home = path.join(root, 'home')
const work = path.join(root, 'work')
const startedFile = path.join(root, 'started')
const fakeScript = path.join(root, 'fake-agy.mjs')
const fakeBin = path.join(root, process.platform === 'win32' ? 'fake-agy.cmd' : 'fake-agy')
const childFile = path.join(root, 'child.mjs')
fs.mkdirSync(path.join(home, '.dsh'), { recursive: true })
fs.mkdirSync(work, { recursive: true })
fs.writeFileSync(fakeScript, `
import fs from 'node:fs'
fs.writeFileSync(${JSON.stringify(startedFile)}, String(process.pid))
setTimeout(() => {}, 30000)
`)
if (process.platform === 'win32') {
  fs.writeFileSync(fakeBin, `@echo off\r\nnode "${fakeScript}" %*\r\n`)
} else {
  fs.writeFileSync(fakeBin, `#!/bin/sh\nexec node "${fakeScript}" "$@"\n`, { mode: 0o755 })
}

fs.writeFileSync(childFile, `
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
const { apply } = await import(${JSON.stringify(pathToFileURL(repoIndex).href)})
const tools = new Map()
const delivered = []
let handler = null
const cleanups = []
const ctx = {
  tools: { register(def) { tools.set(def.name, def); return () => tools.delete(def.name) } },
  webServer: { register(options) { if (options?.path === '/dsh-hands') handler = options.handler; return () => {} } },
  effect(fn) { const cleanup = fn(); if (typeof cleanup === 'function') cleanups.push(cleanup); return cleanup },
  get: () => undefined,
  agent: {
    session: { id: 'session-caller', cwd: ${JSON.stringify(work)} },
    async followup(payload) { delivered.push(payload); return { ok: true } },
  },
}
apply(ctx, { agyBin: ${JSON.stringify(fakeBin)} })
const agy = tools.get('agy_run')
const result = await agy.execute({ prompt: '无输出取消', cwd: ${JSON.stringify(work)}, async: true }, ctx)
assert.equal(result.status, 'RUNNING')
const statePath = path.join(process.env.USERPROFILE, '.dsh', 'hands-async.json')
const readState = () => JSON.parse(fs.readFileSync(statePath, 'utf8'))
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
async function waitFor(fn, label) {
  for (let i = 0; i < 300; i += 1) {
    const value = fn()
    if (value) return value
    await sleep(20)
  }
  throw new Error('timeout: ' + label)
}
await waitFor(() => fs.existsSync(${JSON.stringify(startedFile)}), 'agy started')
await waitFor(() => readState().jobs[result.jobId]?.pid, 'agy pid')
const req = new EventEmitter()
req.url = '/dsh-hands/cancel'
req.method = 'POST'
const res = {
  status: 0, body: '', headersSent: false, writableEnded: false,
  writeHead(status) { this.status = status },
  end(value) { this.body = String(value ?? '') },
}
const pending = handler(req, res)
req.emit('data', JSON.stringify({ id: result.jobId }))
req.emit('end')
await pending
assert.equal(res.status, 200)
const cancelled = JSON.parse(res.body)
assert.equal(cancelled.ok, true)
assert.equal(cancelled.killed, true)
await waitFor(() => readState().jobs[result.jobId]?.endedAt, 'cancel settlement')
const record = readState().jobs[result.jobId]
assert.equal(record.status, 'CANCELLED')
assert.match(record.report, /状态 CANCELLED/)
assert.ok(!record.report.includes('错误：'), '取消不把残余输出写成错误: ' + record.report)
const log = fs.readFileSync(path.join(process.env.USERPROFILE, '.dsh', 'hands-log.jsonl'), 'utf8')
  .split(/\\r?\\n/).filter(Boolean).map(JSON.parse)
const ends = log.filter((row) => row.id === result.jobId && row.phase === 'end')
assert.equal(ends.length, 1)
assert.equal(ends[0].status, 'CANCELLED')
await waitFor(() => delivered.length === 1, 'cancel report')
for (const cleanup of cleanups) cleanup()
console.log(JSON.stringify({ status: record.status, killed: cancelled.killed }))
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
  assert.equal(result.status, 'CANCELLED')
  assert.equal(result.killed, true)
  console.log('cancel race outcome ok')
} finally {
  fs.rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
}
