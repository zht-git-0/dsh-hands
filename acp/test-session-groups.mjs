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
const { groupSessionsByCwd } = mod
assert.equal(typeof groupSessionsByCwd, 'function', '导出 groupSessionsByCwd')

const row = (key, cwd, lastAt, extra = {}) => ({ key, cwd, lastAt, name: key, turns: 1, ...extra })

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

// ── 2) 空 cwd 单独归组，label 为空（UI 显示「未分组」）──────────────────────
{
  const groups = groupSessionsByCwd([
    row('x', '', '2026-11-19T10:00:00Z'),
    row('y', '   ', '2026-11-19T09:00:00Z'),
    row('z', 'D:\\p\\one', '2026-11-19T08:00:00Z'),
  ])
  assert.equal(groups.length, 2)
  const empty = groups.find((g) => g.cwd === '')
  assert.ok(empty, '空 cwd 归到一组')
  assert.equal(empty.label, '')
  assert.equal(empty.sessions.length, 2, '空白 cwd 也并进未分组')
  console.log('2) 未分组 ok')
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
