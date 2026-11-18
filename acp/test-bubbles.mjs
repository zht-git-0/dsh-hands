// 气泡纯函数 + 纯展示组件测试：node acp/test-bubbles.mjs
// 不挂真 React：用最小 stub 让 h()/hooks 能跑，自己递归把函数组件展开成树。
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

const h = ReactStub.createElement
const mod = def.factory((name) => {
  if (name === 'react') return ReactStub
  throw new Error(`unexpected require: ${name}`)
})
const { resolveTurnBody, formatTurnMeta, formatTokens, formatCost, BubbleUser, BubbleAgent, MarkdownLite } = mod

assert.equal(typeof resolveTurnBody, 'function', '导出了 resolveTurnBody')
assert.equal(typeof formatTurnMeta, 'function', '导出了 formatTurnMeta')

// ── 最小渲染器：函数组件直接调用（hooks 都是 stub），只收集文本和 class ──────
function render(node) {
  if (node === null || node === undefined || typeof node === 'boolean') return null
  if (typeof node === 'string' || typeof node === 'number') return { text: String(node) }
  if (Array.isArray(node)) return node.map(render)
  if (typeof node.type === 'function') {
    const props = { ...(node.props || {}) }
    if (node.children?.length) props.children = node.children
    return render(node.type(props))
  }
  return {
    type: node.type,
    props: node.props || {},
    children: (node.children || []).map(render),
  }
}

function walk(node, visit) {
  if (!node) return
  if (Array.isArray(node)) {
    for (const child of node) walk(child, visit)
    return
  }
  visit(node)
  for (const child of node.children || []) walk(child, visit)
}

function allText(tree) {
  const out = []
  walk(tree, (node) => {
    if (typeof node.text === 'string') out.push(node.text)
  })
  return out.join('')
}

function hasClass(tree, name) {
  let hit = false
  walk(tree, (node) => {
    const className = String(node?.props?.className || '')
    if (className.split(/\s+/).includes(name)) hit = true
  })
  return hit
}

const t = (key, vars) => {
  if (key === 'v2Tokens') return 'tokens'
  if (key === 'exitCode') return 'exitCode'
  if (key === 'v2Expand') return 'expand'
  if (key === 'v2Collapse') return 'collapse'
  if (key === 'v2LoadFull') return 'loadFull'
  if (key === 'durationMinSec') return `${vars.m}m ${vars.s}s`
  if (key === 'durationMin') return `${vars.m}m`
  return key
}

// ── 1. 正文回落顺序：live > 拉取 > excerpt ─────────────────────────────────
{
  const turn = { id: 't1', hand: 'opencode', status: 'OK', ok: true, excerpt: 'EXCERPT' }

  const live = resolveTurnBody(turn, 'LIVE BODY', 'FETCHED BODY')
  assert.equal(live.text, 'LIVE BODY')
  assert.equal(live.source, 'live')

  const fetched = resolveTurnBody(turn, '', 'FETCHED BODY')
  assert.equal(fetched.text, 'FETCHED BODY')
  assert.equal(fetched.source, 'fetched')

  const excerpt = resolveTurnBody(turn, '', '')
  assert.equal(excerpt.text, 'EXCERPT')
  assert.equal(excerpt.source, 'excerpt')

  const none = resolveTurnBody({ id: 't2' }, '', '')
  assert.deepEqual(none, { text: '', source: 'none', cursor: false })

  // 非字符串输入当成没有，别把对象塞进 pre
  assert.equal(resolveTurnBody(turn, null, undefined).source, 'excerpt')
  console.log('1) resolveTurnBody 回落顺序 ok')
}

// ── 2. running 带光标标记（BubbleAgent 渲染出 Stream 的光标）────────────────
{
  const runningTurn = { id: 'r1', hand: 'opencode', status: 'RUNNING', running: true, excerpt: '' }
  const runningView = resolveTurnBody(runningTurn, 'partial output', '')
  assert.equal(runningView.cursor, true, 'running turn 标记光标')

  const runningTree = render(
    h(BubbleAgent, { t, turn: runningTurn, view: runningView, onNeedBody() {} }),
  )
  assert.ok(hasClass(runningTree, 'dsh-hands-cursor'), 'running 气泡渲染出光标 span')
  assert.match(allText(runningTree), /partial output/)

  const doneTurn = { id: 'd1', hand: 'opencode', status: 'OK', ok: true, excerpt: 'done' }
  const doneTree = render(h(BubbleAgent, { t, turn: doneTurn, view: resolveTurnBody(doneTurn, 'done body', '') }))
  assert.equal(hasClass(doneTree, 'dsh-hands-cursor'), false, '收尾后没有光标')

  // 状态 RUNNING 但没 running 字段也要算在跑
  assert.equal(resolveTurnBody({ status: 'RUNNING' }, 'x', '').cursor, true)
  console.log('2) running 光标 ok')
}

// ── 3. 元信息：耗时 / tokens / cost / exitCode / model ──────────────────────
{
  const parts = formatTurnMeta(
    {
      ms: 1234,
      tokens: { input: 100, output: 20 },
      cost: 0.012,
      exitCode: 0,
      model: 'm-alpha',
    },
    t,
  )
  const text = parts.map((part) => part.text).join(' | ')
  assert.match(text, /1\.2 s/, '耗时人读化')
  assert.match(text, /tokens 100\/20/, 'tokens 显示 in/out')
  assert.match(text, /\$0\.01/, 'cost 保留两位')
  assert.match(text, /exitCode 0/, 'exitCode 有就显示')
  assert.match(text, /m-alpha/, 'model 有就显示')

  // codex 给的是数字（in+out），opencode 给 {input,output}，claude 给 snake_case
  assert.equal(formatTokens(4321), '4321')
  assert.equal(formatTokens({ input_tokens: 12, output_tokens: 3 }), '12/3')
  assert.equal(formatTokens({ total_tokens: 999 }), '999')
  assert.equal(formatTokens(null), '')
  assert.equal(formatCost(1.239), '$1.24')
  assert.equal(formatCost(0), '')

  // 没有 ms / tokens / cost 时只剩模型，不出现空片段
  assert.deepEqual(
    formatTurnMeta({ model: 'm' }, t).map((part) => part.text),
    ['m'],
  )
  console.log('3) formatTurnMeta ok')
}

// ── 4. BubbleUser 超长截断到 2000 字 + 展开 ────────────────────────────────
{
  const prompt = 'x'.repeat(2500)
  const tree = render(h(BubbleUser, { t, prompt }))
  const text = allText(tree)
  assert.ok(text.includes('x'.repeat(2000)), '保留前 2000 字')
  assert.equal(text.includes('x'.repeat(2001)), false, '第 2001 字被截掉')
  assert.ok(text.includes('…'), '有省略号')
  assert.match(text, /expand/, '有展开按钮')
  console.log('4) BubbleUser 截断 ok')
}

// ── 5. 气泡左右对调：你（右，msgUser）/ 手下（左，msgAgent）─────────────────
{
  const userTree = render(h(BubbleUser, { t, prompt: 'ship it' }))
  assert.ok(hasClass(userTree, 'dsh-hands-v2-msg'), 'user 气泡有 msg 容器（负责 align-self）')
  assert.ok(hasClass(userTree, 'dsh-hands-v2-msgUser'), 'user 气泡靠右（msgUser）')
  assert.equal(hasClass(userTree, 'dsh-hands-v2-msgAgent'), false, 'user 气泡不混用 agent 容器')
  assert.ok(hasClass(userTree, 'dsh-hands-v2-bubbleUser'), '保留 bubbleUser 配色类')
  assert.match(allText(userTree), /youToHand/, 'user 气泡上方是「你 → 手下」小字')

  const agentTree = render(
    h(BubbleAgent, {
      t,
      turn: { id: 'a1', hand: 'opencode', status: 'OK', ok: true },
      view: resolveTurnBody({ id: 'a1', hand: 'opencode', status: 'OK', ok: true }, 'done body', ''),
      onNeedBody() {},
    }),
  )
  assert.ok(hasClass(agentTree, 'dsh-hands-v2-msgAgent'), 'agent 气泡靠左（msgAgent）')
  assert.equal(hasClass(agentTree, 'dsh-hands-v2-msgUser'), false, 'agent 气泡不混用 user 容器')
  assert.ok(hasClass(agentTree, 'dsh-hands-v2-bubbleAgent'), '保留 bubbleAgent 描边类')
  assert.ok(hasClass(agentTree, 'dsh-hands-v2-bubbleIcon'), 'agent 气泡上方带身份图标')
  assert.match(allText(agentTree), /handOpencode/, 'agent 小字用手下名字')
  console.log('5) 气泡左右对调 ok')
}

// ── 6) 自带的极简 markdown：原生组件拿不到时兜底 ────────────────────────────
{
  const render = (node) => {
    if (node === null || node === undefined || typeof node === 'boolean') return null
    if (typeof node === 'string' || typeof node === 'number') return { text: String(node) }
    if (Array.isArray(node)) return node.map(render)
    if (typeof node === 'function') return render(node({}))
    if (typeof node !== 'object') return null
    if (typeof node.type === 'function') {
      const props = { ...(node.props || {}) }
      if (node.children?.length) props.children = node.children
      return render(node.type(props))
    }
    return { type: node.type, props: node.props || {}, children: (node.children || []).map(render) }
  }
  const collect = (tree, out = []) => {
    if (!tree) return out
    if (Array.isArray(tree)) { for (const t of tree) collect(t, out); return out }
    if (tree.type) out.push(tree)
    for (const c of tree.children || []) collect(c, out)
    return out
  }
  const texts = (tree) => collect(tree).map((n) => (n.children || []).map((c) => c.text || '').join('')).join(' | ')

  // 围栏代码块 → pre.dsh-hands-mdCode
  const fence = render(h(MarkdownLite, { text: '说明\n```js\nconst a = 1\n```\n结尾' }))
  const pres = collect(fence).filter((n) => n.type === 'pre')
  assert.equal(pres.length, 1, '一个围栏块')
  assert.ok(pres[0].props.className.includes('dsh-hands-mdCode'), '代码块类名')
  assert.equal(pres[0].props['data-lang'], 'js', '记住语言')
  assert.ok(texts(fence).includes('const a = 1'), '代码正文在')

  // 标题 / 列表 / 引用
  const rich = render(h(MarkdownLite, { text: '# 标题\n- 第一\n- 第二\n> 引用' }))
  assert.ok(collect(rich).some((n) => n.props?.className === 'dsh-hands-mdHeading'), '标题')
  assert.ok(collect(rich).some((n) => n.type === 'ul'), '列表')
  assert.ok(collect(rich).some((n) => n.type === 'blockquote'), '引用')

  // 行内三种标记
  const inline = render(h(MarkdownLite, { text: 'a `code` **粗** *斜*' }))
  const kinds = collect(inline).map((n) => n.type)
  assert.ok(kinds.includes('code'), '行内代码')
  assert.ok(kinds.includes('strong'), '加粗')
  assert.ok(kinds.includes('em'), '斜体')

  // 空文本不炸
  assert.ok(render(h(MarkdownLite, { text: '' })), '空文本也有容器')
  console.log('6) 极简 markdown 兜底 ok')
}

console.log('ok')
