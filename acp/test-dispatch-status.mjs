// 派发状态推导测试：node acp/test-dispatch-status.mjs
// A 完成不能把 B 从 RUNNING 变成 INTERRUPTED；只有对账时已确认死亡的 start-only 才收尸。
import assert from 'node:assert/strict'
import {
  buildPanelDispatchState,
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

console.log('dispatch status ok')
