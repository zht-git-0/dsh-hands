// SSE hand 订阅：空 key/未知 key 先推 sessions，key 后续出现时自动开始推 turns。
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { fileURLToPath, pathToFileURL } from 'node:url'

const repoIndex = fileURLToPath(new URL('../index.js', import.meta.url))
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'hands-sse-hand-'))
const home = path.join(root, 'home')
const dsh = path.join(home, '.dsh')
const childFile = path.join(root, 'child.mjs')
fs.mkdirSync(dsh, { recursive: true })
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
const req = new EventEmitter()
req.url = '/dsh-hands/stream?hand=opencode&key=opencode%2Ffuture'
req.method = 'GET'
let output = ''
const res = {
  destroyed: false, writableEnded: false, headersSent: false,
  writeHead() { this.headersSent = true },
  write(chunk) { output += String(chunk) },
  end() { this.writableEnded = true },
  on() {},
}
await handler(req, res)
assert.match(output, /event: sessions/, '合法 hand 即使 key 未知也推 sessions')
assert.match(output, /"hand":"opencode"/)
fs.writeFileSync(path.join(process.env.USERPROFILE, '.dsh', 'opencode-sessions.json'), JSON.stringify({
  future: { id: 'sid_future', cwd: 'D:/work', updated: new Date().toISOString() },
}))
const deadline = Date.now() + 4000
while (!output.includes('event: turns') && Date.now() < deadline) {
  await new Promise((resolve) => setTimeout(resolve, 50))
}
assert.match(output, /event: turns/, 'key 后续出现后不再被建连瞬间的 known 卡死')
assert.match(output, /"key":"opencode\\/future"/)
req.emit('close')
for (const cleanup of cleanups) cleanup()
console.log('sse hand ok')
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
  assert.match(stdout, /sse hand ok/)
  console.log('sse hand subscription ok')
} finally {
  fs.rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
}
