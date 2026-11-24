// 派发状态推导测试：node acp/test-dispatch-status.mjs
// A 完成不能把 B 从 RUNNING 变成 INTERRUPTED；只有对账时已确认死亡的 start-only 才收尸。
import assert from 'node:assert/strict'
import {
  buildPanelDispatchState,
  findAsyncDispatchStart,
  isAsyncJobActive,
  mergeJobRecords,
  planLogReconciliation,
  turnsFor,
} from '../index.js'

const startA = {
  v: 2, phase: 'start', id: 'A', hand: 'opencode', tool: 'opencode_run',
  session: 'shared', sessionKey: 'opencode/shared', conversationId: '',
  cwd: 'D:/work', prompt: 'A', startedAt: '2026-11-25T10:00:00.000Z', at: '2026-11-25T10:00:00.000Z',
}
const endA = {
  v: 2, phase: 'end', id: 'A', hand: 'opencode', tool: 'opencode_run',
  session: 'shared', sessionKey: 'opencode/shared', conversationId: '',
  cwd: 'D:/work', prompt: 'A', startedAt: startA.startedAt, at: '2026-11-25T10:05:00.000Z',
  status: 'OK', ok: true, ms: 300000, excerpt: 'A done',
}
const startB = {
  v: 2, phase: 'start', id: 'B', hand: 'opencode', tool: 'opencode_run',
  session: 'shared', sessionKey: 'opencode/shared', conversationId: '',
  cwd: 'D:/work', prompt: 'B', startedAt: '2026-11-25T10:06:00.000Z', at: '2026-11-25T10:06:00.000Z',
}
const staleInterruptedB = {
  ...startB, v: 2, phase: 'end', at: '2026-11-25T10:07:00.000Z',
  status: 'INTERRUPTED', ok: false, interrupted: true, error: 'interrupted: host restarted',
}

// ── 1) 合并日志：A 的 end 只生成 A，不会碰 B ────────────────────────────────
{
  const jobs = mergeJobRecords([startA, endA, startB])
  assert.equal(jobs.length, 1)
  assert.equal(jobs[0].id, 'A')
  assert.equal(jobs[0].status, 'OK')
  console.log('1) A 收尾不生成/修改 B ok')
}

// ── 2) 活跃判定：pid 活着优先；无 pid 的 RUNNING 也先当活着的 ────────────────
{
  assert.equal(isAsyncJobActive({ id: 'B', status: 'RUNNING', pid: 123 }, { isAlive: () => true }), true)
  assert.equal(isAsyncJobActive({ id: 'B', status: 'RUNNING', pid: 123 }, { isAlive: () => false }), false)
  assert.equal(isAsyncJobActive({ id: 'B', status: 'RUNNING' }, { isAlive: () => false }), true)
  assert.equal(isAsyncJobActive({ id: 'B', status: 'ORPHAN' }, { isAlive: () => false }), false)
  assert.equal(isAsyncJobActive({ id: 'B', status: 'RUNNING', endedAt: 'x' }, { isAlive: () => true }), false)
  console.log('2) isAsyncJobActive ok')
}

// ── 3) 启动对账：B 仍 RUNNING/pid 活着 → 不收尸；pid 真死 → 才收尸 ──────────
{
  const records = [startA, endA, startB]
  const alivePlan = planLogReconciliation(records, { B: { id: 'B', status: 'RUNNING', pid: 123 } }, { isAlive: () => true })
  assert.deepEqual(alivePlan.interrupt, [])
  assert.deepEqual(alivePlan.active, ['B'])

  const deadPlan = planLogReconciliation(records, { B: { id: 'B', status: 'RUNNING', pid: 123 } }, { isAlive: () => false })
  assert.deepEqual(deadPlan.interrupt.map((x) => x.id), ['B'])
  assert.deepEqual(deadPlan.active, [])

  const noPidPlan = planLogReconciliation(records, { B: { id: 'B', status: 'RUNNING' } }, { isAlive: () => false })
  assert.deepEqual(noPidPlan.interrupt, [], '无 pid 时不能确认死亡，RUNNING 不贸然收尸')
  console.log('3) 启动对账只收尸真死任务 ok')
}

// ── 4) A 完成时 B 仍 RUNNING：历史/turn 状态必须是 RUNNING ──────────────────
{
  const records = [startA, endA, startB]
  const asyncJobs = { B: { id: 'B', hand: 'opencode', status: 'RUNNING', pid: 123 } }
  const panel = buildPanelDispatchState(records, asyncJobs, [], { isAlive: () => true })
  assert.deepEqual(panel.jobs.map((x) => x.id), ['A'])
  assert.deepEqual(panel.running.map((x) => x.id), ['B'])
  assert.equal(panel.running[0].status, 'RUNNING')
  const turns = turnsFor(panel.jobs, panel.running, 'opencode/shared')
  assert.equal(turns.find((x) => x.id === 'A').status, 'OK')
  assert.equal(turns.find((x) => x.id === 'B').status, 'RUNNING')
  assert.equal(turns.find((x) => x.id === 'B').running, true)
  console.log('4) A 完成时 B 仍 RUNNING ok')
}

// ── 5) 旧误判 INTERRUPTED 被活进程纠正；真死任务保持 INTERRUPTED ────────────
{
  const records = [startA, endA, startB, staleInterruptedB]
  const alive = buildPanelDispatchState(records, { B: { id: 'B', status: 'RUNNING', pid: 123 } }, [], { isAlive: () => true })
  assert.equal(alive.jobs.some((x) => x.id === 'B'), false)
  assert.equal(alive.running.find((x) => x.id === 'B')?.status, 'RUNNING')

  const dead = buildPanelDispatchState(records, { B: { id: 'B', status: 'RUNNING', pid: 123 } }, [], { isAlive: () => false })
  assert.equal(dead.running.length, 0)
  assert.equal(dead.jobs.find((x) => x.id === 'B')?.status, 'INTERRUPTED')
  console.log('5) 活进程纠错 / 真死保持中断 ok')
}

// ── 6) 真实 end 优先于过期 asyncState；当前 RUNNING 优先于重复历史 ──────────
{
  const realEndB = { ...staleInterruptedB, phase: 'end', status: 'OK', ok: true, interrupted: undefined, at: '2026-11-25T10:08:00.000Z' }
  const panel = buildPanelDispatchState([startA, endA, startB, realEndB], { B: { id: 'B', status: 'RUNNING', pid: 123 } }, [], { isAlive: () => true })
  assert.equal(panel.running.length, 0)
  assert.equal(panel.jobs.find((x) => x.id === 'B')?.status, 'OK')

  const current = { ...startB, status: 'RUNNING', output: 'live' }
  const panel2 = buildPanelDispatchState([startA, endA, startB, staleInterruptedB], {}, [current], { isAlive: () => false })
  assert.equal(panel2.running[0].id, 'B')
  assert.equal(panel2.jobs.some((x) => x.id === 'B'), false)
  console.log('6) 真实 end / 当前 RUNNING 优先级 ok')
}

// ── 7) 老 hands_run UUID 与短 ID start 唯一匹配，不产生第二条 RUNNING ───────
{
  const at = '2026-11-25T11:00:00.000Z'
  const start = {
    ...startB,
    id: 'mwuxwdg3-1',
    tool: 'hands_run',
    prompt: '检查面板渲染',
    tool: 'hands_run',
    startedAt: at,
    at,
    session: 'dsh-hands 优化',
    sessionKey: 'opencode/dsh-hands 优化',
    conversationId: 'ses_df8dbfeb4ffeLPsZ206DNMkk6b',
    cwd: 'D:\\Program\\projects\\dsh-hands',
  }
  const asyncJob = {
    id: '53c5a503-0580-4f1e-96f7-d790265100d0',
    hand: 'opencode',
    tool: 'hands_run',
    sessionId: 'session-caller',
    prompt: '检查面板渲染',
    startedAt: Date.parse(at) + 6,
    status: 'RUNNING',
  }
  assert.equal(findAsyncDispatchStart(asyncJob, [start])?.id, start.id, '老记录按提示词/时间唯一回推')
  const panel = buildPanelDispatchState([start], { job: asyncJob }, [{ ...start, status: 'RUNNING' }], { isAlive: () => true })
  assert.deepEqual(panel.running.map((x) => x.id), [start.id], '真实 RUNNING 与恢复记录不能各来一条')
  assert.equal(panel.running[0].session, 'dsh-hands 优化')

  const recovered = buildPanelDispatchState([start], { job: asyncJob }, [], { isAlive: () => true })
  assert.deepEqual(recovered.running.map((x) => x.id), [start.id], '重启后只恢复真实派发 id')
  assert.equal(recovered.running[0].conversationId, start.conversationId)
  assert.equal(recovered.running[0].cwd, start.cwd)
  assert.ok(!JSON.stringify(recovered).includes('临时-'), '不能再合成临时 key')
  console.log('7) 老 UUID 恢复合回真实派发 ok')
}

// ── 8) 显式 dispatchId 优先；歧义候选不硬合并 ──────────────────────────────
{
  const at = '2026-11-25T11:10:00.000Z'
  const start = { ...startB, id: 'run-explicit', prompt: 'same', startedAt: at, at }
  const asyncJob = { id: 'job-explicit', dispatchId: start.id, hand: 'opencode', tool: 'hands_run', prompt: 'same', startedAt: Date.parse(at), status: 'RUNNING' }
  assert.equal(findAsyncDispatchStart(asyncJob, [start])?.id, start.id)

  const duplicate = { ...start, id: 'run-other' }
  const legacy = { ...asyncJob, dispatchId: '' }
  assert.equal(findAsyncDispatchStart(legacy, [start, duplicate]), null, '同提示词同时间有歧义时不猜')
  console.log('8) dispatchId 优先 / 歧义不合并 ok')
}

// ── 9) start 丢失时从 asyncState + 索引恢复；未知 sid 用短码兜底 ────────────
{
  const sid = 'ses_df8dbfeb4ffeLPsZ206DNMkk6b'
  const asyncJob = {
    id: 'job-no-log',
    dispatchId: 'run-no-log',
    hand: 'opencode',
    tool: 'hands_run',
    sessionId: 'session-caller',
    conversationId: sid,
    prompt: 'no log',
    startedAt: Date.parse('2026-11-25T11:20:00.000Z'),
    status: 'RUNNING',
  }
  const panel = buildPanelDispatchState([], { job: asyncJob }, [], {
    isAlive: () => true,
    sessionIndexes: { opencode: { 'dsh-hands 优化': { id: sid, cwd: 'D:/dsh-hands' } } },
  })
  assert.equal(panel.running[0].id, 'run-no-log')
  assert.equal(panel.running[0].session, 'dsh-hands 优化')
  assert.equal(panel.running[0].cwd, 'D:/dsh-hands')
  assert.equal(panel.running[0].sessionId, 'session-caller', '调用方 id 仍只用于回传')

  const unknown = buildPanelDispatchState([], {
    job: { ...asyncJob, id: 'job-unknown', dispatchId: 'run-unknown', conversationId: 'ses_unknown1234567890' },
  }, [], { isAlive: () => true, sessionIndexes: { opencode: {} } })
  assert.equal(unknown.running[0].session, '未命名会话（ses_unkn）')
  assert.equal(unknown.running[0].hand, 'opencode')
  assert.equal(unknown.running[0].cwd, '')
  console.log('9) asyncState 元数据恢复 / 未知 sid 兜底 ok')
}

// ── 10) 真 end 优先于过期 asyncState，即使两者 id 不同 ─────────────────────
{
  const at = '2026-11-25T11:30:00.000Z'
  const start = { ...startB, id: 'run-ended', tool: 'hands_run', prompt: 'ended', startedAt: at, at }
  const end = { ...start, phase: 'end', status: 'OK', ok: true, at: '2026-11-25T11:31:00.000Z' }
  const asyncJob = { id: 'old-uuid', hand: 'opencode', tool: 'hands_run', prompt: 'ended', startedAt: Date.parse(at) + 5, status: 'RUNNING' }
  const panel = buildPanelDispatchState([start, end], { job: asyncJob }, [], { isAlive: () => true })
  assert.equal(panel.running.length, 0)
  assert.equal(panel.jobs.find((x) => x.id === start.id)?.status, 'OK')
  console.log('10) 跨 id 真 end 优先 ok')
}

console.log('dispatch status ok')
