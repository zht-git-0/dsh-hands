// Step 2 文件缓存/外部失效/日志近似裁剪回归。
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { cachedRead, fileReadStats, invalidateFileReadCache, refreshFileReadCache, resetFileReadCache } from '../index.js'

const repoIndex = fileURLToPath(new URL('../index.js', import.meta.url))
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'hands-file-cache-'))
try {
  const jsonFile = path.join(root, 'cache.json')
  fs.writeFileSync(jsonFile, JSON.stringify({ value: 1 }))
  resetFileReadCache()
  const load = () => JSON.parse(fs.readFileSync(jsonFile, 'utf8'))
  assert.deepEqual(cachedRead(jsonFile, load, null), { value: 1 })
  assert.deepEqual(cachedRead(jsonFile, load, null), { value: 1 })
  assert.equal(fileReadStats.reads, 1)
  assert.equal(fileReadStats.hits, 1)
  fs.writeFileSync(jsonFile, JSON.stringify({ value: 2 }))
  refreshFileReadCache()
  assert.deepEqual(cachedRead(jsonFile, load, null), { value: 2 })
  assert.equal(fileReadStats.reads, 2)
  invalidateFileReadCache(jsonFile)
  assert.deepEqual(cachedRead(jsonFile, load, null), { value: 2 })
  assert.equal(fileReadStats.reads, 3)
  console.log('file cache unit ok')

  async function runChild(mode) {
    const home = path.join(root, mode)
    const dsh = path.join(home, '.dsh')
    fs.mkdirSync(dsh, { recursive: true })
    if (mode === 'trim') {
      const rows = Array.from({ length: 1199 }, (_, index) => JSON.stringify({
        v: 2, phase: 'start', id: `s${index}`, hand: 'opencode', tool: 'opencode_run',
        session: `session-${index}`, sessionKey: `opencode/session-${index}`,
        prompt: 'trim', startedAt: new Date(Date.now() - 60_000 + index).toISOString(),
        at: new Date(Date.now() - 60_000 + index).toISOString(),
      })).join('\n') + '\n'
      fs.writeFileSync(path.join(dsh, 'hands-log.jsonl'), rows)
    } else {
      fs.writeFileSync(path.join(dsh, 'opencode-sessions.json'), JSON.stringify({ old: { id: 'sid_old', cwd: 'D:/work', updated: new Date().toISOString() } }))
    }
    const childFile = path.join(root, `${mode}.mjs`)
    fs.writeFileSync(childFile, `
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
const { apply, fileReadStats, resetFileReadCache } = await import(${JSON.stringify(pathToFileURL(repoIndex).href)})
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
  const res = { status: 0, body: '', headersSent: false, writableEnded: false,
    writeHead(status) { this.status = status }, end(value) { this.body = String(value ?? '') } }
  await handler(req, res)
  return JSON.parse(res.body)
}
if (${JSON.stringify(mode)} === 'trim') {
  const lines = fs.readFileSync(path.join(process.env.USERPROFILE, '.dsh', 'hands-log.jsonl'), 'utf8').split(/\\r?\\n/).filter(Boolean)
  assert.ok(lines.length <= 1200, '超过 LOG_KEEP+200 后必须裁剪，实际 ' + lines.length)
  assert.ok(lines.length < 2398, '裁剪确实生效')
} else {
  const first = await call('/dsh-hands/sessions?hand=opencode')
  assert.equal(first.sessions[0].name, 'old')
  resetFileReadCache()
  await call('/dsh-hands/sessions?hand=opencode')
  const reads = fileReadStats.reads
  await call('/dsh-hands/sessions?hand=opencode')
  assert.equal(fileReadStats.reads, reads, '重复面板请求零文件读取')
  await new Promise((resolve) => setTimeout(resolve, 1200))
  assert.equal(fileReadStats.reads, reads, '空闲 1 秒内 250ms 心跳不读文件')
  fs.writeFileSync(path.join(process.env.USERPROFILE, '.dsh', 'opencode-sessions.json'), JSON.stringify({ fresh: { id: 'sid_fresh', cwd: 'D:/work', updated: new Date().toISOString() } }))
  await new Promise((resolve) => setTimeout(resolve, 2300))
  const external = await call('/dsh-hands/sessions?hand=opencode')
  assert.equal(external.sessions[0].name, 'fresh', '2 秒 stat 兜底发现外部改盘')
}
for (const cleanup of cleanups) cleanup()
console.log('file cache child ok')
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
    assert.equal(code, 0, `${mode} child failed: ${stderr || stdout}`)
  }
  await runChild('panel')
  await runChild('trim')
  console.log('file cache integration ok')
} finally {
  fs.rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
}
