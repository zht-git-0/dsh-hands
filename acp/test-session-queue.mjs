// 目标会话级串行队列：node acp/test-session-queue.mjs
import assert from 'node:assert/strict'
import {
  asyncSessionLockKeys,
  createSessionQueue,
  normalizeAsyncSessionCwd,
  normalizeSessionQueueLimit,
  planAsyncRecovery,
  buildPanelDispatchState,
  turnsFor,
} from '../index.js'

const flush = () => new Promise((resolve) => setImmediate(resolve))
const deferred = () => {
  let resolve
  let reject
  const promise = new Promise((yes, no) => {
    resolve = yes
    reject = no
  })
  return { promise, resolve, reject }
}

// 1) 锁键：hand + 目标 conversationId；没有 id 时 session + 规范化 cwd。
{
  assert.equal(normalizeSessionQueueLimit(undefined), 3)
  assert.equal(normalizeSessionQueueLimit(0), 1)
  assert.equal(normalizeSessionQueueLimit(99), 16)
  const normalizedWindows = normalizeAsyncSessionCwd('D:\\Work\\Repo\\..\\Repo')
  if (process.platform === 'win32') assert.equal(normalizedWindows, 'd:/work/repo')
  else assert.ok(normalizedWindows.endsWith('D:/Work/Repo/../Repo'))
  const named = asyncSessionLockKeys({ hand: 'opencode', session: 'same', cwd: 'D:/Work/Repo' })
  const byId = asyncSessionLockKeys({ hand: 'opencode', conversationId: 'ses_1', session: 'same', cwd: 'D:/Work/Repo' })
  assert.deepEqual(named, ['v1:opencode:name:same:cwd:d:/work/repo'])
  assert.deepEqual(byId, ['v1:opencode:id:ses_1', 'v1:opencode:name:same:cwd:d:/work/repo'])
  assert.notDeepEqual(asyncSessionLockKeys({ hand: 'codex', conversationId: 'ses_1' }), byId)
  console.log('1) 锁键与规范化 ok')
}

// 2) A 在跑时 B/C 排队；A 完成后 B 自动开跑，位置实时前移。
{
  const queue = createSessionQueue()
  const gateA = deferred()
  const gateB = deferred()
  const gateC = deferred()
  const starts = []
  const positions = []
  const keys = asyncSessionLockKeys({ hand: 'opencode', session: 'same', cwd: 'D:/repo' })
  const a = queue.enqueue({ key: 'A', keys, start: () => gateA.promise, onStart: (state) => starts.push(['A', state.status]) })
  const b = queue.enqueue({ key: 'B', keys, start: () => gateB.promise, onStart: (state) => starts.push(['B', state.status]), onQueue: (state) => positions.push(['B', state.position]) })
  const c = queue.enqueue({ key: 'C', keys, start: () => gateC.promise, onStart: (state) => starts.push(['C', state.status]), onQueue: (state) => positions.push(['C', state.position]) })
  assert.equal(a.status, 'RUNNING')
  assert.equal(b.status, 'QUEUED')
  assert.equal(b.position, 1)
  assert.equal(c.position, 2)
  await flush()
  assert.deepEqual(starts, [['A', 'RUNNING']])
  gateA.resolve({ status: 'OK' })
  await flush()
  assert.deepEqual(starts, [['A', 'RUNNING'], ['B', 'RUNNING']])
  assert.ok(positions.some(([id, position]) => id === 'C' && position === 1), 'C 的位置从 2 前移到 1')
  gateB.resolve({ status: 'ERROR' })
  await flush()
  assert.deepEqual(starts.at(-1), ['C', 'RUNNING'], '失败也释放锁并启动队首')
  gateC.resolve({ status: 'OK' })
  await Promise.all([a.promise, b.promise, c.promise])
  await flush()
  assert.deepEqual(queue.stats(), { limit: 3, sessions: 0, waiting: 0 }, '队列空后清锁')
  console.log('2) 同会话串行 / 自动接棒 ok')
}

// 3) 默认等待上限 3，第 4 个驳回；取消排队项后位置重排。
{
  const queue = createSessionQueue()
  const gates = Array.from({ length: 4 }, () => deferred())
  const keys = ['same']
  const a = queue.enqueue({ key: 'A', keys, start: () => gates[0].promise })
  const b = queue.enqueue({ key: 'B', keys, start: () => gates[1].promise })
  const c = queue.enqueue({ key: 'C', keys, start: () => gates[2].promise })
  const d = queue.enqueue({ key: 'D', keys, start: () => gates[3].promise })
  assert.deepEqual([b.position, c.position, d.position], [1, 2, 3])
  const full = queue.enqueue({ key: 'E', keys, start: () => {} })
  assert.equal(full.accepted, false)
  assert.equal(full.limit, 3)
  assert.equal(queue.cancel('B'), true)
  assert.equal(queue.position('C'), 1)
  assert.equal(queue.position('D'), 2)
  assert.deepEqual(await b.promise, { cancelled: true })
  gates[0].resolve({ cancelled: true })
  await flush()
  assert.equal(queue.position('A'), null, 'A 已结束，取消语义由任务结果表示')
  assert.equal(queue.position('C'), 0, 'C 已启动')
  assert.equal(queue.position('D'), 1, 'D 的位置前移')
  gates[2].resolve({ status: 'OK' })
  await flush()
  assert.equal(queue.position('D'), 0, 'D 已启动')
  gates[3].resolve({ status: 'OK' })
  await Promise.all([a.promise, c.promise, d.promise])
  console.log('3) 队列满 / 取消重排 ok')
}

// 4) 运行中的 A 以 cancelled 结果结束时，B 照样开跑；不同会话互不影响。
{
  const queue = createSessionQueue()
  const gateA = deferred()
  const gateB = deferred()
  const gateOther = deferred()
  const starts = []
  const a = queue.enqueue({ key: 'A', keys: ['same'], start: () => gateA.promise, onStart: () => starts.push('A') })
  const b = queue.enqueue({ key: 'B', keys: ['same'], start: () => gateB.promise, onStart: () => starts.push('B') })
  const other = queue.enqueue({ key: 'X', keys: ['other'], start: () => gateOther.promise, onStart: () => starts.push('X') })
  await flush()
  assert.deepEqual(starts, ['A', 'X'], '不同会话并行')
  gateA.resolve({ cancelled: true })
  await flush()
  assert.deepEqual(starts, ['A', 'X', 'B'], '取消 A 后 B 自动开跑')
  gateB.resolve({ status: 'OK' })
  gateOther.resolve({ status: 'OK' })
  await Promise.all([a.promise, b.promise, other.promise])
  console.log('4) 取消接棒 / 跨会话并行 ok')
}

// 5) 新会话先按 name+cwd 排队，拿到 conversationId 后别名合并，不会破锁。
{
  const queue = createSessionQueue()
  const gateA = deferred()
  const gateB = deferred()
  const starts = []
  const nameKeys = asyncSessionLockKeys({ hand: 'claude', session: 'same', cwd: 'D:/repo' })
  const a = queue.enqueue({ key: 'A', keys: nameKeys, start: () => gateA.promise })
  const b = queue.enqueue({ key: 'B', keys: nameKeys, start: () => gateB.promise, onStart: () => starts.push('B') })
  assert.equal(queue.addAliases('A', asyncSessionLockKeys({ hand: 'claude', conversationId: 'ses_same', session: 'same', cwd: 'D:/repo' })), true)
  const c = queue.enqueue({ key: 'C', keys: asyncSessionLockKeys({ hand: 'claude', conversationId: 'ses_same' }), start: () => {} })
  assert.equal(c.status, 'QUEUED')
  assert.equal(c.position, 2, '只用 conversationId 的新任务也进同一 lane')
  gateA.resolve({ status: 'OK' })
  await flush()
  assert.deepEqual(starts, ['B'])
  gateB.resolve({ status: 'OK' })
  await flush()
  gateA.promise.catch(() => {})
  await a.promise
  await b.promise
  console.log('5) conversationId 别名合并 ok')
}

// 6) 重启不重放未启动队列：明确 CANCELLED/discard，不误判 RUNNING。
{
  const state = {
    jobs: {
      q1: { id: 'q1', status: 'QUEUED', queuePosition: 1, startedAt: 1 },
      q2: { id: 'q2', status: 'QUEUED', queuePosition: 2, startedAt: 2 },
      old: { id: 'old', status: 'RUNNING', startedAt: 3 },
    },
  }
  const plan = planAsyncRecovery(state, { isAlive: () => false })
  assert.deepEqual(plan.queued, ['q1', 'q2'])
  assert.deepEqual(plan.running, ['old'], '旧的无 pid RUNNING 仍按原恢复策略处理')
  assert.ok(!plan.orphan.includes('q1'))
  console.log('6) 重启排队安全丢弃计划 ok')
}

// 7) 面板数据：QUEUED 不进 running，历史/轮次保留状态和位置。
{
  const queued = {
    id: 'q1',
    dispatchId: 'q1',
    hand: 'opencode',
    tool: 'hands_run',
    session: 'same',
    sessionKey: 'opencode/same',
    cwd: 'D:/repo',
    prompt: 'queued work',
    startedAt: Date.parse('2026-11-25T10:00:00.000Z'),
    status: 'QUEUED',
    queuePosition: 2,
    queueLimit: 3,
    sessionLockKey: 'v1:opencode:name:same:cwd:d:/repo',
  }
  const running = {
    id: 'r1',
    hand: 'opencode',
    tool: 'hands_run',
    session: 'same',
    sessionKey: 'opencode/same',
    prompt: 'running work',
    startedAt: '2026-11-25T10:01:00.000Z',
    status: 'RUNNING',
  }
  const panel = buildPanelDispatchState([], { q1: queued }, [running], { isAlive: () => true })
  assert.deepEqual(panel.running.map((entry) => entry.id), ['r1'])
  assert.deepEqual(panel.queued.map((entry) => entry.id), ['q1'])
  assert.equal(panel.queued[0].running, false)
  assert.equal(panel.queued[0].queuePosition, 2)
  assert.ok(panel.jobs.some((entry) => entry.id === 'q1' && entry.status === 'QUEUED'), '历史里保留 QUEUED')
  const turns = turnsFor(panel.jobs, panel.running, 'opencode/same')
  const queuedTurn = turns.find((turn) => turn.id === 'q1')
  assert.equal(queuedTurn.status, 'QUEUED')
  assert.equal(queuedTurn.running, false)
  assert.equal(queuedTurn.queued, true)
  assert.equal(queuedTurn.queuePosition, 2)
  console.log('7) QUEUED 接口/面板数据 ok')
}

// 8) 重启后仍存活的旧进程先占锁，pid 死亡后再释放给队列。
{
  const queue = createSessionQueue()
  const token = queue.reserve(['v1:opencode:id:ses_live'])
  assert.ok(token)
  const starts = []
  const waiting = queue.enqueue({ key: 'new', keys: ['v1:opencode:id:ses_live'], start: () => {}, onStart: () => starts.push('new') })
  assert.equal(waiting.status, 'QUEUED')
  assert.equal(waiting.position, 1)
  await flush()
  assert.deepEqual(starts, [])
  assert.equal(queue.release(token), true)
  await flush()
  assert.deepEqual(starts, ['new'])
  await waiting.promise
  console.log('8) 恢复进程会话锁 ok')
}

console.log('ok')
