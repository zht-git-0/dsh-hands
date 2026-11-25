// 会话解析延后 + 索引合并写：不调用模型，用假 opencode 控制并发时序。
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { fileURLToPath, pathToFileURL } from 'node:url'

const repoIndex = fileURLToPath(new URL('../index.js', import.meta.url))
const tempBase = path.join(os.tmpdir(), 'opencode')
fs.mkdirSync(tempBase, { recursive: true })
const root = fs.mkdtempSync(path.join(tempBase, 'hands-session-resolve-'))
const home = path.join(root, 'home')
const work = path.join(root, 'work')
const failWork = path.join(root, 'fail-work')
const leftWork = path.join(root, 'left-work')
const rightWork = path.join(root, 'right-work')
const control = path.join(root, 'control')
const fakeScript = path.join(root, 'fake-opencode.mjs')
const fakeBin = path.join(root, process.platform === 'win32' ? 'fake-opencode.cmd' : 'fake-opencode')
const childFile = path.join(root, 'child.mjs')
fs.mkdirSync(path.join(home, '.dsh'), { recursive: true })
fs.mkdirSync(work, { recursive: true })
fs.mkdirSync(failWork, { recursive: true })
fs.mkdirSync(leftWork, { recursive: true })
fs.mkdirSync(rightWork, { recursive: true })
fs.mkdirSync(control, { recursive: true })

fs.writeFileSync(fakeScript, `
import fs from 'node:fs'
import path from 'node:path'
const control = ${JSON.stringify(control)}
const args = process.argv.slice(2)
const prompt = args.at(-1)
const sessionAt = args.indexOf('--session')
const resumed = sessionAt >= 0 ? args[sessionAt + 1] : ''
fs.writeFileSync(path.join(control, prompt + '.argv'), JSON.stringify(args))
fs.writeFileSync(path.join(control, prompt + '.started'), String(process.pid))
const deadline = Date.now() + 15000
while (!fs.existsSync(path.join(control, prompt + '.release'))) {
  if (Date.now() > deadline) process.exit(2)
  await new Promise((resolve) => setTimeout(resolve, 20))
}
console.log(JSON.stringify({ type: 'text', sessionID: resumed || ('ses_' + prompt), part: { text: 'done ' + prompt } }))
`)
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
apply(ctx, { opencodeBin: ${JSON.stringify(fakeBin)}, maxAsync: 4 })
const opencode = tools.get('opencode_run')
const hands = tools.get('hands_run')
const control = ${JSON.stringify(control)}
const statePath = path.join(process.env.USERPROFILE, '.dsh', 'hands-async.json')
const indexFile = path.join(process.env.USERPROFILE, '.dsh', 'opencode-sessions.json')
const logFile = path.join(process.env.USERPROFILE, '.dsh', 'hands-log.jsonl')
const readState = () => JSON.parse(fs.readFileSync(statePath, 'utf8'))
const readIndex = () => JSON.parse(fs.readFileSync(indexFile, 'utf8'))
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
async function waitFor(fn, label, timeout = 8000) {
  const end = Date.now() + timeout
  while (Date.now() < end) {
    const value = fn()
    if (value) return value
    await sleep(20)
  }
  throw new Error('timeout: ' + label)
}
const release = (prompt) => fs.writeFileSync(path.join(control, prompt + '.release'), 'go')
const run = (prompt, session, cwd = ${JSON.stringify(work)}, extra = {}) => opencode.execute({
  prompt, session, cwd, auto: true, async: true, ...extra,
}, ctx)

// 1) 新会话首轮未落盘时，第二轮入队；出队后必须 resume 首轮 conversationId。
const a = await run('A', 'same')
assert.equal(a.status, 'RUNNING')
await waitFor(() => fs.existsSync(path.join(control, 'A.started')), 'A started')
const b = await hands.execute({
  to: 'opencode', prompt: 'B', session: 'same', cwd: ${JSON.stringify(work)}, write: true, async: true,
}, ctx)
assert.equal(b.status, 'QUEUED')
assert.equal(b.queuePosition, 1)
assert.equal(fs.existsSync(path.join(control, 'B.started')), false)
release('A')
await waitFor(() => fs.existsSync(path.join(control, 'B.started')), 'B resumed after A')
const bArgv = JSON.parse(fs.readFileSync(path.join(control, 'B.argv'), 'utf8'))
assert.ok(bArgv.includes('--session'), '第二轮出队后才拼 --session')
assert.equal(bArgv[bArgv.indexOf('--session') + 1], 'ses_A', '续上首轮真实 conversationId')
release('B')
await waitFor(() => readState().jobs[a.jobId]?.endedAt && readState().jobs[b.jobId]?.endedAt, 'same session jobs settle')
assert.equal(readIndex().same.id, 'ses_A', '同会话索引保持同一个 id')

// 2) 两个不同会话并发结束，索引合并后两条都在。
const left = await run('LEFT', 'left', ${JSON.stringify(leftWork)})
const right = await run('RIGHT', 'right', ${JSON.stringify(rightWork)})
assert.equal(left.status, 'RUNNING')
assert.equal(right.status, 'RUNNING')
await waitFor(() => fs.existsSync(path.join(control, 'LEFT.started')) && fs.existsSync(path.join(control, 'RIGHT.started')), 'both sessions started')
release('LEFT')
release('RIGHT')
await waitFor(() => readState().jobs[left.jobId]?.endedAt && readState().jobs[right.jobId]?.endedAt, 'different sessions settle')
const mergedIndex = readIndex()
assert.equal(mergedIndex.left.id, 'ses_LEFT')
assert.equal(mergedIndex.right.id, 'ses_RIGHT')
assert.equal(mergedIndex.same.id, 'ses_A', '合并写不抹掉已有会话')

// 3) perform 阶段才出现的失败也要补 end，并通知调用方，不能静默。
const e = await run('E', 'failline', ${JSON.stringify(failWork)})
await waitFor(() => fs.existsSync(path.join(control, 'E.started')), 'E started')
const f = await run('F', 'failline', ${JSON.stringify(failWork)}, { sessionMode: 'new' })
assert.equal(f.status, 'QUEUED')
release('E')
await waitFor(() => readState().jobs[f.jobId]?.endedAt, 'queued F fails at perform')
assert.equal(readState().jobs[f.jobId].status, 'ERROR')
const records = fs.readFileSync(logFile, 'utf8').split(/\\r?\\n/).filter(Boolean).map(JSON.parse)
const failed = records.find((row) => row.id === f.jobId && row.phase === 'end')
assert.ok(failed, 'perform 失败补出 end 记录')
assert.equal(failed.status, 'ERROR')
assert.match(failed.error, /已经存在|已经用过/)
await waitFor(() => delivered.some((payload) => String(payload.id) === f.jobId + '-report'), 'failure report delivered')

for (const cleanup of cleanups) cleanup()
console.log(JSON.stringify({ same: readIndex().same.id, left: mergedIndex.left.id, right: mergedIndex.right.id, failed: failed.status }))
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
  assert.equal(result.same, 'ses_A')
  assert.equal(result.left, 'ses_LEFT')
  assert.equal(result.right, 'ses_RIGHT')
  assert.equal(result.failed, 'ERROR')
  console.log('session resolve queue + index merge ok')
} finally {
  fs.rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
}
