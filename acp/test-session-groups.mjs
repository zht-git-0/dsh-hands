// 会话按工作目录分组的测试：node acp/test-session-groups.mjs
// 只测纯函数 groupSessionsByCwd（先找项目目录、再找会话）。
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
  useCallback: (fn) => fn,
  useEffect() {},
  useLayoutEffect() {},
  useMemo: (fn) => fn(),
  useRef: (value) => ({ current: value }),
  useState: (value) => [value, () => {}],
  useSyncExternalStore() {
    return null
  },
}

const mod = def.factory((name) => {
  if (name === 'react') return ReactStub
  throw new Error(`unexpected require: ${name}`)
})
const { groupSessionsByCwd, sessionDisplayName } = mod
assert.equal(typeof groupSessionsByCwd, 'function', '导出 groupSessionsByCwd')
assert.equal(typeof sessionDisplayName, 'function', '导出 sessionDisplayName')

const row = (key, cwd, lastAt, extra = {}) => ({ key, hand: 'opencode', cwd, lastAt, name: key, turns: 1, ...extra })

// ── 1) 按 cwd 分组，组内/组间都按最近时间倒序 ──────────────────────────────
{
  const sessions = [
    row('a1', 'D:\\projects\\alpha', '2026-11-19T10:00:00Z'),
    row('b1', 'D:\\projects\\beta', '2026-11-19T11:00:00Z'),
    row('a2', 'D:\\projects\\alpha', '2026-11-19T12:00:00Z'),
    row('c1', 'D:/projects/gamma', '2026-11-18T09:00:00Z'),
  ]
  const groups = groupSessionsByCwd(sessions)
  assert.equal(groups.length, 3, '三个目录')
  assert.deepEqual(groups.map((g) => g.label), ['alpha', 'beta', 'gamma'], '组按最近活动倒序')
  assert.deepEqual(groups[0].sessions.map((s) => s.key), ['a2', 'a1'], '组内按最近时间倒序')
  assert.equal(groups[0].cwd, 'D:\\projects\\alpha', '保留完整 cwd')
  console.log('1) 分组与排序 ok')
}

// ── 2) 空 cwd 按 hand 分组，不出现「未分组」──────────────────────────────────
{
  const groups = groupSessionsByCwd([
    row('x', '', '2026-11-19T10:00:00Z'),
    row('y', '   ', '2026-11-19T09:00:00Z'),
    row('z', 'D:\\p\\one', '2026-11-19T08:00:00Z'),
    row('claude-unknown', '', '2026-11-19T07:00:00Z', { hand: 'claude' }),
  ])
  assert.equal(groups.length, 3, '两个未知目录 hand + 一个真实目录')
  const empty = groups.find((g) => g.cwd === '' && g.hand === 'opencode')
  assert.ok(empty, 'opencode 的空 cwd 归到自己的组')
  assert.equal(empty.label, 'opencode')
  assert.equal(empty.sessions.length, 2, '同 hand 的空白 cwd 合并')
  assert.equal(groups.find((g) => g.hand === 'claude')?.label, 'claude')
  assert.ok(groups.every((g) => g.label && g.label !== '未分组'), '不显示未分组')
  assert.ok(groups.every((g) => g.cwd !== 'opencode' && g.cwd !== 'claude'), '不伪造 cwd')
  console.log('2) 空 cwd 按 hand 分组 ok')
}

// ── 5) 没名字时显示 sid 短码，不显示内部 key ────────────────────────────────
{
  assert.equal(
    sessionDisplayName({ name: '', conversationId: 'ses_df8dbfeb4ffeLPsZ206DNMkk6b' }),
    '未命名会话（ses_df8d）',
  )
  assert.equal(
    sessionDisplayName({ key: 'opencode/sid:ses_unknown1234567890' }),
    '未命名会话（ses_unkn）',
  )
  assert.equal(sessionDisplayName({ key: 'opencode/临时-2026-11-25' }), '未命名会话')
  assert.equal(sessionDisplayName({ name: '真实会话' }), '真实会话')
  console.log('5) 会话标题兜底 ok')
}

// ── 3) 边界：空数组、坏行、没有时间戳 ──────────────────────────────────────
{
  assert.deepEqual(groupSessionsByCwd([]), [])
  assert.deepEqual(groupSessionsByCwd(null), [])
  const groups = groupSessionsByCwd([
    null,
    { key: 'no-time', cwd: 'D:\\p\\x', turns: 1 },
    row('t1', 'D:\\p\\x', '2026-11-19T10:00:00Z'),
  ])
  assert.equal(groups.length, 1)
  assert.equal(groups[0].sessions.length, 2, '坏行被跳过，没时间的照常归组')
  assert.equal(groups[0].sessions[0].key, 't1', '有时间的排前面')
  console.log('3) 边界 ok')
}

// ── 4) 不修改入参顺序 ──────────────────────────────────────────────────────
{
  const sessions = [
    row('old', 'D:\\p', '2026-11-18T10:00:00Z'),
    row('new', 'D:\\p', '2026-11-19T10:00:00Z'),
  ]
  const before = sessions.map((s) => s.key)
  groupSessionsByCwd(sessions)
  assert.deepEqual(sessions.map((s) => s.key), before, '纯函数不改输入数组')
  console.log('4) 不改入参 ok')
}

console.log('ok')
