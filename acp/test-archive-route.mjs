// 归档接口端到端测试：node acp/test-archive-route.mjs
// 在临时 USERPROFILE 里造「日志别名行 + 索引 sid 行」，走真实 /dsh-hands handler：
// 列表先去重，再 POST 归档 → 列表 archived=true → 同目录 new 免票 → POST 恢复。
// 不碰用户真实 ~/.dsh。
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const repoIndex = fileURLToPath(new URL('../index.js', import.meta.url))
const home = fs.mkdtempSync(path.join(os.tmpdir(), 'hands-archive-'))
const dsh = path.join(home, '.dsh')
fs.mkdirSync(dsh, { recursive: true })
const sid = 'ses_archive_test_1'
const sessionName = 'ai-game 开发'
const cwd = 'D:/ai-game'
fs.writeFileSync(
  path.join(dsh, 'hands-log.jsonl'),
  JSON.stringify({
    id: 'cancelled-no-sid',
    hand: 'opencode',
    tool: 'opencode_run',
    session: sessionName,
    sessionKey: `opencode/${sessionName}`,
    cwd,
    startedAt: '2026-11-24T15:14:29.240Z',
    at: '2026-11-24T15:22:16.344Z',
    status: 'CANCELLED',
    ok: false,
    ms: 466000,
    prompt: 'test',
    excerpt: 'cancelled',
  }) + '\n',
)
fs.writeFileSync(
  path.join(dsh, 'opencode-sessions.json'),
  JSON.stringify({ [sessionName]: { id: sid, cwd, updated: '2026-11-24T15:22:17.020Z' } }),
)

const childFile = path.join(home, 'child.mjs')
fs.writeFileSync(childFile, `
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
const { apply, resolveSession } = await import(${JSON.stringify(pathToFileURL(repoIndex).href)})
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
  if (body !== undefined) {
    req.emit('data', JSON.stringify(body))
    req.emit('end')
  }
  await pending
  return { status: res.status, json: JSON.parse(res.body) }
}
const before = await call('/dsh-hands/sessions?hand=opencode')
assert.equal(before.status, 200)
assert.equal(before.json.sessions.length, 1, 'ai-game 只渲染一行')
const row = before.json.sessions[0]
assert.equal(row.key, 'opencode/sid:' + ${JSON.stringify(sid)})
assert.equal(row.turns, 1, '取消轮不丢')
assert.equal(row.archived, false)
const key = row.key
const archived = await call('/dsh-hands/archive-session', { key, hand: 'opencode', archived: true })
assert.equal(archived.status, 200)
assert.equal(archived.json.ok, true)
assert.equal(archived.json.archived, true)
const after = await call('/dsh-hands/sessions?hand=opencode')
assert.equal(after.json.sessions[0].archived, true, '归档状态落盘并反映到列表')
const archiveFile = path.join(process.env.USERPROFILE, '.dsh', 'hands-archive.json')
const keys = JSON.parse(fs.readFileSync(archiveFile, 'utf8')).keys
assert.ok(keys.includes(key), '归档接口真的写了账本')
const index = JSON.parse(fs.readFileSync(path.join(process.env.USERPROFILE, '.dsh', 'opencode-sessions.json'), 'utf8'))
assert.deepEqual(resolveSession(index, 'brand-new', ${JSON.stringify(cwd)}, { sessionMode: 'new' }, 'opencode', '', keys), { id: null, reset: false }, '归档后同目录 new 免票')
const restored = await call('/dsh-hands/archive-session', { key, hand: 'opencode', archived: false })
assert.equal(restored.json.archived, false)
const final = await call('/dsh-hands/sessions?hand=opencode')
assert.equal(final.json.sessions[0].archived, false, '恢复也生效')
console.log(JSON.stringify({ key, turns: row.turns, archived: true, restored: false, rows: final.json.sessions.length }))
`)

const child = spawn(process.execPath, [childFile], {
  env: { ...process.env, USERPROFILE: home, HOME: home },
  stdio: ['ignore', 'pipe', 'pipe'],
})
let stdout = ''
let stderr = ''
child.stdout.on('data', (d) => (stdout += d))
child.stderr.on('data', (d) => (stderr += d))
const code = await new Promise((resolve) => child.on('close', resolve))
try {
  assert.equal(code, 0, `子进程失败：${stderr || stdout}`)
  const result = JSON.parse(stdout.trim().split('\n').at(-1))
  assert.equal(result.rows, 1)
  assert.equal(result.turns, 1)
  assert.equal(result.archived, true)
  assert.equal(result.restored, false)
  console.log('1) 归档接口 + 列表刷新 + 归档后免票 ok')
} finally {
  fs.rmSync(home, { recursive: true, force: true })
}

console.log('archive route ok')
