// 异步派活的纯函数测试：node acp/test-async.mjs
// 只测「会话 id 怎么取 / 回传正文长什么样 / 时长怎么算」，
// 真跑一个手下要走模型，不放在这里。
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { asyncReportText, createAsyncQueue, findAgentFor, formatDuration, isProcessAlive, pickBin, planAsyncRecovery, readAsyncState, sessionIdFromExec, writeAsyncState } from '../index.js'

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

// ── 5) 落盘状态：读回、写回、重启后该补投谁 ─────────────────────────────────
{
  const os = await import('node:os')
  const fs = await import('node:fs')
  const path = await import('node:path')
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hands-async-'))
  const file = path.join(dir, 'state.json')

  // 文件不存在 = 空状态，不炸
  assert.deepEqual(readAsyncState(file).jobs, {}, '没有文件是空状态')

  const state = {
    v: 1,
    jobs: {
      'a-sent': { id: 'a-sent', hand: 'claude', startedAt: 1, endedAt: 'x', delivery: 'sent', report: 'r' },
      'b-done': { id: 'b-done', hand: 'opencode', startedAt: 2, endedAt: 'x', delivery: 'pending', report: '报告正文' },
      'c-running': { id: 'c-running', hand: 'codex', startedAt: 3, delivery: 'pending' },
      'd-done-no-report': { id: 'd-done-no-report', hand: 'agy', startedAt: 4, endedAt: 'x', delivery: 'pending' },
    },
  }
  assert.equal(writeAsyncState(state, file), true, '写成功')
  const back = readAsyncState(file)
  assert.equal(Object.keys(back.jobs).length, 4, '四条都读回来了')

  // 重启后：只补投 b-done（跑完 + 有正文 + 没投过）
  const plan = planAsyncRecovery(back)
  assert.deepEqual(plan.deliver, ['b-done'], `该补投的只有 b-done，实际 ${JSON.stringify(plan.deliver)}`)
  assert.deepEqual(plan.orphan, ['c-running'], `没跑完的是 c-running，实际 ${JSON.stringify(plan.orphan)}`)
  assert.deepEqual(plan.running, [], `没记 pid 的不算 running（按不在处理），实际 ${JSON.stringify(plan.running)}`)
  assert.ok(!plan.deliver.includes('a-sent'), '投过的不再投')
  assert.ok(!plan.deliver.includes('d-done-no-report'), '没正文的没法补投，不硬投')

  // 坏文件当空状态
  fs.writeFileSync(file, '{ not json', 'utf8')
  assert.deepEqual(readAsyncState(file).jobs, {}, '坏文件回空状态')

  // 只留最近 200 条
  const many = { v: 1, jobs: {} }
  for (let i = 0; i < 260; i += 1) many.jobs[`j${i}`] = { id: `j${i}`, startedAt: i }
  writeAsyncState(many, file)
  const capped = readAsyncState(file)
  assert.equal(Object.keys(capped.jobs).length, 200, '最多留 200 条')
  assert.ok(capped.jobs.j259, '留的是最新的')
  assert.ok(!capped.jobs.j0, '最老的被裁掉')

  fs.rmSync(dir, { recursive: true, force: true })
  console.log('5) 落盘状态 + 重启补投计划 ok')
}

// ── 7) 重启对账：还在跑的→running，死了的→orphan，跑完没投的→deliver ───────
{
  const alivePid = 4321
  const state = {
    v: 1,
    jobs: {
      'j-alive': { id: 'j-alive', hand: 'opencode', tool: 'opencode_run', delivery: 'pending', pid: alivePid, status: 'RUNNING' },
      'j-dead': { id: 'j-dead', hand: 'opencode', tool: 'opencode_run', delivery: 'pending', pid: 999999 },
      'j-nopid': { id: 'j-nopid', hand: 'opencode', tool: 'opencode_run', delivery: 'pending' },
      'j-done': { id: 'j-done', hand: 'opencode', tool: 'opencode_run', delivery: 'pending', endedAt: '2026-11-23T10:00:00Z', report: '报告正文' },
      'j-sent': { id: 'j-sent', hand: 'claude', tool: 'claude_run', delivery: 'sent', endedAt: '2026-11-23T10:00:00Z', report: '报告正文' },
    },
  }
  const plan = planAsyncRecovery(state, { isAlive: (pid) => Number(pid) === alivePid })
  assert.deepEqual(plan.running, ['j-alive'], `还在跑的应在 running，实际 ${JSON.stringify(plan.running)}`)
  assert.deepEqual(plan.orphan.sort(), ['j-dead', 'j-nopid'], `死了的在 orphan，实际 ${JSON.stringify(plan.orphan)}`)
  assert.deepEqual(plan.deliver, ['j-done'], `跑完没投的在 deliver，实际 ${JSON.stringify(plan.deliver)}`)

  // 默认用真实 isProcessAlive：自己的 pid 必在、0/-5/非法/空按不在
  assert.equal(isProcessAlive(process.pid), true, '自己的 pid 必在')
  assert.equal(isProcessAlive(0), false)
  assert.equal(isProcessAlive(-5), false)
  assert.equal(isProcessAlive('abc'), false)
  assert.equal(isProcessAlive(undefined), false)
  assert.equal(isProcessAlive(null), false)
  assert.deepEqual(planAsyncRecovery({ jobs: { live: { id: 'live', delivery: 'pending', pid: process.pid } } }).running, ['live'], '默认探测下自己的 pid 应判在跑')
  assert.deepEqual(planAsyncRecovery({ jobs: { dead: { id: 'dead', delivery: 'pending' } } }).orphan, ['dead'], '没记 pid 的按不在处理（遗留数据维持旧行为）')
  console.log('7) 重启对账 planAsyncRecovery ok')
}

// ── 8) isProcessAlive 真实进程：起了就在，杀了就不在 ───────────────────────
{
  const child = spawn(process.execPath, ['-e', 'setTimeout(() => {}, 3000)'], { stdio: 'ignore' })
  await new Promise((resolve) => { child.once('spawn', resolve); child.once('error', resolve) })
  assert.ok(child.pid, '子进程应已起')
  assert.equal(isProcessAlive(child.pid), true, '刚起的 node 应在')
  child.kill()
  await new Promise((resolve) => { child.once('exit', resolve); child.once('error', resolve) })
  for (let i = 0; i < 40 && isProcessAlive(child.pid); i += 1) {
    await new Promise((r) => setTimeout(r, 50))
  }
  assert.equal(isProcessAlive(child.pid), false, '杀了之后应判不在')
  console.log('8) isProcessAlive 真实进程 ok')
}

// ── 6) 并发闸门：上限、排队顺序、失败不卡队列 ───────────────────────────────
{
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

  // 上限 2：同时最多两个在跑，顺序先进先出
  const q = createAsyncQueue(2)
  let peak = 0
  let now = 0
  const order = []
  const done = []
  for (let i = 0; i < 5; i += 1) {
    done.push(
      q.run(async () => {
        now += 1
        peak = Math.max(peak, now)
        order.push(i)
        await sleep(10)
        now -= 1
        return i
      }),
    )
  }
  assert.equal(q.stats().active, 2, '一开始就占满两个槽')
  assert.equal(q.stats().waiting, 3, '另外三个在排队')
  const results = await Promise.all(done)
  assert.deepEqual(results, [0, 1, 2, 3, 4], '结果按提交顺序返回')
  assert.equal(peak, 2, `峰值并发应该是 2，实际 ${peak}`)
  assert.deepEqual(order, [0, 1, 2, 3, 4], '先进先出，没插队')
  await sleep(0) // 让 finally 里的减计数先跑完
  assert.deepEqual(q.stats(), { limit: 2, active: 0, waiting: 0 }, '跑完归零')

  // 一个任务抛错，不能把队列卡死
  const q2 = createAsyncQueue(1)
  const bad = q2.run(async () => {
    throw new Error('boom')
  })
  const good = q2.run(async () => 'ok')
  await assert.rejects(bad, /boom/)
  assert.equal(await good, 'ok', '前面的失败不影响后面的')
  await sleep(0)
  assert.deepEqual(q2.stats(), { limit: 1, active: 0, waiting: 0 })

  // 非法上限会被夹到合法区间
  assert.equal(createAsyncQueue(0).stats().limit, 1, '0 夹到 1')
  assert.equal(createAsyncQueue(999).stats().limit, 16, '太大夹到 16')
  assert.equal(createAsyncQueue(undefined).stats().limit, 3, '默认 3')
  console.log('6) 并发闸门 ok')
}

console.log('ok')
