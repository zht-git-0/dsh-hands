// 路由级状态测试：node acp/test-dispatch-status-route.mjs
// 临时 USERPROFILE 下走真实 handler：A 完成时 B 仍 RUNNING；宿主重启后 pid 真死才 INTERRUPTED。
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const repoIndex = fileURLToPath(new URL('../index.js', import.meta.url))
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'hands-dispatch-status-'))
const childFile = path.join(root, 'child.mjs')
fs.writeFileSync(childFile, `
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
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
for (const cleanup of cleanups) cleanup()
assert.ok(handler)
async function call(url, body) {
  const req = new EventEmitter()
  req.url = url
  req.method = body === undefined ? 'GET' : 'POST'
  const res = { status: 0, body: '', headersSent: false, writableEnded: false,
    writeHead(status) { this.status = status; this.headersSent = true },
    end(value) { this.body = String(value ?? ''); this.writableEnded = true },
  }
  const pending = handler(req, res)
  if (body !== undefined) { req.emit('data', JSON.stringify(body)); req.emit('end') }
  await pending
  return { status: res.status, json: JSON.parse(res.body) }
}
const scenario = process.env.SCENARIO
const sessions = await call('/dsh-hands/sessions?hand=opencode')
assert.equal(sessions.status, 200)
const row = sessions.json.sessions.find((x) => x.sessionKey === 'opencode/shared')
assert.ok(row)
const turns = await call('/dsh-hands/turns?key=opencode/shared')
assert.equal(turns.status, 200)
const a = turns.json.turns.find((x) => x.id === 'A')
const b = turns.json.turns.find((x) => x.id === 'B')
assert.equal(a.status, 'OK')
const log = fs.readFileSync(path.join(process.env.USERPROFILE, '.dsh', 'hands-log.jsonl'), 'utf8')
if (scenario === 'alive') {
  assert.equal(row.status, 'RUNNING', '会话聚合行必须是 RUNNING')
  assert.equal(row.running, true)
  assert.equal(b.status, 'RUNNING', 'B 不能被 A 的完成事件标成 INTERRUPTED')
  assert.equal(b.running, true)
  assert.ok(!log.split('\\n').some((line) => { try { const r = JSON.parse(line); return r.id === 'B' && r.status === 'INTERRUPTED' } catch { return false } }), '活进程不应被补 INTERRUPTED')
  console.log(JSON.stringify({ scenario, rowStatus: row.status, bStatus: b.status }))
} else {
  assert.equal(row.status, 'INTERRUPTED', JSON.stringify({ row, turns: turns.json.turns, log }))
  assert.equal(b.status, 'INTERRUPTED', JSON.stringify({ row, turns: turns.json.turns, log }))
  assert.ok(log.split('\\n').some((line) => { try { const r = JSON.parse(line); return r.id === 'B' && r.status === 'INTERRUPTED' && r.interrupted === true } catch { return false } }), '真死任务必须由 reconcile 补标记')
  console.log(JSON.stringify({ scenario, rowStatus: row.status, bStatus: b.status }))
}
`)

function fixture(scenario) {
  const home = fs.mkdtempSync(path.join(root, `${scenario}-`))
  const dsh = path.join(home, '.dsh')
  fs.mkdirSync(dsh, { recursive: true })
  const start = (id, at) => ({
    v: 2, phase: 'start', id, hand: 'opencode', tool: 'opencode_run',
    session: 'shared', sessionKey: 'opencode/shared', conversationId: '',
    cwd: 'D:/work', prompt: id, startedAt: at, at,
  })
  const base = Date.now() - 20 * 60 * 1000
  const at = (offsetMs) => new Date(base + offsetMs).toISOString()
  const aStart = start('A', at(0))
  const aEnd = { ...aStart, v: 2, phase: 'end', at: at(5 * 60 * 1000), status: 'OK', ok: true, ms: 300000, excerpt: 'done' }
  const bStart = start('B', at(6 * 60 * 1000))
  fs.writeFileSync(path.join(dsh, 'hands-log.jsonl'), [aStart, aEnd, bStart].map((x) => JSON.stringify(x)).join('\n') + '\n')
  fs.writeFileSync(path.join(dsh, 'hands-async.json'), JSON.stringify({
    v: 1,
    jobs: {
      A: { id: 'A', hand: 'opencode', status: 'OK', startedAt: Date.parse(aStart.startedAt), endedAt: aEnd.at, delivery: 'sent' },
      B: { id: 'B', hand: 'opencode', status: 'RUNNING', startedAt: Date.parse(bStart.startedAt), pid: scenario === 'alive' ? process.pid : 99999999, delivery: 'pending' },
    },
  }))
  return home
}

async function run(scenario) {
  const home = fixture(scenario)
  const child = spawn(process.execPath, [childFile], {
    env: { ...process.env, USERPROFILE: home, HOME: home, SCENARIO: scenario },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  let stdout = ''
  let stderr = ''
  child.stdout.on('data', (d) => (stdout += d))
  child.stderr.on('data', (d) => (stderr += d))
  const code = await new Promise((resolve) => child.on('close', resolve))
  try {
    assert.equal(code, 0, `${scenario} 子进程失败：${stderr || stdout}`)
    const result = JSON.parse(stdout.trim().split('\n').at(-1))
    assert.equal(result.scenario, scenario)
    assert.equal(result.bStatus, scenario === 'alive' ? 'RUNNING' : 'INTERRUPTED')
    console.log(`${scenario}: row=${result.rowStatus}, B=${result.bStatus}`)
  } finally {
    fs.rmSync(home, { recursive: true, force: true })
  }
}

try {
  await run('alive')
  await run('dead')
} finally {
  fs.rmSync(root, { recursive: true, force: true })
}
console.log('dispatch status route ok')
