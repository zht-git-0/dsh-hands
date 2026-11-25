// 恢复进程退出测试：1s / 4.5s / 6s 退出都必须补一条 ORPHAN end，轮次不能蒸发。
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { fileURLToPath, pathToFileURL } from 'node:url'

const repoIndex = fileURLToPath(new URL('../index.js', import.meta.url))
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'hands-recovered-exit-'))
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function runCase(exitAfterMs) {
  const caseRoot = path.join(root, String(exitAfterMs))
  const home = path.join(caseRoot, 'home')
  const dsh = path.join(home, '.dsh')
  const readyFile = path.join(caseRoot, 'ready')
  const childFile = path.join(caseRoot, 'child.mjs')
  fs.mkdirSync(dsh, { recursive: true })

  const dummy = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore' })
  await new Promise((resolve, reject) => {
    dummy.once('spawn', resolve)
    dummy.once('error', reject)
  })
  assert.ok(dummy.pid)

  const startedAt = new Date(Date.now() - 60_000).toISOString()
  const start = {
    v: 2,
    phase: 'start',
    id: 'run-old',
    hand: 'opencode',
    tool: 'hands_run',
    prompt: '恢复进程',
    session: 'old',
    sessionKey: 'opencode/old',
    conversationId: 'sid_old',
    cwd: 'D:/work',
    model: '',
    startedAt,
    at: startedAt,
  }
  fs.writeFileSync(path.join(dsh, 'hands-log.jsonl'), JSON.stringify(start) + '\n')
  fs.writeFileSync(path.join(dsh, 'hands-async.json'), JSON.stringify({
    v: 1,
    jobs: {
      'job-old': {
        id: 'job-old',
        dispatchId: 'run-old',
        hand: 'opencode',
        tool: 'hands_run',
        sessionId: 'session-caller',
        prompt: '恢复进程',
        session: 'old',
        sessionKey: 'opencode/old',
        conversationId: 'sid_old',
        cwd: 'D:/work',
        startedAt: Date.parse(startedAt) + 6,
        status: 'RUNNING',
        pid: dummy.pid,
        delivery: 'pending',
      },
    },
  }))

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
async function call(url) {
  const req = { url, method: 'GET', on() {} }
  const res = {
    status: 0, body: '', headersSent: false, writableEnded: false,
    writeHead(status) { this.status = status },
    end(value) { this.body = String(value ?? '') },
  }
  await handler(req, res)
  return { status: res.status, json: JSON.parse(res.body) }
}
const beforeLog = await call('/dsh-hands/log')
const realTurns = await call('/dsh-hands/turns?key=' + encodeURIComponent('opencode/sid:sid_old'))
assert.equal(realTurns.json.turns[0].status, 'RUNNING')
fs.writeFileSync(${JSON.stringify(readyFile)}, 'ready')
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
let turns = realTurns
for (let i = 0; i < 180 && turns.json.turns[0]?.status !== 'ORPHAN'; i += 1) {
  await sleep(100)
  turns = await call('/dsh-hands/turns?key=' + encodeURIComponent('opencode/sid:sid_old'))
}
assert.equal(turns.json.turns.length, 1, '进程退出后轮次仍可见')
assert.equal(turns.json.turns[0].id, 'run-old')
assert.equal(turns.json.turns[0].status, 'ORPHAN')
const records = fs.readFileSync(path.join(process.env.USERPROFILE, '.dsh', 'hands-log.jsonl'), 'utf8')
  .split(/\\r?\\n/).filter(Boolean).map(JSON.parse)
const ends = records.filter((row) => row.id === 'run-old' && row.phase === 'end')
assert.equal(ends.length, 1, '只补一条 end')
assert.equal(ends[0].status, 'ORPHAN')
assert.match(ends[0].error, /重启.*进程/)
const sessions = await call('/dsh-hands/sessions?hand=opencode')
const row = sessions.json.sessions.find((item) => item.conversationId === 'sid_old')
assert.equal(row.status, 'ORPHAN')
assert.equal(row.turns, 1)
const afterLog = await call('/dsh-hands/log')
assert.ok(afterLog.json.historyRevision > beforeLog.json.historyRevision, '补 end 必须推进历史 revision')
for (const cleanup of cleanups) cleanup()
console.log(JSON.stringify({ status: turns.json.turns[0].status, ends: ends.length }))
`)

  let child = null
  let stdout = ''
  let stderr = ''
  try {
    child = spawn(process.execPath, [childFile], {
      env: { ...process.env, USERPROFILE: home, HOME: home },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    child.stdout.on('data', (chunk) => (stdout += chunk))
    child.stderr.on('data', (chunk) => (stderr += chunk))
    const readyDeadline = Date.now() + 5000
    while (!fs.existsSync(readyFile) && Date.now() < readyDeadline) await sleep(20)
    assert.ok(fs.existsSync(readyFile), `子进程未就绪：${stderr}`)
    await sleep(exitAfterMs)
    dummy.kill()
    await new Promise((resolve) => dummy.once('close', resolve))
    const code = await new Promise((resolve) => child.on('close', resolve))
    assert.equal(code, 0, `子进程失败：${stderr || stdout}`)
    const result = JSON.parse(stdout.trim().split('\n').at(-1))
    assert.equal(result.status, 'ORPHAN')
    assert.equal(result.ends, 1)
    console.log(`recovered process exit ${exitAfterMs}ms ok`)
  } finally {
    if (dummy.pid && !dummy.killed) dummy.kill()
    if (child && child.exitCode === null) child.kill()
  }
}

try {
  for (const exitAfterMs of [1000, 4500, 6000]) await runCase(exitAfterMs)
  console.log('recovered process exit matrix ok')
} finally {
  fs.rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
}
