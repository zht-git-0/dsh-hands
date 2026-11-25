// 缓存快照不得覆盖外部写入：updateSessionIndex / agy_run / rerun / archive 四条路径。
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { fileURLToPath, pathToFileURL } from 'node:url'

const repoIndex = fileURLToPath(new URL('../index.js', import.meta.url))
const scriptFile = fileURLToPath(import.meta.url)

if (process.argv[2] === 'child') {
  const [, , , fakeBin, startedFile, releaseFile, rerunStartedFile, rerunReleaseFile, workDir] = process.argv
  const { apply } = await import(pathToFileURL(repoIndex).href)
  const tools = new Map()
  const cleanups = []
  let handler = null
  const ctx = {
    tools: { register(def) { tools.set(def.name, def); return () => tools.delete(def.name) } },
    webServer: { register(options) { if (options.path === '/dsh-hands') handler = options.handler; return () => {} } },
    effect(fn) { const cleanup = fn(); if (typeof cleanup === 'function') cleanups.push(cleanup); return cleanup },
    get: () => undefined,
    agent: { session: { id: 'caller', cwd: workDir }, async followup() { return { ok: true } } },
  }
  apply(ctx, { agyBin: fakeBin, opencodeBin: fakeBin })

  async function call(url, body) {
    const req = { url, method: body === undefined ? 'GET' : 'POST', on(event, fn) {
      if (event === 'data' && body !== undefined) queueMicrotask(() => fn(JSON.stringify(body)))
      if (event === 'end') queueMicrotask(() => fn())
    } }
    const res = { status: 0, body: '', headersSent: false, writableEnded: false, writeHead(status) { this.status = status }, end(value) { this.body = String(value ?? '') } }
    await handler(req, res)
    return { status: res.status, json: JSON.parse(res.body) }
  }
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
  async function waitFor(fn, label) {
    for (let i = 0; i < 300; i += 1) {
      if (fn()) return
      await sleep(20)
    }
    throw new Error('timeout: ' + label)
  }
  const dsh = path.join(process.env.USERPROFILE, '.dsh')
  const readLog = () => fs.readFileSync(path.join(dsh, 'hands-log.jsonl'), 'utf8')
    .split(/\r?\n/).filter(Boolean).map(JSON.parse)

  // agy_run 执行前缓存空索引，运行中外部写入 external，完成时只应合并 mine。
  const job = await tools.get('agy_run').execute({ prompt: 'A', session: 'mine', cwd: workDir, async: true }, ctx)
  await waitFor(() => fs.existsSync(startedFile), 'agy started')
  fs.writeFileSync(path.join(dsh, 'agy-sessions.json'), JSON.stringify({ external: { id: 'sid_external', cwd: workDir, updated: new Date().toISOString() } }))
  fs.writeFileSync(releaseFile, 'go')
  await waitFor(() => JSON.parse(fs.readFileSync(path.join(dsh, 'hands-async.json'), 'utf8')).jobs[job.jobId]?.endedAt, 'agy settle')
  const agyIndex = JSON.parse(fs.readFileSync(path.join(dsh, 'agy-sessions.json'), 'utf8'))

  // rerun 同样先缓存空索引，外部写入后再完成，external 不得被全量快照覆盖。
  await call('/dsh-hands/sessions?hand=opencode')
  const rerun = await call('/dsh-hands/rerun', { id: 'old-rerun' })
  assert.equal(rerun.status, 200)
  await waitFor(() => fs.existsSync(rerunStartedFile), 'rerun started')
  fs.writeFileSync(path.join(dsh, 'opencode-sessions.json'), JSON.stringify({ external: { id: 'sid_external', cwd: workDir, updated: new Date().toISOString() } }))
  fs.writeFileSync(rerunReleaseFile, 'go')
  await waitFor(() => readLog().some((row) => row.id === rerun.json.id && row.phase === 'end'), 'rerun settle')
  const rerunIndex = JSON.parse(fs.readFileSync(path.join(dsh, 'opencode-sessions.json'), 'utf8'))

  // archive 走 updater(latest)，也必须清掉旧缓存后重读。
  fs.writeFileSync(path.join(dsh, 'opencode-sessions.json'), JSON.stringify({ local: { id: 'sid_local', cwd: workDir, updated: new Date().toISOString() } }))
  await call('/dsh-hands/sessions?hand=opencode')
  fs.writeFileSync(path.join(dsh, 'hands-archive.json'), JSON.stringify({ keys: ['opencode/sid:external'] }))
  const archived = await call('/dsh-hands/archive-session', { key: 'opencode/sid:local', hand: 'opencode', archived: true })
  assert.equal(archived.status, 200)
  const archive = JSON.parse(fs.readFileSync(path.join(dsh, 'hands-archive.json'), 'utf8'))

  for (const cleanup of cleanups) cleanup()
  console.log(JSON.stringify({
    agyExternalSurvived: !!agyIndex.external,
    rerunExternalSurvived: !!rerunIndex.external,
    archiveExternalSurvived: archive.keys.includes('opencode/sid:external'),
  }))
} else {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'hands-index-cache-merge-'))
  try {
    const { cachedRead, resetFileReadCache, updateSessionIndex } = await import(pathToFileURL(repoIndex).href)
    const unitFile = path.join(root, 'unit.json')
    fs.writeFileSync(unitFile, '{}\n')
    resetFileReadCache()
    cachedRead(unitFile, () => JSON.parse(fs.readFileSync(unitFile, 'utf8')), {})
    fs.writeFileSync(unitFile, JSON.stringify({ external: { id: 'sid_external' } }))
    assert.equal(updateSessionIndex(unitFile, 'local', { id: 'sid_local' }), true)
    const merged = JSON.parse(fs.readFileSync(unitFile, 'utf8'))
    assert.ok(merged.external && merged.local, '写前清缓存并重读，外部 key 不丢')

    const home = path.join(root, 'home')
    const dsh = path.join(home, '.dsh')
    const work = path.join(root, 'work')
    const started = path.join(root, 'started')
    const release = path.join(root, 'release')
    const rerunStarted = path.join(root, 'rerun-started')
    const rerunRelease = path.join(root, 'rerun-release')
    const fakeScript = path.join(root, 'fake.mjs')
    const fakeBin = path.join(root, process.platform === 'win32' ? 'fake.cmd' : 'fake')
    fs.mkdirSync(dsh, { recursive: true })
    fs.mkdirSync(work, { recursive: true })
    fs.writeFileSync(path.join(dsh, 'agy-sessions.json'), '{}\n')
    fs.writeFileSync(path.join(dsh, 'opencode-sessions.json'), '{}\n')
    const at = new Date().toISOString()
    const oldRerun = { v: 2, phase: 'end', id: 'old-rerun', hand: 'opencode', tool: 'hands_run', prompt: 'rerun', session: 'rerun', sessionKey: 'opencode/rerun', cwd: work, startedAt: at, at, status: 'OK', ok: true }
    fs.writeFileSync(path.join(dsh, 'hands-log.jsonl'), JSON.stringify(oldRerun) + '\n')
    fs.writeFileSync(fakeScript, `
import fs from 'node:fs'
const opencode = process.argv[2] === 'run'
const started = opencode ? ${JSON.stringify(rerunStarted)} : ${JSON.stringify(started)}
const release = opencode ? ${JSON.stringify(rerunRelease)} : ${JSON.stringify(release)}
fs.writeFileSync(started, 'go')
while (!fs.existsSync(release)) await new Promise((resolve) => setTimeout(resolve, 20))
console.log(JSON.stringify(opencode
  ? { sessionID: 'sid_rerun', type: 'text', part: { text: 'ok' } }
  : { event: 'result', result: { status: 'SUCCESS', response: 'ok', conversation_id: 'sid_mine' } }))
`)
    if (process.platform === 'win32') fs.writeFileSync(fakeBin, `@echo off\r\nnode "${fakeScript}" %*\r\n`)
    else fs.writeFileSync(fakeBin, `#!/bin/sh\nexec node "${fakeScript}" "$@"\n`, { mode: 0o755 })

    const child = spawn(process.execPath, [scriptFile, 'child', fakeBin, started, release, rerunStarted, rerunRelease, work], {
      env: { ...process.env, USERPROFILE: home, HOME: home }, stdio: ['ignore', 'pipe', 'pipe'],
    })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (chunk) => { stdout += chunk })
    child.stderr.on('data', (chunk) => { stderr += chunk })
    const code = await new Promise((resolve) => child.on('close', resolve))
    assert.equal(code, 0, `child failed: ${stderr || stdout}`)
    const result = JSON.parse(stdout.trim().split('\n').at(-1))
    assert.equal(result.agyExternalSurvived, true)
    assert.equal(result.rerunExternalSurvived, true)
    assert.equal(result.archiveExternalSurvived, true)
    console.log('P1-2 cached index merge ok')
  } finally {
    fs.rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
  }
}
