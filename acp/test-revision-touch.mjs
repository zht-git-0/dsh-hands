// Step 1 revision 回归：归档/agy rename 后同一 SSE 连接立即收到 agents/sessions。
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { fileURLToPath, pathToFileURL } from 'node:url'

const repoIndex = fileURLToPath(new URL('../index.js', import.meta.url))
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'hands-revision-touch-'))
const home = path.join(root, 'home')
const dsh = path.join(home, '.dsh')
fs.mkdirSync(dsh, { recursive: true })
fs.writeFileSync(path.join(dsh, 'opencode-sessions.json'), JSON.stringify({ old: { id: 'sid_old', cwd: 'D:/work', updated: new Date().toISOString() } }))
fs.writeFileSync(path.join(dsh, 'agy-sessions.json'), JSON.stringify({ old: { id: 'sid_agy', cwd: 'D:/work', updated: new Date().toISOString() } }))
const childFile = path.join(root, 'child.mjs')
fs.writeFileSync(childFile, `
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { pathToFileURL } from 'node:url'
const { apply } = await import(${JSON.stringify(pathToFileURL(repoIndex).href)})
const tools = new Map()
let handler = null
const cleanups = []
const ctx = {
  tools: { register(def) { tools.set(def.name, def); return () => tools.delete(def.name) } },
  webServer: { register(options) { if (options?.path === '/dsh-hands') handler = options.handler; return () => {} } },
  effect(fn) { const cleanup = fn(); if (typeof cleanup === 'function') cleanups.push(cleanup); return cleanup },
  get: () => undefined,
}
apply(ctx, {})
function openStream(url) {
  const req = new EventEmitter()
  req.url = url
  req.method = 'GET'
  let output = ''
  const res = {
    destroyed: false, writableEnded: false, headersSent: false,
    writeHead() { this.headersSent = true },
    write(chunk) { output += String(chunk) },
    end() { this.writableEnded = true },
    on() {},
  }
  return { req, res, output: () => output }
}
async function call(url, body) {
  const req = new EventEmitter()
  req.url = url
  req.method = body === undefined ? 'GET' : 'POST'
  const res = { status: 0, body: '', headersSent: false, writableEnded: false,
    writeHead(status) { this.status = status }, end(value) { this.body = String(value ?? '') } }
  const pending = handler(req, res)
  if (body !== undefined) { req.emit('data', JSON.stringify(body)); req.emit('end') }
  await pending
  return { status: res.status, json: JSON.parse(res.body) }
}
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
async function until(fn, label) {
  for (let i = 0; i < 100; i += 1) { if (fn()) return; await sleep(20) }
  throw new Error('timeout: ' + label)
}
const opencode = openStream('/dsh-hands/stream?hand=opencode&key=opencode%2Fsid%3Asid_old')
await handler(opencode.req, opencode.res)
assert.match(opencode.output(), /event: agents/)
await call('/dsh-hands/archive-session', { key: 'opencode/sid:sid_old', hand: 'opencode', archived: true })
await until(() => {
  const events = opencode.output().split('event: agents').slice(1)
  return events.some((event) => /"sessions":0/.test(event))
}, 'archive agents revision')
opencode.req.emit('close')

const agy = openStream('/dsh-hands/stream?hand=agy&key=agy%2Fold')
await handler(agy.req, agy.res)
await tools.get('agy_session').execute({ action: 'rename', session: 'old', newLabel: 'new', conversationId: 'sid_agy' })
await until(() => agy.output().includes('"name":"new"'), 'agy rename sessions revision')
agy.req.emit('close')
for (const cleanup of cleanups) cleanup()
console.log('revision touch ok')
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
  assert.match(stdout, /revision touch ok/)
  console.log('revision touch regression ok')
} finally {
  fs.rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
}
