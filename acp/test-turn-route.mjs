// /turn HTTP 契约：delta 始终是字符串，覆盖首屏/中途/滑窗/分块。
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { fileURLToPath, pathToFileURL } from 'node:url'

const repoIndex = fileURLToPath(new URL('../index.js', import.meta.url))
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'hands-turn-route-'))
const home = path.join(root, 'home')
const dsh = path.join(home, '.dsh')
const jobs = path.join(dsh, 'hands-jobs')
fs.mkdirSync(jobs, { recursive: true })
const at = '2026-11-25T10:00:00.000Z'
const fixtures = [
  { id: 'full', text: 'abcdef', outputLength: 6 },
  { id: 'mid', text: 'abcdef', outputLength: 6, blocks: [{ kind: 'text', text: 'native' }] },
  { id: 'window', text: 'TAIL', outputLength: 10 },
  { id: 'derived', text: '正文\n→ read: a.txt\n结果', outputLength: 17 },
]
const records = fixtures.map(({ id, text, outputLength, blocks }) => {
  const jobFile = path.join(jobs, `${id}.txt`)
  fs.writeFileSync(jobFile, text)
  return { id, hand: 'opencode', tool: 'hands_run', session: id, sessionKey: `opencode/${id}`, conversationId: `sid_${id}`, cwd: 'D:/work', startedAt: at, at, status: 'OK', ok: true, ms: 1, prompt: id, excerpt: text, jobFile, outputLength, ...(blocks ? { blocks } : {}) }
})
const binaryText = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB' + 'A'.repeat(600)
fs.writeFileSync(path.join(jobs, 'claude-binary.txt'), binaryText)
records.push({ id: 'claude-binary', hand: 'claude', tool: 'hands_run', session: 'claude-binary', sessionKey: 'claude/claude-binary', conversationId: 'sid_claude_binary', cwd: 'D:/work', startedAt: at, at, status: 'OK', ok: true, ms: 1, prompt: 'binary', excerpt: binaryText, jobFile: path.join(jobs, 'claude-binary.txt'), outputLength: binaryText.length, blocks: [{ kind: 'text', text: binaryText }] })
fs.writeFileSync(path.join(dsh, 'hands-log.jsonl'), records.map(JSON.stringify).join('\n') + '\n')
const childFile = path.join(root, 'child.mjs')
fs.writeFileSync(childFile, `
import assert from 'node:assert/strict'
import { pathToFileURL } from 'node:url'
const { apply } = await import(${JSON.stringify(pathToFileURL(repoIndex).href)})
let handler = null
const cleanups = []
const ctx = {
  tools: { register: () => () => {} },
  webServer: { register(options) { if (options.path === '/dsh-hands') handler = options.handler; return () => {} } },
  effect(fn) { const cleanup = fn(); if (typeof cleanup === 'function') cleanups.push(cleanup); return cleanup },
  get: () => undefined,
}
apply(ctx, {})
async function get(id, from) {
  const req = { url: '/dsh-hands/turn?id=' + id + '&from=' + from, method: 'GET', on() {} }
  const res = { status: 0, body: '', headersSent: false, writableEnded: false, writeHead(status) { this.status = status }, end(value) { this.body = String(value ?? '') } }
  await handler(req, res)
  assert.equal(res.status, 200)
  return JSON.parse(res.body)
}
const full = await get('full', 0)
assert.equal(typeof full.delta, 'string')
assert.equal(full.delta, 'abcdef')
assert.equal(full.next, full.from + full.delta.length)
assert.equal(full.blocksDerived, true)
const mid = await get('mid', 3)
assert.equal(typeof mid.delta, 'string')
assert.equal(mid.delta, 'def')
assert.equal(mid.next, mid.from + mid.delta.length)
assert.deepEqual(mid.blocks, [{ kind: 'text', text: 'native' }])
assert.equal(mid.blocksDerived, false)
const window = await get('window', 2)
assert.equal(typeof window.delta, 'string')
assert.equal(window.delta, 'TAIL')
assert.equal(window.from, 6)
assert.equal(window.next, 10)
assert.equal(window.next, window.from + window.delta.length)
const derived = await get('derived', 0)
assert.equal(typeof derived.delta, 'string')
assert.equal(derived.next, derived.from + derived.delta.length)
assert.equal(derived.blocksDerived, true)
assert.ok(derived.blocks.some((block) => block.kind === 'tool'))
const historicalBinary = await get('claude-binary', 0)
assert.ok(historicalBinary.blocks[0].text.startsWith('该段输出疑似非文本内容（可能是上游返回异常）'))
for (const cleanup of cleanups) cleanup()
console.log('turn route contract ok')
`)
const child = spawn(process.execPath, [childFile], { env: { ...process.env, USERPROFILE: home, HOME: home }, stdio: ['ignore', 'pipe', 'pipe'] })
let stdout = '', stderr = ''
child.stdout.on('data', (chunk) => { stdout += chunk })
child.stderr.on('data', (chunk) => { stderr += chunk })
const code = await new Promise((resolve) => child.on('close', resolve))
try {
  assert.equal(code, 0, `child failed: ${stderr || stdout}`)
  assert.match(stdout, /turn route contract ok/)
  console.log('P0-1 turn route contract ok')
} finally {
  fs.rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
}
