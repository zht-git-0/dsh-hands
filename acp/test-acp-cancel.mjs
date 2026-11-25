// ACP cancel 回归：假 ACP 子进程必须被登记、取消时杀掉，并落盘 pid/一致终态。
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawn, spawnSync } from 'node:child_process'
import { fileURLToPath, pathToFileURL } from 'node:url'

const repoIndex = fileURLToPath(new URL('../index.js', import.meta.url))
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'hands-acp-cancel-'))
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function runCase(acpPersist) {
  const caseRoot = path.join(root, acpPersist ? 'persist' : 'once')
  const home = path.join(caseRoot, 'home')
  const work = path.join(caseRoot, 'work')
  const control = path.join(caseRoot, 'control')
  const binDir = path.join(caseRoot, 'bin')
  const fakeScript = path.join(caseRoot, 'fake-acp.mjs')
  const fakeBin = path.join(binDir, process.platform === 'win32' ? 'codex-acp.cmd' : 'codex-acp')
  const childFile = path.join(caseRoot, 'child.mjs')
  const pidFile = path.join(control, 'pid')
  const promptFile = path.join(control, 'prompt')
  const resultFile = path.join(control, 'result.json')
  fs.mkdirSync(path.join(home, '.dsh'), { recursive: true })
  fs.mkdirSync(work, { recursive: true })
  fs.mkdirSync(control, { recursive: true })
  fs.mkdirSync(binDir, { recursive: true })
  fs.writeFileSync(fakeScript, `
import fs from 'node:fs'
import readline from 'node:readline'
fs.writeFileSync(${JSON.stringify(pidFile)}, String(process.pid))
const send = (value) => process.stdout.write(JSON.stringify(value) + '\\n')
const rl = readline.createInterface({ input: process.stdin })
rl.on('line', (line) => {
  let msg
  try { msg = JSON.parse(line) } catch { return }
  if (msg.id === undefined) return
  if (msg.method === 'initialize') return send({ jsonrpc: '2.0', id: msg.id, result: { protocolVersion: 1, agentCapabilities: { loadSession: false }, agentInfo: { name: 'fake', version: '1' } } })
  if (msg.method === 'session/new') return send({ jsonrpc: '2.0', id: msg.id, result: { sessionId: 'sid_cancel_acp', models: { currentModelId: 'fake-model' } } })
  if (msg.method === 'session/prompt') {
    send({ jsonrpc: '2.0', method: 'session/update', params: { sessionId: 'sid_cancel_acp', update: { sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: 'ACP-BEFORE-CANCEL' } } } })
    fs.writeFileSync(${JSON.stringify(promptFile)}, 'seen')
    return
  }
  send({ jsonrpc: '2.0', id: msg.id, result: {} })
})
setInterval(() => {}, 1000)
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
apply(ctx, { acpHands: ['codex'], acpPersist: ${JSON.stringify(acpPersist)} })
async function call(url, body) {
  const req = { url, method: body === undefined ? 'GET' : 'POST', on(event, fn) {
    if (event === 'data' && body !== undefined) queueMicrotask(() => fn(JSON.stringify(body)))
    if (event === 'end') queueMicrotask(() => fn())
  } }
  const res = { status: 0, body: '', headersSent: false, writableEnded: false, writeHead(status) { this.status = status }, end(value) { this.body = String(value ?? '') } }
  await handler(req, res)
  return { status: res.status, json: JSON.parse(res.body) }
}
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
async function waitFor(fn, label) { for (let i = 0; i < 300; i++) { if (fn()) return; await sleep(20) } throw new Error('timeout: ' + label) }
const statePath = path.join(process.env.USERPROFILE, '.dsh', 'hands-async.json')
const readState = () => JSON.parse(fs.readFileSync(statePath, 'utf8'))
const job = await tools.get('hands_run').execute({ to: 'codex', prompt: 'cancel', cwd: ${JSON.stringify(work)}, async: true }, ctx)
await waitFor(() => fs.existsSync(${JSON.stringify(promptFile)}), 'acp prompt')
await sleep(150)
const pid = Number(fs.readFileSync(${JSON.stringify(pidFile)}, 'utf8'))
const before = readState().jobs[job.jobId]
const cancelled = await call('/dsh-hands/cancel', { id: job.jobId })
assert.equal(cancelled.status, 200, JSON.stringify(cancelled))
await waitFor(() => readState().jobs[job.jobId]?.endedAt, 'cancel settlement')
const rows = fs.readFileSync(path.join(process.env.USERPROFILE, '.dsh', 'hands-log.jsonl'), 'utf8').split(/\\r?\\n/).filter(Boolean).map(JSON.parse)
const end = rows.find((row) => row.id === job.jobId && row.phase === 'end')
for (const cleanup of cleanups) cleanup()
fs.writeFileSync(${JSON.stringify(resultFile)}, JSON.stringify({
  pid,
  persistedPidBeforeCancel: before.pid ?? null,
  cancel: cancelled,
  asyncStatus: readState().jobs[job.jobId]?.status,
  logStatus: end?.status,
  endCount: rows.filter((row) => row.id === job.jobId && row.phase === 'end').length,
}))
`)

  const child = spawn(process.execPath, [childFile], {
    env: { ...process.env, USERPROFILE: home, HOME: home, PATH: `${binDir}${path.delimiter}${process.env.PATH || ''}` },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  let stdout = ''
  let stderr = ''
  child.stdout.on('data', (chunk) => (stdout += chunk))
  child.stderr.on('data', (chunk) => (stderr += chunk))
  try {
    const code = await new Promise((resolve) => child.on('close', resolve))
    assert.equal(code, 0, `child failed: ${stderr || stdout}`)
    const result = JSON.parse(fs.readFileSync(resultFile, 'utf8'))
    assert.equal(result.cancel.status, 200, JSON.stringify(result.cancel))
    assert.equal(result.cancel.json.killed, true)
    assert.equal(result.cancel.json.treeKilled, true)
    assert.ok(Number.isInteger(result.persistedPidBeforeCancel) && result.persistedPidBeforeCancel > 0)
    assert.equal(result.cancel.json.pid, result.persistedPidBeforeCancel)
    assert.equal(result.asyncStatus, 'CANCELLED')
    assert.equal(result.logStatus, 'CANCELLED')
    assert.equal(result.endCount, 1)
    let alive = true
    for (let i = 0; i < 100; i += 1) {
      try { process.kill(result.pid, 0); alive = true } catch { alive = false; break }
      await sleep(20)
    }
    assert.equal(alive, false, 'ACP 子进程取消后仍存活')
    console.log(`ACP cancel ${acpPersist ? 'persist' : 'once'} ok`)
  } finally {
    if (fs.existsSync(pidFile)) {
      const pid = Number(fs.readFileSync(pidFile, 'utf8'))
      if (Number.isInteger(pid) && pid > 0) {
        if (process.platform === 'win32') spawnSync('taskkill', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true })
        else { try { process.kill(pid, 'SIGKILL') } catch {} }
      }
    }
    if (child.exitCode === null) child.kill()
  }
}

try {
  await runCase(false)
  await runCase(true)
  console.log('ACP cancel runtime ok')
} finally {
  fs.rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
}
