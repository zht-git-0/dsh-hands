// CLI live 回调回归：run.push 被解绑传给 onChunk，也必须更新 entry/output/blocks。
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { fileURLToPath, pathToFileURL } from 'node:url'

const repoIndex = fileURLToPath(new URL('../index.js', import.meta.url))
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'hands-live-cli-'))
const home = path.join(root, 'home')
const work = path.join(root, 'work')
const control = path.join(root, 'control')
const started = path.join(control, 'started')
const release = path.join(control, 'release')
const resultFile = path.join(control, 'result.json')
const fakeScript = path.join(root, 'fake.mjs')
const fakeBin = path.join(root, process.platform === 'win32' ? 'fake.cmd' : 'fake')
const childFile = path.join(root, 'child.mjs')
fs.mkdirSync(path.join(home, '.dsh'), { recursive: true })
fs.mkdirSync(work, { recursive: true })
fs.mkdirSync(control, { recursive: true })
fs.writeFileSync(fakeScript, `
import fs from 'node:fs'
console.log(JSON.stringify({ type: 'text', sessionID: 'sid_live', part: { text: 'LIVE-FIRST' } }))
fs.writeFileSync(${JSON.stringify(started)}, 'go')
while (!fs.existsSync(${JSON.stringify(release)})) await new Promise((resolve) => setTimeout(resolve, 20))
console.log(JSON.stringify({ type: 'text', sessionID: 'sid_live', part: { text: 'LIVE-SECOND' } }))
`)
if (process.platform === 'win32') fs.writeFileSync(fakeBin, `@echo off\r\nnode "${fakeScript}" %*\r\n`)
else fs.writeFileSync(fakeBin, `#!/bin/sh\nexec node "${fakeScript}" "$@"\n`, { mode: 0o755 })

fs.writeFileSync(childFile, `
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
const { apply } = await import(${JSON.stringify(pathToFileURL(repoIndex).href)})
const tools = new Map()
const cleanups = []
let handler = null
const ctx = {
  tools: { register(def) { tools.set(def.name, def); return () => tools.delete(def.name) } },
  webServer: { register(options) { if (options.path === '/dsh-hands') handler = options.handler; return () => {} } },
  effect(fn) { const cleanup = fn(); if (typeof cleanup === 'function') cleanups.push(cleanup); return cleanup },
  get: () => undefined,
  agent: { session: { id: 'caller', cwd: ${JSON.stringify(work)} }, async followup() { return { ok: true } } },
}
apply(ctx, { opencodeBin: ${JSON.stringify(fakeBin)} })
async function call(url) {
  const req = { url, method: 'GET', on() {} }
  const res = { status: 0, body: '', headersSent: false, writableEnded: false, writeHead(status) { this.status = status }, end(value) { this.body = String(value ?? '') } }
  await handler(req, res)
  return JSON.parse(res.body)
}
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
async function waitFor(fn, label) { for (let i = 0; i < 300; i++) { if (fn()) return; await sleep(20) } throw new Error('timeout: ' + label) }
const statePath = path.join(process.env.USERPROFILE, '.dsh', 'hands-async.json')
const readState = () => JSON.parse(fs.readFileSync(statePath, 'utf8'))
const job = await tools.get('hands_run').execute({ to: 'opencode', prompt: 'live', cwd: ${JSON.stringify(work)}, async: true }, ctx)
await waitFor(() => fs.existsSync(${JSON.stringify(started)}), 'fake cli started')
await sleep(150)
const running = (await call('/dsh-hands/log')).running.find((row) => row.id === job.jobId)
fs.writeFileSync(${JSON.stringify(release)}, 'go')
await waitFor(() => readState().jobs[job.jobId]?.endedAt, 'cli settled')
const rows = fs.readFileSync(path.join(process.env.USERPROFILE, '.dsh', 'hands-log.jsonl'), 'utf8').split(/\\r?\\n/).filter(Boolean).map(JSON.parse)
const end = rows.find((row) => row.id === job.jobId && row.phase === 'end')
for (const cleanup of cleanups) cleanup()
fs.writeFileSync(${JSON.stringify(resultFile)}, JSON.stringify({ running, end }))
`)

const child = spawn(process.execPath, [childFile], { env: { ...process.env, USERPROFILE: home, HOME: home }, stdio: ['ignore', 'pipe', 'pipe'] })
let stdout = ''
let stderr = ''
child.stdout.on('data', (chunk) => (stdout += chunk))
child.stderr.on('data', (chunk) => (stderr += chunk))
try {
  const code = await new Promise((resolve) => child.on('close', resolve))
  assert.equal(code, 0, `child failed: ${stderr || stdout}`)
  const { running, end } = JSON.parse(fs.readFileSync(resultFile, 'utf8'))
  assert.match(running.output, /LIVE-FIRST/)
  assert.ok(running.outputLength > 0)
  assert.ok(Array.isArray(running.blocks) && running.blocks.length > 0)
  assert.match(end.excerpt, /LIVE-SECOND/)
  assert.ok(end.outputLength > 0)
  assert.ok(Array.isArray(end.blocks) && end.blocks.length > 0)
  console.log('CLI live dispatch ok')
} finally {
  if (child.exitCode === null) child.kill()
  fs.rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
}
