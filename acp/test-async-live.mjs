// 异步派活的真链路测试：node acp/test-async-live.mjs
//
// 不碰正在跑的 DSH：用假的 ctx 把 apply() 挂起来，抓出 claude_run，
// 然后用 async:true 真起一次 claude（很小的提示词），验证两件事：
//   1. 工具是不是**立刻**返回 RUNNING + jobId（不等模型）
//   2. 跑完之后是不是真的调了 agent.followup，正文是不是契约格式
//
// 会花一点钱（一次极小会话），想跳过就设 SKIP_LIVE=1。
import assert from 'node:assert/strict'

if (process.env.SKIP_LIVE === '1') {
  console.log('skip (SKIP_LIVE=1)')
  process.exit(0)
}

const { apply } = await import('../index.js')

const tools = new Map()
const delivered = []
let deliverResolve
const delivered$ = new Promise((resolve) => (deliverResolve = resolve))

const SESSION = 'session-test-async'
const fakeAgent = {
  session: { id: SESSION },
  async followup(payload) {
    delivered.push(payload)
    deliverResolve(payload)
    return { ok: true }
  },
}

const ctx = {
  tools: {
    register(def) {
      tools.set(def.name, def)
      return () => tools.delete(def.name)
    },
  },
  webServer: { register: () => () => {} },
  effect: (fn) => {
    try {
      return fn()
    } catch {
      return undefined
    }
  },
  get(name) {
    if (name === 'agents') return { get: (id) => (id === SESSION ? fakeAgent : undefined) }
    return undefined
  },
}

apply(ctx, { timeoutSec: 120 })

const claude = tools.get('claude_run')
assert.ok(claude, '抓到了 claude_run 工具')
assert.ok(claude.parameters.properties.async, 'schema 里有 async 参数')

// ── 1) 立刻返回 ────────────────────────────────────────────────────────────
const startedAt = Date.now()
const kicked = await claude.execute(
  {
    prompt: '只回复两个字：收到',
    async: true,
    model: 'sonnet',
    timeoutSec: 120,
  },
  { agent: { session: { id: SESSION } } },
)
const kickMs = Date.now() - startedAt

assert.equal(kicked.status, 'RUNNING', `应该立刻返回 RUNNING，实际 ${kicked.status}`)
assert.ok(kicked.jobId, '返回了 jobId')
assert.equal(kicked.sessionId, SESSION, '记住了派活的那个会话')
assert.ok(kickMs < 5000, `派活要立刻返回，实际用了 ${kickMs}ms`)
console.log(`1) 立刻返回 ok（${kickMs}ms，jobId=${kicked.jobId}）`)

// ── 2) 跑完回传 ────────────────────────────────────────────────────────────
const payload = await Promise.race([
  delivered$,
  new Promise((_, reject) => setTimeout(() => reject(new Error('90 秒内没等到回传')), 90000)),
])

assert.equal(payload.role, 'user', '回传是 user 消息')
assert.equal(payload.source?.kind, 'plugin:hands', '来源标成 plugin:hands，不冒充真人')
assert.ok(Array.isArray(payload.content) && payload.content[0]?.type === 'text', '正文是 text 块')
const text = String(payload.content[0].text)
assert.ok(text.includes('【手下回传】claude'), '回传抬头')
assert.ok(/状态 \S+/.test(text), '有状态行')
assert.ok(text.includes('派活：'), '带派活原文')
assert.ok(text.includes('收到') || text.includes('OK'), '带结果正文')
console.log('2) 回传 ok')
console.log('--- 回传正文 ---')
console.log(text.slice(0, 400))
console.log('--- end ---')

// ── 3) 同一个 jobId 只回传一次 ──────────────────────────────────────────────
await new Promise((r) => setTimeout(r, 1500))
const same = delivered.filter((p) => String(p.id).startsWith(String(kicked.jobId)))
assert.equal(same.length, 1, `同一个 job 只该回传一次，实际 ${same.length} 次`)
console.log('3) 只回传一次 ok')

console.log('ok')
