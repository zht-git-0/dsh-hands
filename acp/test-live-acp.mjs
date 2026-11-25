// ACP live 回调回归：session/update 必须更新 entry，不能因 run 未定义打崩宿主。
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawn, spawnSync } from 'node:child_process'
import { fileURLToPath, pathToFileURL } from 'node:url'

const repoIndex = fileURLToPath(new URL('../index.js', import.meta.url))
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'hands-live-acp-'))
const home = path.join(root, 'home')
const work = path.join(root, 'work')
const control = path.join(root, 'control')
const binDir = path.join(root, 'bin')
const fakeScript = path.join(root, 'fake-acp.mjs')
const fakeBin = path.join(binDir, process.platform === 'win32' ? 'codex-acp.cmd' : 'codex-acp')
const childFile = path.join(root, 'child.mjs')
const pidFile = path.join(control, 'pid')
const promptFile = path.join(control, 'prompt')
const release = path.join(control, 'release')
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
  if (msg.method === 'session/new') return send({ jsonrpc: '2.0', id: msg.id, result: { sessionId: 'sid_live_acp', models: { currentModelId: 'fake-model' } } })
  if (msg.method === 'session/prompt') {
    send({ jsonrpc: '2.0', method: 'session/update', params: { sessionId: 'sid_live_acp', update: { sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: 'ACP-LIVE' } } } })
    fs.writeFileSync(${JSON.stringify(promptFile)}, 'seen')
    const timer = setInterval(() => {
      if (!fs.existsSync(${JSON.stringify(release)})) return
      clearInterval(timer)
      send({ jsonrpc: '2.0', id: msg.id, result: { stopReason: 'end_turn' } })
      setTimeout(() => process.exit(0), 50)
    }, 20)
    return
  }
  send({ jsonrpc: '2.0', id: msg.id, result: {} })
})
setInterval(() => {}, 1000)
`)
if (process.platform === 'win32') fs.writeFileSync(fakeBin, `@echo off\r\nnode "${fakeScript}" %*\r\n`)
else fs.writeFileSync(fakeBin, `#!/bin/sh\nexec node "${fakeScript}" "$@"\n`, { mode: 0o755 })

fs.writeFileSync(childFile, `
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
apply(ctx, { acpHands: ['codex'] })
async function call(url) {
  const req = { url, method: 'GET', on() {} }
  const res = { status: 0, body: '', headersSent: false, writableEnded: false, writeHead(status) { this.status = status }, end(value) { this.body = String(value ?? '') } }
  await handler(req, res)
  return JSON.parse(res.body)
}
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
async function waitFor(fn, label) { for (let i = 0; i < 300; i++) { if (fn()) return; await sleep(20) } throw new Error('timeout: ' + label) }
const job = await tools.get('hands_run').execute({ to: 'codex', prompt: 'live', cwd: ${JSON.stringify(work)}, async: true }, ctx)
await waitFor(() => fs.existsSync(${JSON.stringify(promptFile)}), 'acp prompt')
await sleep(150)
const running = (await call('/dsh-hands/log')).running.find((row) => row.id === job.jobId)
fs.writeFileSync(${JSON.stringify(release)}, 'go')
await waitFor(() => JSON.parse(fs.readFileSync(path.join(process.env.USERPROFILE, '.dsh', 'hands-async.json'), 'utf8')).jobs[job.jobId]?.endedAt, 'acp settled')
for (const cleanup of cleanups) cleanup()
fs.writeFileSync(${JSON.stringify(resultFile)}, JSON.stringify({ running }))
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
  const { running } = JSON.parse(fs.readFileSync(resultFile, 'utf8'))
  assert.match(running.output, /ACP-LIVE/)
  assert.ok(running.outputLength > 0)
  assert.ok(Array.isArray(running.blocks) && running.blocks.length > 0)
  console.log('ACP live dispatch ok')
} finally {
  fs.writeFileSync(release, 'go')
  if (fs.existsSync(pidFile)) {
    const pid = Number(fs.readFileSync(pidFile, 'utf8'))
    if (Number.isInteger(pid) && pid > 0) {
      if (process.platform === 'win32') spawnSync('taskkill', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true })
      else { try { process.kill(pid, 'SIGKILL') } catch {} }
    }
  }
  if (child.exitCode === null) child.kill()
  fs.rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
}
