// createHandsStore 测试：node acp/test-store.mjs
// 只碰 store 和纯函数，用假 fetch / localStorage / EventSource；
// react 用最小 stub 顶掉，任何组件都不渲染（factory 里的 hooks 不会跑）。
import assert from 'node:assert/strict'

globalThis.window = {
  __ModuleLoader__: {
    load(def) {
      globalThis.__def = def
    },
  },
}

await import('../client.js')
const def = globalThis.__def
assert.ok(def && def.id === 'dsh-hands', 'module loader 抓到了 client.js')

const ReactStub = {
  createElement(type, props, ...children) {
    return { type, props, children }
  },
  useCallback(fn) {
    return fn
  },
  useEffect() {},
  useLayoutEffect() {},
  useMemo(fn) {
    return fn()
  },
  useRef(value) {
    return { current: value }
  },
  useState(value) {
    return [value, () => {}]
  },
  useSyncExternalStore() {
    return null
  },
}

const mod = def.factory((name) => {
  if (name === 'react') return ReactStub
  throw new Error(`unexpected require: ${name}`)
})
const { createHandsStore } = mod
assert.equal(typeof createHandsStore, 'function', 'factory 导出了 createHandsStore')

// ── 固定数据：字段名照 index.js 的 agentsPayload / listSessions / turnsFor ──────
const AGENTS = [
  { hand: 'agy', label: 'agy · copy', running: 0, today: 2, sessions: 1, lastAt: '2026-11-18T09:00:00.000Z', ok: false, bin: 'agy', version: '' },
  { hand: 'codex', label: 'codex · planning', running: 0, today: 0, sessions: 0, lastAt: '', ok: false, bin: 'codex', version: '' },
  { hand: 'claude', label: 'claude · architecture', running: 0, today: 0, sessions: 0, lastAt: '', ok: false, bin: 'claude', version: '' },
  { hand: 'opencode', label: 'opencode · coding', running: 1, today: 5, sessions: 2, lastAt: '2026-11-18T12:00:00.000Z', ok: false, bin: 'opencode', version: '' },
]

const SESSIONS = {
  agy: [
    { key: 'agy/agy-1', hand: 'agy', name: 'agy one', sessionKey: 'agy/agy-1', conversationId: '', turns: 2, today: 2, status: 'OK', ok: true, ms: 1000, startedAt: '2026-11-18T08:00:00.000Z', lastAt: '2026-11-18T09:00:00.000Z', cwd: 'C:/agy', model: 'm-agy', excerpt: 'e', running: false, notStarted: false },
  ],
  codex: [],
  claude: [],
  opencode: [
    { key: 'opencode/alpha', hand: 'opencode', name: 'alpha', sessionKey: 'opencode/alpha', conversationId: '', turns: 2, today: 1, status: 'OK', ok: true, ms: 1000, startedAt: '2026-11-18T10:00:00.000Z', lastAt: '2026-11-18T10:00:00.000Z', cwd: 'D:/alpha', model: 'm-alpha', excerpt: 'e', running: false, notStarted: false },
    { key: 'opencode/beta', hand: 'opencode', name: 'beta', sessionKey: 'opencode/beta', conversationId: '', turns: 1, today: 1, status: 'RUNNING', ok: false, ms: 0, startedAt: '2026-11-18T12:00:00.000Z', lastAt: '2026-11-18T12:00:00.000Z', cwd: 'D:/beta', model: 'm-beta', excerpt: 'e', running: true, notStarted: false },
  ],
}

const TURNS = {
  'agy/agy-1': [
    { id: 'a2', hand: 'agy', tool: 'agy_run', startedAt: '2026-11-18T09:00:00.000Z', at: '2026-11-18T09:01:00.000Z', status: 'OK', ok: true, ms: 1000, prompt: 'agy second', excerpt: 'e2', tokens: null, cost: null, model: 'm-agy', write: false, running: false },
    { id: 'a1', hand: 'agy', tool: 'agy_run', startedAt: '2026-11-18T08:00:00.000Z', at: '2026-11-18T08:01:00.000Z', status: 'OK', ok: true, ms: 1000, prompt: 'agy first', excerpt: 'e1', tokens: null, cost: null, model: 'm-agy', write: false, running: false },
  ],
  'opencode/alpha': [
    { id: 't2', hand: 'opencode', tool: 'opencode_run', startedAt: '2026-11-18T12:00:00.000Z', at: '2026-11-18T12:01:00.000Z', status: 'OK', ok: true, ms: 1000, prompt: 'second', excerpt: 'e2', tokens: null, cost: null, model: 'm-alpha', write: true, running: false },
    { id: 't1', hand: 'opencode', tool: 'opencode_run', startedAt: '2026-11-18T11:00:00.000Z', at: '2026-11-18T11:01:00.000Z', status: 'OK', ok: true, ms: 1000, prompt: 'first', excerpt: 'e1', tokens: null, cost: null, model: 'm-alpha', write: true, running: false },
  ],
  'opencode/beta': [
    { id: 'b1', hand: 'opencode', tool: 'opencode_run', startedAt: '2026-11-18T12:00:00.000Z', at: '2026-11-18T12:00:30.000Z', status: 'RUNNING', ok: false, ms: 0, prompt: 'live', excerpt: '', tokens: null, cost: null, model: 'm-beta', write: true, running: true },
  ],
}

const BODIES = { t1: 'hello world', t2: 'second body', b1: 'beta body' }

function makeFetch() {
  const calls = []
  const fetchImpl = async (url) => {
    const u = new URL(String(url))
    calls.push(`${u.pathname}${u.search}`)
    const hand = u.searchParams.get('hand') || ''
    const key = u.searchParams.get('key') || ''
    const id = u.searchParams.get('id') || ''
    let body = null
    if (u.pathname === '/dsh-hands/agents') {
      body = { checkedAt: '2026-11-18T12:00:00.000Z', agents: AGENTS }
    } else if (u.pathname === '/dsh-hands/sessions') {
      body = { hand, sessions: SESSIONS[hand] || [] }
    } else if (u.pathname === '/dsh-hands/turns') {
      body = { key, turns: TURNS[key] || [] }
    } else if (u.pathname === '/dsh-hands/turn') {
      const from = Math.max(0, Number(u.searchParams.get('from')) || 0)
      const text = BODIES[id] || ''
      const delta = text.slice(from)
      body = { id, from, next: from + delta.length, eof: from + delta.length >= text.length, delta }
    }
    if (!body) return { ok: false, status: 404, json: async () => ({}) }
    return { ok: true, status: 200, json: async () => body }
  }
  return { fetchImpl, calls }
}

function makeStorage(initial) {
  const map = new Map(Object.entries(initial || {}))
  return {
    map,
    getItem(key) {
      return map.has(key) ? map.get(key) : null
    },
    setItem(key, value) {
      map.set(key, String(value))
    },
    removeItem(key) {
      map.delete(key)
    },
  }
}

class FakeEventSource {
  static instances = []
  constructor(url) {
    this.url = url
    this.closed = false
    this.listeners = new Map()
    FakeEventSource.instances.push(this)
  }
  addEventListener(name, fn) {
    const list = this.listeners.get(name) || []
    list.push(fn)
    this.listeners.set(name, list)
  }
  close() {
    this.closed = true
  }
  emit(name, data) {
    for (const fn of this.listeners.get(name) || []) fn({ data: JSON.stringify(data) })
  }
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0))
async function until(check, label, tries = 200) {
  for (let i = 0; i < tries; i += 1) {
    if (check()) return
    await flush()
  }
  throw new Error(`timeout: ${label}`)
}

// ── 1. refreshAll：agents/sessions/turns 都有数据，turnId 回落到最新一轮 ─────
{
  const { fetchImpl } = makeFetch()
  const store = createHandsStore({ fetchImpl, storage: makeStorage() })
  await store.refreshAll()

  const agents = store.snapshotSlice('agents')
  assert.equal(agents.agents.length, 4, 'agents 有数据')
  assert.equal(agents.phase, 'ready')
  assert.equal(agents.connected, true)

  const sessions = store.snapshotSlice('sessions')
  assert.equal(sessions.hand, 'agy', '存档为空时落到第一个 hand')
  assert.ok(sessions.sessions.length > 0, 'sessions 有数据')

  const sel = store.getSnapshot().selection
  assert.equal(sel.key, 'agy/agy-1', '选中第一个 hand 的最新会话')
  const turns = store.snapshotSlice('turns')
  assert.ok(turns.turns.length > 0, 'turns 有数据')
  assert.equal(sel.turnId, 'a2', 'turnId 回落到最后一轮（turns[0]）')

  // 同一 revision 下 selector 必须返回同一个引用，否则 useSyncExternalStore 会无限重渲
  assert.equal(store.snapshotSlice('agents'), agents)
  store.stop()
  console.log('1) refreshAll 初始数据 ok')
}

// ── 2. select：写 localStorage，turnId 跟着最新一轮补齐 ──────────────────────
{
  const { fetchImpl } = makeFetch()
  const storage = makeStorage()
  const store = createHandsStore({ fetchImpl, storage })
  await store.refreshAll()

  store.select('opencode', 'opencode/alpha')
  const saved = JSON.parse(storage.getItem('dsh.hands.sel'))
  assert.equal(saved.hand, 'opencode')
  assert.equal(saved.key, 'opencode/alpha')
  assert.ok(saved.at, '存档带 at')

  await until(() => store.getSnapshot().turnsByKey['opencode/alpha'] !== undefined, 'alpha turns')
  const turns = store.snapshotSlice('turns')
  assert.equal(turns.key, 'opencode/alpha')
  assert.equal(store.getSnapshot().selection.turnId, 't2', '选中会话后 turnId 落到最新一轮')
  assert.equal(JSON.parse(storage.getItem('dsh.hands.sel')).turnId, 't2')

  // agents 切片依赖 agents/selection/meta：选中会换引用（rail 要高亮），但 live 增量不该
  const agentsAfterSelect = store.snapshotSlice('agents')
  const liveBefore = store.snapshotSlice('live')
  store.appendLive('opencode/alpha', 't1', 'x', 1)
  assert.equal(store.snapshotSlice('agents'), agentsAfterSelect)
  assert.notEqual(store.snapshotSlice('live'), liveBefore)
  store.stop()
  console.log('2) select + localStorage ok')
}

// ── 3. SSE live：按事件归并，重复帧不重复拼，切 key 的旧帧丢掉 ─────────────
{
  FakeEventSource.instances.length = 0
  const { fetchImpl } = makeFetch()
  const storage = makeStorage({
    'dsh.hands.sel': JSON.stringify({
      hand: 'opencode',
      key: 'opencode/alpha',
      turnId: 't2',
      at: '2026-11-18T00:00:00.000Z',
    }),
  })
  const store = createHandsStore({ fetchImpl, storage, EventSourceImpl: FakeEventSource })
  store.start()
  await until(
    () =>
      store.getSnapshot().selection.key === 'opencode/alpha' &&
      store.getSnapshot().turnsByKey['opencode/alpha'] !== undefined,
    'SSE store ready',
  )
  assert.equal(store.debug().mode, 'sse', 'SSE 已连上')
  const es = FakeEventSource.instances.at(-1)
  assert.ok(es, 'EventSource 实例存在')
  assert.match(es.url, /dsh-hands\/stream\?key=opencode%2Falpha$/)

  es.emit('open', {})
  es.emit('live', { key: 'opencode/alpha', id: 't1', delta: 'hello', next: 5 })
  es.emit('live', { key: 'opencode/alpha', id: 't1', delta: 'hello', next: 5 }) // 同一帧重发
  es.emit('live', { key: 'opencode/alpha', id: 't1', delta: ' world', next: 11 })
  assert.equal(store.snapshotSlice('live').liveByTurn.t1, 'hello world')
  assert.equal(store.debug().liveApplied.get('t1'), 11)

  // 别的 key 的残留帧：不往当前会话里塞
  es.emit('live', { key: 'opencode/beta', id: 'b1', delta: 'beta body', next: 9 })
  assert.equal(store.snapshotSlice('live').liveByTurn.b1, undefined)

  // sessions / turns 事件也按事件名归并
  es.emit('agents', { revision: 9, agents: AGENTS })
  es.emit('turns', { revision: 3, key: 'opencode/alpha', turns: TURNS['opencode/alpha'] })
  assert.equal(store.snapshotSlice('turns').turns.length, 2)

  store.stop()
  const dbg = store.debug()
  assert.equal(dbg.hasSource, false, 'stop 关掉 EventSource')
  assert.equal(dbg.watchdog, false, 'stop 清掉 4s 看门狗')
  assert.equal(dbg.mode, 'idle')
  assert.ok(
    FakeEventSource.instances.every((item) => item.closed),
    '所有 EventSource 都 close 了',
  )
  console.log('3) SSE live 增量 + 去重 ok')
}

// ── 4. 存档恢复：key 失效 → 该 hand 下 lastAt 最新；turnId 失效 → 最后一轮 ──
{
  const { fetchImpl } = makeFetch()
  const storage = makeStorage({
    'dsh.hands.sel': JSON.stringify({
      hand: 'opencode',
      key: 'opencode/gone',
      turnId: 'zzz',
      at: '2026-11-18T00:00:00.000Z',
    }),
  })
  const store = createHandsStore({ fetchImpl, storage })
  await store.refreshAll()
  const sel = store.getSnapshot().selection
  assert.equal(sel.hand, 'opencode')
  assert.equal(sel.key, 'opencode/beta', 'key 不在了就选 lastAt 最新的会话')
  assert.equal(sel.turnId, 'b1', 'turnId 失效回落到最后一轮')
  store.stop()
  console.log('4) 选中恢复顺序 ok')
}

// ── 5. 没有 EventSource → 轮询；stop 清 timer ───────────────────────────────
{
  const { fetchImpl } = makeFetch()
  const store = createHandsStore({ fetchImpl, storage: makeStorage() })
  store.start()
  await until(
    () => store.debug().mode === 'poll' && !!store.getSnapshot().selection.key,
    'poll mode',
  )
  const dbg = store.debug()
  assert.equal(dbg.hasSource, false)
  assert.equal(dbg.pollAgentsTimer, true, '轮询 agents timer 在')
  assert.equal(dbg.pollTurnsTimer, true, '轮询 turns timer 在')
  assert.equal(dbg.retryTimer, true, '重试 SSE 的 timer 在')

  store.stop()
  const after = store.debug()
  assert.equal(after.pollAgentsTimer, false, 'stop 清 agents timer')
  assert.equal(after.pollTurnsTimer, false, 'stop 清 turns timer')
  assert.equal(after.retryTimer, false, 'stop 清重试 timer')
  assert.equal(after.mode, 'idle')
  console.log('5) 轮询回退 + stop 清理 ok')
}

// ── 6. loadTurnBody：from 偏移拼接，同一段拉两次不翻倍 ──────────────────────
{
  const { fetchImpl, calls } = makeFetch()
  const store = createHandsStore({ fetchImpl, storage: makeStorage() })
  const first = await store.loadTurnBody('t1', 0)
  assert.equal(first.next, 11)
  assert.match(calls.at(-1), /\/dsh-hands\/turn\?id=t1&from=0$/)
  assert.equal(store.snapshotSlice('live').liveByTurn.t1, 'hello world')

  const again = await store.loadTurnBody('t1', 0)
  assert.equal(again.delta, 'hello world')
  assert.equal(store.snapshotSlice('live').liveByTurn.t1, 'hello world', '重复 from=0 不翻倍')

  const tail = await store.loadTurnBody('t1', 6)
  assert.equal(tail.delta, 'world')
  assert.equal(store.snapshotSlice('live').liveByTurn.t1, 'hello world', '只拼超出部分')
  store.stop()
  console.log('6) loadTurnBody 增量拼接 ok')
}

// ── 7. ensureTurnBody：用 next 继续拉，直到 eof；同一轮只拉一次 ──────────────
{
  const FULL = 'abcdefghijkl'
  const calls = []
  const fetchImpl = async (url) => {
    const u = new URL(String(url))
    calls.push(`${u.pathname}${u.search}`)
    if (u.pathname === '/dsh-hands/turn') {
      const from = Math.max(0, Number(u.searchParams.get('from')) || 0)
      const delta = FULL.slice(from, from + 4)
      const next = from + delta.length
      return {
        ok: true,
        status: 200,
        json: async () => ({ id: 'c1', from, next, eof: next >= FULL.length, delta }),
      }
    }
    return { ok: false, status: 404, json: async () => ({}) }
  }
  const store = createHandsStore({ fetchImpl, storage: makeStorage() })
  const [firstA, firstB] = await Promise.all([
    store.ensureTurnBody('c1'),
    store.ensureTurnBody('c1'),
  ])
  assert.equal(firstA, true)
  assert.equal(firstB, true, '并发调用共享同一份 promise')
  assert.equal(store.snapshotSlice('live').liveByTurn.c1, FULL, '分三页拼成全文')
  assert.equal(calls.length, 3, '每页 4 字，12 字共 3 次请求')
  await store.ensureTurnBody('c1')
  assert.equal(calls.length, 3, '同一轮成功后再调不再发请求')
  store.stop()
  console.log('7) ensureTurnBody 分页补齐 + 只拉一次 ok')
}

// ── 8. cancel / rerun：POST 带 id，成功刷新 turns；失败原样回错误 ─────────────
{
  const calls = []
  let cancelOk = true
  const fetchImpl = async (url, init = {}) => {
    const u = new URL(String(url))
    const method = init.method || 'GET'
    calls.push({ method, path: u.pathname, body: init.body ? JSON.parse(init.body) : null })
    if (u.pathname === '/dsh-hands/cancel') {
      return cancelOk
        ? { ok: true, status: 200, json: async () => ({ ok: true, id: 't2', killed: true }) }
        : {
            ok: false,
            status: 404,
            json: async () => ({ ok: false, error: 'not running', id: 't2' }),
          }
    }
    if (u.pathname === '/dsh-hands/rerun') {
      return { ok: true, status: 200, json: async () => ({ ok: true, id: 'new1', sessionKey: 'opencode/alpha' }) }
    }
    if (u.pathname === '/dsh-hands/agents') {
      return { ok: true, status: 200, json: async () => ({ checkedAt: '', agents: AGENTS }) }
    }
    if (u.pathname === '/dsh-hands/sessions') {
      const hand = u.searchParams.get('hand') || ''
      return { ok: true, status: 200, json: async () => ({ hand, sessions: SESSIONS[hand] || [] }) }
    }
    if (u.pathname === '/dsh-hands/turns') {
      const key = u.searchParams.get('key') || ''
      return { ok: true, status: 200, json: async () => ({ key, turns: TURNS[key] || [] }) }
    }
    return { ok: false, status: 404, json: async () => ({}) }
  }

  const storage = makeStorage({
    'dsh.hands.sel': JSON.stringify({
      hand: 'opencode',
      key: 'opencode/alpha',
      turnId: 't2',
      at: '2026-11-18T00:00:00.000Z',
    }),
  })
  const store = createHandsStore({ fetchImpl, storage })
  await store.refreshAll()

  const cancelled = await store.cancelTurn('t2')
  assert.equal(cancelled.ok, true)
  const cancelCall = calls.find((call) => call.path === '/dsh-hands/cancel')
  assert.equal(cancelCall?.method, 'POST')
  assert.deepEqual(cancelCall?.body, { id: 't2' })
  await until(() => calls.some((call) => call.path === '/dsh-hands/turns'), 'cancel 后刷新 turns')

  const rerun = await store.rerunTurn('t2')
  assert.equal(rerun.ok, true)
  const rerunCall = calls.find((call) => call.path === '/dsh-hands/rerun')
  assert.deepEqual(rerunCall?.body, { id: 't2' })

  cancelOk = false
  const failed = await store.cancelTurn('t2')
  assert.equal(failed.ok, false)
  assert.equal(failed.error, 'not running', '失败原因透传')
  store.stop()
  console.log('8) cancel / rerun ok')
}

console.log('ok')
