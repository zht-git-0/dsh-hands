// 进程输出上限 + 实时滑窗偏移回归，不起模型。
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { MAX_PROCESS_OUTPUT_BYTES, computeLiveDeltaByLength, killProcessTree, runProcess } from '../index.js'
import { collectAgy, createLiveView } from '../stream.js'

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'hands-process-limits-'))
try {
  const script = path.join(root, 'large-output.mjs')
  fs.writeFileSync(script, `
console.log(JSON.stringify({ event: 'init', conversation_id: 'cid-large' }))
process.stdout.write('中'.repeat(1024 * 1024))
process.stdout.write('\\n' + JSON.stringify({ event: 'result', result: { status: 'SUCCESS', response: 'ok' } }) + '\\n')
`)
  let streamedBytes = 0
  const result = await runProcess(process.execPath, [script], {
    timeoutSec: 30,
    onChunk: (chunk) => { streamedBytes += Buffer.byteLength(String(chunk), 'utf8') },
  })
  assert.equal(result.code, 0, result.stderr)
  assert.ok(Buffer.byteLength(result.stdout, 'utf8') <= MAX_PROCESS_OUTPUT_BYTES, 'stdout 遵守字节上限')
  assert.ok(streamedBytes > MAX_PROCESS_OUTPUT_BYTES, 'onChunk 仍收到完整实时流')
  const parsed = collectAgy(result.stdout)
  assert.equal(parsed.conversation_id, 'cid-large', '截断后仍保留头部会话 id')
  assert.equal(parsed.response, 'ok', '截断后仍保留尾部 result')

  const view = createLiveView('opencode')
  view.feedEvent({ sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: 'a'.repeat(250000) } })
  assert.equal(view.render().length, 200000)
  assert.equal(view.totalLength(), 250000)
  const first = computeLiveDeltaByLength(view.render(), 0, view.totalLength())
  assert.equal(first.next, 250000)
  assert.equal(first.delta.length, 200000)
  view.feedEvent({ sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: '尾巴' } })
  const second = computeLiveDeltaByLength(view.render(), first.next, view.totalLength())
  assert.equal(second.delta, '\n尾巴')
  assert.equal(second.next, 250003)
  console.log('process output cap + live offset ok')

  const holderScript = path.join(root, 'pipe-holder.mjs')
  const holderPidFile = path.join(root, 'holder.pid')
  fs.writeFileSync(holderScript, `
import { spawn } from 'node:child_process'
import fs from 'node:fs'
const holder = spawn(process.execPath, ['-e', 'setTimeout(() => {}, 30000)'], { stdio: ['ignore', 'inherit', 'inherit'] })
fs.writeFileSync(${JSON.stringify(holderPidFile)}, String(holder.pid))
holder.unref()
`)
  const graceStarted = Date.now()
  const graceResult = await runProcess(process.execPath, [holderScript], { timeoutSec: 10 })
  const graceMs = Date.now() - graceStarted
  assert.equal(graceResult.code, 0, graceResult.stderr)
  assert.ok(graceMs < 5000, `孙进程持管时不能永久挂死，实际 ${graceMs}ms`)
  const holderPid = Number(fs.readFileSync(holderPidFile, 'utf8'))
  await killProcessTree(holderPid)
  console.log('inherited pipe exit grace ok')
} finally {
  fs.rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
}
