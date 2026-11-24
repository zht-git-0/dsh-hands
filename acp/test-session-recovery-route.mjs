// 路由级会话恢复测试：临时 USERPROFILE，不碰正在跑的 DSH。
// 覆盖缺 name/cwd 按目标 sid 回填、旧 UUID 合回真实派发、未知 sid 兜底。
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { fileURLToPath, pathToFileURL } from 'node:url'

const repoIndex = fileURLToPath(new URL('../index.js', import.meta.url))
const tempBase = path.join(os.tmpdir(), 'opencode')
fs.mkdirSync(tempBase, { recursive: true })
const root = fs.mkdtempSync(path.join(tempBase, 'hands-session-recovery-'))
const childFile = path.join(root, 'child.mjs')

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
for (const cleanup of cleanups) cleanup()
assert.ok(handler)
async function call(url) {
  const req = { url, method: 'GET', on() {} }
  const res = {
    status: 0, body: '', headersSent: false, writableEnded: false,
    writeHead(status) { this.status = status; this.headersSent = true },
    end(value) { this.body = String(value ?? ''); this.writableEnded = true },
  }
  await handler(req, res)
  return { status: res.status, json: JSON.parse(res.body) }
}
const sessions = await call('/dsh-hands/sessions?hand=opencode')
assert.equal(sessions.status, 200)
const rows = sessions.json.sessions
assert.equal(rows.length, 2, '一个真实会话 + 一个未知会话')
const known = rows.find((row) => row.conversationId === 'ses_known1234567890')
const unknown = rows.find((row) => row.conversationId === 'ses_unknown1234567890')
assert.ok(known)
assert.equal(known.name, '真实会话')
assert.equal(known.cwd, 'D:\\\\projects\\\\known')
assert.equal(known.running, true)
assert.equal(known.turns, 1, '恢复任务不能和真实派发重复计数')
assert.equal(known.key, 'opencode/sid:ses_known1234567890')
assert.ok(unknown)
assert.equal(unknown.name, '未命名会话（ses_unkn）')
assert.equal(unknown.cwd, '')
assert.equal(unknown.hand, 'opencode')
assert.equal(unknown.running, true)
assert.equal(unknown.turns, 1)
assert.ok(rows.every((row) => !String(row.key).includes('临时-')), '不能再生成临时 key')
assert.ok(rows.every((row) => row.conversationId !== 'session-caller'), '调用方 id 不能当目标 sid')
const knownTurns = await call('/dsh-hands/turns?key=' + encodeURIComponent(known.key))
const unknownTurns = await call('/dsh-hands/turns?key=' + encodeURIComponent(unknown.key))
assert.deepEqual(knownTurns.json.turns.map((turn) => turn.id), ['run-known'])
assert.deepEqual(unknownTurns.json.turns.map((turn) => turn.id), ['run-unknown'])
console.log(JSON.stringify({ known: known.name, unknown: unknown.name, rows: rows.length }))
`)

const home = path.join(root, 'home')
const dsh = path.join(home, '.dsh')
fs.mkdirSync(dsh, { recursive: true })
const base = Date.parse('2026-11-25T10:00:00.000Z')
const start = (id, prompt, sid, offset) => ({
  v: 2,
  phase: 'start',
  id,
  hand: 'opencode',
  tool: 'hands_run',
  prompt,
  session: '',
  sessionKey: 'opencode/临时-2026-11-25',
  conversationId: sid,
  cwd: '',
  startedAt: new Date(base + offset).toISOString(),
  at: new Date(base + offset).toISOString(),
})
const records = [
  start('run-known', '恢复真实会话', 'ses_known1234567890', 0),
  start('run-unknown', '未知目标会话', 'ses_unknown1234567890', 1000),
]
fs.writeFileSync(path.join(dsh, 'hands-log.jsonl'), records.map((row) => JSON.stringify(row)).join('\n') + '\n')
fs.writeFileSync(path.join(dsh, 'hands-async.json'), JSON.stringify({
  v: 1,
  jobs: {
    'job-known': {
      id: 'job-known',
      hand: 'opencode',
      tool: 'hands_run',
      sessionId: 'session-caller',
      prompt: '恢复真实会话',
      startedAt: base + 6,
      status: 'RUNNING',
      delivery: 'pending',
    },
    'job-unknown': {
      id: 'job-unknown',
      hand: 'opencode',
      tool: 'hands_run',
      sessionId: 'session-caller',
      prompt: '未知目标会话',
      startedAt: base + 1006,
      status: 'RUNNING',
      delivery: 'pending',
    },
  },
}))
fs.writeFileSync(path.join(dsh, 'opencode-sessions.json'), JSON.stringify({
  真实会话: { id: 'ses_known1234567890', cwd: 'D:\\projects\\known', updated: '2026-11-25T10:00:01.000Z' },
}))

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
  assert.equal(result.rows, 2)
  assert.equal(result.known, '真实会话')
  assert.equal(result.unknown, '未命名会话（ses_unkn）')
  console.log('session recovery route ok')
} finally {
  fs.rmSync(root, { recursive: true, force: true })
}
