// turnsFor 纯函数测试：node acp/test-turns.mjs
// 只喂假数据，不起进程、不碰日志文件；跑通最后打印 ok。
import assert from 'node:assert/strict'
import { turnsFor } from '../index.js'

// 历史 job（mergedJobs 的形状）：不同 key、startedAt 故意乱序。
const jobs = [
  {
    id: 'j1', hand: 'opencode', tool: 'opencode_run', session: 'alpha',
    sessionKey: 'opencode/alpha', conversationId: '',
    startedAt: '2026-11-18T10:00:00.000Z', at: '2026-11-18T10:01:00.000Z',
    status: 'OK', ok: true, ms: 60000, prompt: 'p1', excerpt: 'e1',
    tokens: { total: 10 }, cost: 0.01, model: 'm1', write: false,
    output: 'SECRET-OUTPUT-1', jobFile: 'C:\\somewhere\\out\\j1.txt',
  },
  {
    id: 'j2', hand: 'opencode', tool: 'opencode_run', session: 'beta',
    sessionKey: 'opencode/beta', conversationId: '',
    startedAt: '2026-11-18T11:00:00.000Z', at: '2026-11-18T11:02:00.000Z',
    status: 'OK', ok: true, ms: 120000, prompt: 'p2', excerpt: 'e2',
  },
  {
    id: 'j3', hand: 'opencode', tool: 'opencode_run', session: 'gamma',
    sessionKey: 'opencode/gamma', conversationId: 'cid-3',
    startedAt: '2026-11-18T12:00:00.000Z', at: '2026-11-18T12:03:00.000Z',
    status: 'OK', ok: true, ms: 180000, prompt: 'p3', excerpt: 'e3',
  },
  {
    id: 'j4', hand: 'codex', tool: 'codex_run', session: 'alpha',
    sessionKey: 'codex/alpha', conversationId: '',
    startedAt: '2026-11-18T09:00:00.000Z', at: '2026-11-18T09:01:00.000Z',
    status: 'ERROR', ok: false, ms: 30000, prompt: 'p4', excerpt: 'e4',
  },
  {
    id: 'j5', hand: 'opencode', tool: 'opencode_run', session: 'alpha',
    sessionKey: 'opencode/alpha', conversationId: '',
    startedAt: '2026-11-18T13:00:00.000Z', at: '2026-11-18T13:04:00.000Z',
    status: 'OK', ok: true, ms: 240000, prompt: 'p5', excerpt: 'e5',
  },
  {
    id: 'j6', hand: 'opencode', tool: 'opencode_run', session: 'delta',
    sessionKey: 'opencode/delta', conversationId: 'cid-3',
    startedAt: '2026-11-18T08:00:00.000Z', at: '2026-11-18T08:01:00.000Z',
    status: 'OK', ok: true, ms: 60000, prompt: 'p6', excerpt: 'e6',
  },
]

// 在跑的 entry：也带 output，同样不能漏出去。
const running = [
  {
    id: 'r1', hand: 'opencode', tool: 'opencode_run', session: 'alpha',
    sessionKey: 'opencode/alpha', conversationId: '',
    startedAt: '2026-11-18T14:00:00.000Z', outputAt: 1,
    prompt: 'live', output: 'LIVE-SECRET', write: true, model: 'm-live',
  },
  {
    id: 'r2', hand: 'opencode', tool: 'opencode_run', session: 'beta',
    sessionKey: 'opencode/beta', conversationId: '',
    startedAt: '2026-11-18T15:00:00.000Z', outputAt: 1,
    prompt: 'live2', output: 'LIVE-SECRET-2',
  },
]

// 1) 按 key 过滤 + startedAt 倒序（乱序输入也要排好）
const alpha = turnsFor(jobs, running, 'opencode/alpha')
assert.deepEqual(alpha.map((t) => t.id), ['r1', 'j5', 'j1'])
assert.equal(alpha[0].running, true)
assert.equal(alpha[0].status, 'RUNNING')
assert.equal(alpha[0].write, true)
assert.equal(alpha[1].running, false)
assert.equal(alpha[2].at, '2026-11-18T10:01:00.000Z')
assert.equal(alpha[2].prompt, 'p1')
assert.equal(alpha[2].excerpt, 'e1')
assert.deepEqual(alpha[2].tokens, { total: 10 })
assert.equal(alpha[2].cost, 0.01)

// 2) 头字段齐全，且绝不返回 output / jobFile
const fields = ['id', 'hand', 'tool', 'startedAt', 'at', 'status', 'ok', 'ms',
  'prompt', 'excerpt', 'tokens', 'cost', 'model', 'write', 'running']
for (const t of alpha) {
  for (const f of fields) assert.ok(f in t, `缺字段 ${f}`)
  assert.ok(!('output' in t), '不能返回 output')
  assert.ok(!('jobFile' in t), '不能返回 jobFile')
}

// 3) limit
assert.deepEqual(turnsFor(jobs, running, 'opencode/alpha', { limit: 2 }).map((t) => t.id), ['r1', 'j5'])

// 4) before：严格早于光标（13:00 本身也不算）
assert.deepEqual(
  turnsFor(jobs, running, 'opencode/alpha', { before: '2026-11-18T13:00:00.000Z' }).map((t) => t.id),
  ['j1'],
)

// 5) conversationId 归到 sid key；同一个 conversationId 的不同 sessionKey 也能聚起来
assert.deepEqual(
  turnsFor(jobs, running, 'opencode/sid:cid-3').map((t) => t.id).sort(),
  ['j3', 'j6'],
)
// 有 conversationId 的也仍可用 sessionKey 查到
assert.deepEqual(turnsFor(jobs, running, 'opencode/delta').map((t) => t.id), ['j6'])

// 6) 别的 hand 不串味；空 key 直接空数组
assert.deepEqual(turnsFor(jobs, running, 'codex/alpha').map((t) => t.id), ['j4'])
assert.deepEqual(turnsFor(jobs, running, ''), [])

console.log('ok')
