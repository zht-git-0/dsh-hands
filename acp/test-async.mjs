// 异步派活的纯函数测试：node acp/test-async.mjs
// 只测「会话 id 怎么取 / 回传正文长什么样 / 时长怎么算」，
// 真跑一个手下要走模型，不放在这里。
import assert from 'node:assert/strict'
import { asyncReportText, findAgentFor, formatDuration, pickBin, sessionIdFromExec } from '../index.js'

// ── 0) 二进制路径：按顺序找第一个真实存在的 ──────────────────────────────────
{
  const real = process.execPath // 一定存在
  assert.equal(pickBin(['/definitely/not/here', real, '/also/not']), real, '跳过不存在的，用存在的')
  assert.equal(pickBin([real]), real, '单个也能用')
  assert.equal(pickBin(['/nope/a', '/nope/b']), '/nope/b', '都不存在就返回最后一个（报错信息里有个像样路径）')
  assert.equal(pickBin([]), '', '空数组不炸')
  assert.equal(pickBin([undefined, '', '  ', real]), real, '空值会被跳过')
  console.log('0) pickBin ok')
}

// ── 1) 从工具的第二个参数里拿会话 id ────────────────────────────────────────
{
  // exec.agent.session.id（最常见）
  assert.equal(sessionIdFromExec({ agent: { session: { id: 'session-abc' } } }), 'session-abc')
  // exec.caller 兜底
  assert.equal(sessionIdFromExec({ caller: { session: { id: 'session-xyz' } } }), 'session-xyz')
  // exec.agentRef 兜底
  assert.equal(sessionIdFromExec({ agentRef: { session: { sessionId: 'session-123' } } }), 'session-123')
  // 只有 sessionId / id 字段
  assert.equal(sessionIdFromExec({ agent: { sessionId: 'session-direct' } }), 'session-direct')
  // 拿不到就返回空串 —— 绝不猜一个会话往里投
  assert.equal(sessionIdFromExec(undefined), '')
  assert.equal(sessionIdFromExec({}), '')
  assert.equal(sessionIdFromExec({ agent: {} }), '')
  assert.equal(sessionIdFromExec({ agent: { session: {} } }), '')
  console.log('1) sessionIdFromExec ok')
}

// ── 2) 找 agent：带/不带 session- 前缀都要试 ─────────────────────────────────
{
  const wanted = { session: { id: 'session-real' } }
  const seen = []
  const ctx = {
    get(name) {
      assert.equal(name, 'agents')
      return {
        get(id) {
          seen.push(id)
          return id === 'session-real' ? wanted : undefined
        },
      }
    },
  }
  assert.equal(findAgentFor(ctx, 'real'), wanted, '裸 id 能翻到带前缀的')
  assert.ok(seen.includes('real') && seen.includes('session-real'), '两个写法都试过')

  const ctx2 = { get: () => ({ get: (id) => (id === 'session-abc' ? 'A' : undefined) }) }
  assert.equal(findAgentFor(ctx2, 'session-abc'), 'A', '带前缀的也能直接命中')
  assert.equal(findAgentFor(ctx2, 'nope'), undefined, '找不到就是 undefined')
  assert.equal(findAgentFor({}, 'x'), undefined, '没有 agents 服务不炸')
  assert.equal(findAgentFor(ctx, ''), undefined, '空 id 不查')
  console.log('2) findAgentFor ok')
}

// ── 3) 时长 ────────────────────────────────────────────────────────────────
{
  assert.equal(formatDuration(0), '0 秒')
  assert.equal(formatDuration(6_500), '7 秒')
  assert.equal(formatDuration(65_000), '1 分 5 秒')
  assert.equal(formatDuration(389_000), '6 分 29 秒')
  assert.equal(formatDuration(3_600_000 + 120_000), '1 小时 2 分')
  assert.equal(formatDuration(-5), '0 秒', '负数按 0')
  console.log('3) formatDuration ok')
}

// ── 4) 回传正文：状态行 / 派活截断 / 结果 / 日志 / 错误 ──────────────────────
{
  const job = {
    hand: 'claude',
    tool: 'claude_run',
    prompt: '把架构文档写出来',
  }
  const text = asyncReportText(job, {
    status: 'OK',
    ms: 389_000,
    exitCode: 0,
    cost: 0.1234,
    excerpt: '文档写好了',
    jobFile: 'C:\\jobs\\x.txt',
  })
  assert.ok(text.startsWith('【手下回传】claude · claude_run'), '抬头')
  assert.ok(text.includes('状态 OK'), '状态')
  assert.ok(text.includes('6 分 29 秒'), '用时')
  assert.ok(text.includes('退出码 0'), '退出码')
  assert.ok(text.includes('$0.1234'), '花费')
  assert.ok(text.includes('派活：把架构文档写出来'), '派活原文')
  assert.ok(text.includes('文档写好了'), '结果正文')
  assert.ok(text.includes('完整日志：C:\\jobs\\x.txt'), '日志位置')

  // 超长派活要截断，别把回传撑爆
  const long = asyncReportText(
    { hand: 'opencode', tool: 'opencode_run', prompt: 'x'.repeat(500) },
    { status: 'OK', ms: 1000, excerpt: 'y'.repeat(5000) },
  )
  assert.ok(long.includes('…'), '超长有省略号')
  assert.ok(long.length < 2400, `回传别太长，实际 ${long.length}`)

  // 失败也要能读：错误 + 没有输出
  const bad = asyncReportText({ hand: 'codex', tool: 'codex_run' }, {
    status: 'ERROR',
    ms: 3000,
    exitCode: 1,
    excerpt: '',
    error: 'boom',
  })
  assert.ok(bad.includes('（没有输出）'), '空输出有占位')
  assert.ok(bad.includes('错误：boom'), '错误行')
  assert.ok(bad.includes('退出码 1'), '非零退出码')
  console.log('4) asyncReportText ok')
}

console.log('ok')
