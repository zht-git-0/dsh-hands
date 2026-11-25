// 气泡纯函数 + 纯展示组件测试：node acp/test-bubbles.mjs
// 不挂真 React：用最小 stub 让 h()/hooks 能跑，自己递归把函数组件展开成树。
import assert from 'node:assert/strict'
import { deriveBlocksFromText as serverDeriveBlocksFromText } from '../index.js'
import { RICH_MARKDOWN, STREAM_PARTIAL_FENCE, STREAM_PARTIAL_TABLE, STREAM_PARTIAL_INLINE } from './markdown-fixture.mjs'

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
const {
  resolveTurnBody,
  formatTurnMeta,
  formatTokens,
  formatCost,
  isQueued,
  queuePositionOf,
  toneOf,
  statusLabel,
  statusLabelWithQueue,
  turnIsRunning,
  asyncBarState,
  deriveBlocksFromText,
  mergeTurnsById,
  BubbleUser,
  BubbleAgent,
  MarkdownLite,
  MarkdownBlock,
  Turn,
} = mod

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
  if (key === 'asyncQueued') return 'QUEUED'
  if (key === 'queueAhead') return `${vars?.n ?? 0} ahead`
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

// ── 2b. QUEUED 压过陈旧 running：无光标、无运行计数、带安全队列位置 ────────
{
  const queuedTurn = {
    id: 'q1',
    hand: 'opencode',
    status: 'QUEUED',
    running: true,
    queued: true,
    queuePosition: 2,
    queueLimit: 4,
    sessionLockKey: 'opencode/sid:q1',
    excerpt: 'queued excerpt',
  }

  assert.equal(isQueued(queuedTurn), true)
  assert.equal(toneOf(queuedTurn), 'queued', 'queued 用非运行 tone')
  assert.equal(turnIsRunning(queuedTurn), false, 'QUEUED 压过 stale running=true')
  assert.equal(statusLabel(queuedTurn, t), 'QUEUED')
  assert.equal(statusLabelWithQueue(queuedTurn, t), 'QUEUED · 2 ahead')

  // queued 标记也优先，兼容状态字段还没更新完的快照。
  assert.equal(turnIsRunning({ status: 'RUNNING', running: true, queued: true }), false)
  assert.equal(toneOf({ status: 'RUNNING', running: true, queued: true }), 'queued')

  for (const view of [
    resolveTurnBody(queuedTurn, 'stale live', 'fetched'),
    resolveTurnBody(queuedTurn, '', 'fetched'),
    resolveTurnBody(queuedTurn, '', ''),
  ]) {
    assert.equal(view.cursor, false, 'QUEUED 的正文来源一律不显示流式光标')
  }
  const queuedTree = render(
    h(BubbleAgent, { t, turn: queuedTurn, view: resolveTurnBody(queuedTurn, 'stale live', '') }),
  )
  assert.equal(hasClass(queuedTree, 'dsh-hands-cursor'), false)
  const queuedBlocksTree = render(
    h(BubbleAgent, {
      t,
      turn: { ...queuedTurn, blocks: [{ kind: 'text', text: 'stale block' }] },
      view: resolveTurnBody(queuedTurn, '', ''),
    }),
  )
  assert.equal(hasClass(queuedBlocksTree, 'dsh-hands-cursor'), false, '分块正文也不显示光标')

  // 同步/真正 RUNNING 的判断保持不变。
  assert.equal(turnIsRunning({ status: 'RUNNING', running: false }), true)
  assert.equal(toneOf({ status: 'RUNNING', running: false }), 'running')
  assert.equal(turnIsRunning({ status: 'OK', running: false }), false)

  for (const value of [undefined, null, '', Number.NaN, Number.POSITIVE_INFINITY, -3]) {
    assert.equal(queuePositionOf({ queuePosition: value }), 0, `非法队列位置 ${value} 回落 0`)
  }
  assert.equal(queuePositionOf({ queuePosition: '2.9' }), 2)
  assert.equal(statusLabelWithQueue({ status: 'QUEUED' }, t), 'QUEUED · 0 ahead')

  const queuedMeta = formatTurnMeta({ ...queuedTurn, ms: 1234 }, t)
  assert.equal(queuedMeta[0].key, 'queue')
  assert.equal(queuedMeta[0].text, '2 ahead')
  assert.equal(formatTurnMeta({ status: 'QUEUED' }, t)[0].text, '0 ahead')
  assert.equal(
    formatTurnMeta({ status: 'RUNNING', ms: 1234 }, t).some((part) => part.key === 'queue'),
    false,
    '同步轮次不混入队列元信息',
  )

  const store = {
    getSnapshot() {
      return { liveByTurn: {} }
    },
    ensureTurnBody() {},
    selectTurn() {},
  }
  const turnTree = render(h(Turn, { store, t, turn: queuedTurn, active: true, autoBody: true }))
  assert.match(allText(turnTree), /QUEUED/)
  assert.match(allText(turnTree), /2 ahead/)
  assert.equal(hasClass(turnTree, 'dsh-hands-cursor'), false)

  const liveQueued = { ...queuedTurn, id: 'q-live', delivery: 'pending' }
  const persistedQueued = {
    ...queuedTurn,
    id: 'q-persisted',
    running: false,
    queuePosition: 3,
    delivery: 'pending',
  }
  const queuedOnly = asyncBarState({
    live: [liveQueued],
    persisted: [persistedQueued, { ...persistedQueued, queuePosition: 99 }],
  })
  assert.equal(queuedOnly.visible, true, '只有排队任务时状态条也显示')
  assert.equal(queuedOnly.running, 0, 'stale running 不计入运行数')
  assert.equal(queuedOnly.queued, 2, 'live/persisted 去重后按任务计数')
  assert.equal(queuedOnly.failed, 0)
  assert.equal(queuedOnly.rows.length, 2)
  assert.equal(queuedOnly.rows[0], liveQueued, '汇总不重建/丢失 live 行字段')
  assert.equal(queuedOnly.rows[1], persistedQueued, '重复行保留首条原始数据')
  assert.equal(queuedOnly.rows[1].queueLimit, 4)
  assert.equal(queuedOnly.rows[1].sessionLockKey, 'opencode/sid:q1')
  assert.equal(asyncBarState({ live: [], persisted: [] }).visible, false, '纯空闲仍收起')
  const mixed = asyncBarState({
    live: [{ id: 'r1', status: 'RUNNING', running: true }],
    persisted: [{ id: 'f1', status: 'FAILED', delivery: 'failed' }],
  })
  assert.equal(mixed.visible, true)
  assert.equal(mixed.running, 1, '真正 RUNNING 仍计数')
  assert.equal(mixed.queued, 0)
  assert.equal(mixed.failed, 1, '回传失败仍计数')

  const oldJobs = Array.from({ length: 20 }, (_, index) => ({
    id: `old-${index}`, status: 'OK', running: false, delivery: 'sent', startedAt: index,
  }))
  const active = { id: 'new-running', status: 'RUNNING', running: true, delivery: 'pending', startedAt: 999 }
  const crowded = asyncBarState({ live: oldJobs, persisted: [active] })
  assert.equal(crowded.running, 1, '20 条老 OK 不会把新 RUNNING 挤出状态条')
  assert.equal(crowded.visible, true)
  assert.deepEqual(crowded.rows.map((job) => job.id), ['new-running'])

  console.log('2b) QUEUED 优先级 / 元信息 / 光标 / 异步汇总 ok')
}

// ── 2c. 轮次 blocks 合并保留 + 结构化渲染 + 可识别降级视图 ──────────────────
{
  const blocks = [
    { kind: 'text', text: '先读文件' },
    { kind: 'tool', name: 'read', detail: 'a.txt', status: 'completed' },
    { kind: 'tool', name: 'write', detail: 'b.txt', status: 'completed' },
    { kind: 'text', text: '后写结论' },
  ]
  const cache = new Map()
  const merged = mergeTurnsById(
    [{ id: 't1', blocks, localApplied: 17, bodyText: 'cached body', prompt: '旧标题' }],
    [{ id: 't1', status: 'OK', prompt: '新标题' }],
    cache,
  )
  assert.equal(merged[0].blocks, blocks, '列表刷新保留 blocks 引用')
  assert.equal(merged[0].localApplied, 17, '本地增量记账保留')
  assert.equal(merged[0].bodyText, 'cached body', '已取正文保留')
  assert.equal(merged[0].prompt, '新标题', '列表字段用新值')
  assert.equal(cache.get('t1').blocks, blocks, 'blocks 同时按 id 缓存')

  const structured = render(h(BubbleAgent, {
    t,
    turn: { id: 't1', hand: 'opencode', status: 'OK', blocks },
    view: { text: 'x'.repeat(5000), source: 'live', cursor: false },
  }))
  assert.equal(hasClass(structured, 'dsh-hands-blocks'), true, '切回后仍走 AgentBlocks')
  assert.equal(hasClass(structured, 'dsh-hands-v2-fallback'), false, '原生 blocks 不显示降级标记')
  assert.equal(allText(structured).includes('expand'), false, '结构化正文不再出现多余展开按钮')
  const structuredText = allText(structured)
  assert.ok(structuredText.indexOf('read') < structuredText.indexOf('write'), '工具顺序保留')

  const parsed = deriveBlocksFromText('正文\n→ read: a.txt\n→ write: b.txt\n结论')
  assert.deepEqual(parsed, serverDeriveBlocksFromText('正文\n→ read: a.txt\n→ write: b.txt\n结论'), '客户端兜底规则与服务端一致')
  assert.deepEqual(parsed.map((block) => block.kind), ['text', 'tool', 'tool', 'text'])
  assert.deepEqual(parsed.filter((block) => block.kind === 'tool').map((block) => block.name), ['read', 'write'])

  const fallback = render(h(BubbleAgent, {
    t,
    turn: { id: 'old', hand: 'opencode', status: 'OK' },
    view: { text: '正文\n→ read: a.txt\n→ write: b.txt\n结论', source: 'live', cursor: false },
  }))
  assert.equal(hasClass(fallback, 'dsh-hands-blocks'), true, 'blocks 缺失时先按文本规则解析')
  assert.equal(hasClass(fallback, 'dsh-hands-v2-fallback'), true, '降级视图有可见标记')
  const fallbackText = allText(fallback)
  assert.ok(fallbackText.indexOf('read') < fallbackText.indexOf('write'), '兜底解析同样保留工具顺序')

  const tail = render(h(BubbleAgent, {
    t,
    turn: { id: 'tail', hand: 'opencode', status: 'OK' },
    view: { text: `${'x'.repeat(5000)}\n→ read: tail.txt\n最新结论`, source: 'live', cursor: false },
  }))
  assert.ok(allText(tail).includes('read'), '折叠兜底展示尾部，不会从截断原文中段开始')
  assert.ok(allText(tail).includes('tail.txt'), '最新工具调用可见')
  assert.equal(hasClass(tail, 'dsh-hands-v2-fallback'), true)

  const derived = render(h(BubbleAgent, {
    t,
    turn: { id: 'derived', hand: 'opencode', status: 'OK', blocks: parsed, blocksDerived: true },
    view: { text: '正文\n→ read: a.txt\n→ write: b.txt\n结论', source: 'live', cursor: false },
  }))
  assert.equal(hasClass(derived, 'dsh-hands-blocks'), true, '服务端 derive 的 blocks 也走结构化渲染')
  assert.equal(hasClass(derived, 'dsh-hands-v2-fallback'), true, '服务端降级来源也标明')
  console.log('2c) blocks 合并 / 结构化渲染 / 文本降级 ok')
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

  // 围栏代码块 → 带语言/复制按钮的卡片，正文在独立横向滚动区。
  const fence = render(h(MarkdownLite, { text: '说明\n```js\nconst a = 1\n```\n结尾' }))
  const codeCards = collect(fence).filter((n) => n.props?.className === 'dsh-hands-mdCode')
  assert.equal(codeCards.length, 1, '一个围栏块')
  assert.equal(codeCards[0].props['data-lang'], 'js', '记住语言')
  const fencePre = collect(fence).find((n) => n.type === 'pre')
  assert.equal(fencePre.props.className, 'dsh-hands-mdCodeBody', '代码正文使用独立滚动容器')
  assert.ok(texts(fence).includes('const a = 1'), '代码正文在')
  const fenceButton = collect(fence).find((n) => n.type === 'button')
  assert.equal(fenceButton.props.className, 'dsh-hands-mdCopy', '代码块带复制按钮')
  assert.equal(typeof fenceButton.props.onClick, 'function', '复制按钮可点击')

  // 复制调用剪贴板；失败不抛，界面仍可继续用。
  const navigatorDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'navigator')
  const originalSetTimeout = globalThis.setTimeout
  const originalClearTimeout = globalThis.clearTimeout
  let copiedText = ''
  try {
    Object.defineProperty(globalThis, 'navigator', {
      configurable: true,
      value: { clipboard: { writeText: async (value) => { copiedText = value } } },
    })
    globalThis.setTimeout = () => 1
    globalThis.clearTimeout = () => {}
    await fenceButton.props.onClick()
    assert.equal(copiedText, 'const a = 1', '复制的是代码正文')
  } finally {
    if (navigatorDescriptor) Object.defineProperty(globalThis, 'navigator', navigatorDescriptor)
    else delete globalThis.navigator
    globalThis.setTimeout = originalSetTimeout
    globalThis.clearTimeout = originalClearTimeout
  }

  // 完整 fixture：标题、两类列表、引用、表格、行内标记、链接、空行与硬换行。
  const rich = render(h(MarkdownLite, { text: RICH_MARKDOWN }))
  const nodes = collect(rich)
  assert.ok(nodes.some((n) => n.type === 'h1' && n.props.className === 'dsh-hands-mdHeading'), '一级标题')
  assert.ok(nodes.some((n) => n.type === 'h2'), '二级标题')
  assert.ok(nodes.some((n) => n.type === 'ul'), '无序列表')
  assert.ok(nodes.some((n) => n.type === 'ol'), '有序列表')
  assert.ok(nodes.some((n) => n.type === 'blockquote'), '引用')
  assert.ok(nodes.some((n) => n.type === 'table'), '表格')
  assert.ok(nodes.some((n) => n.type === 'strong'), '加粗')
  assert.ok(nodes.some((n) => n.type === 'em'), '斜体')
  assert.ok(nodes.some((n) => n.type === 'code'), '行内代码')
  const link = nodes.find((n) => n.type === 'a')
  assert.equal(link.props.href, 'https://example.com', '链接地址')
  assert.equal(link.props.target, '_blank', '链接新开')
  assert.ok(nodes.some((n) => n.props?.className === 'dsh-hands-mdGap'), '保留空行间距')
  assert.ok(allText(rich).includes('这一行后面有两个空格。  '), '行尾两个空格原样保留')
  const table = nodes.find((n) => n.type === 'table')
  const tableNodes = collect(table)
  const rightHeader = tableNodes.find((n) => n.type === 'th' && allText(n) === '值')
  assert.equal(rightHeader.props.style.textAlign, 'right', '表格列对齐')
  assert.equal(tableNodes.filter((n) => n.type === 'td').length, 6, '表格三行数据')

  // 流式半成品：未闭合围栏、仅表头、未闭合行内标记都不炸。
  const partialFence = render(h(MarkdownLite, { text: STREAM_PARTIAL_FENCE, streaming: true }))
  const partialCard = collect(partialFence).find((n) => n.props?.className === 'dsh-hands-mdCode')
  assert.equal(partialCard.props['data-streaming'], 'true', '未闭合围栏按流式代码渲染')
  assert.ok(texts(partialFence).includes('const a = 1;'), '流式代码正文在')
  const partialTable = render(h(MarkdownLite, { text: STREAM_PARTIAL_TABLE, streaming: true }))
  assert.ok(collect(partialTable).some((n) => n.type === 'table'), '半成品表头也渲染表格')
  const partialInline = render(h(MarkdownLite, { text: STREAM_PARTIAL_INLINE, streaming: true }))
  assert.ok(allText(partialInline).includes('这是**粗体'), '未闭合行内标记不吞字')

  // 只有行内反引号时不能误开围栏；波浪号围栏同样支持。
  const inlineFence = render(h(MarkdownLite, { text: '这是 ``` 不是围栏' }))
  assert.equal(collect(inlineFence).filter((n) => n.props?.className === 'dsh-hands-mdCode').length, 0, '行内反引号不误判')
  const tildeFence = render(h(MarkdownLite, { text: '~~~txt\nhello\n~~~' }))
  assert.ok(collect(tildeFence).some((n) => n.props?.['data-lang'] === 'txt'), '波浪号围栏')

  // 原生路径必须收到本地化 labels，并且同一语言下引用稳定。
  const NativeMarkdownText = () => null
  const nativeMod = def.factory((name) => {
    if (name === 'react') return ReactStub
    if (name === '@deepseek-ai/dsh-client-ui-primitives') return { MarkdownText: NativeMarkdownText }
    throw new Error(`unexpected require: ${name}`)
  })
  const t = (key) => ({ copy: '复制', copied: '已复制', codeBlockTitle: '代码', codeBlockWrap: '换行', codeBlockUnwrap: '不换行', markdownFootnotes: '脚注' })[key] || key
  const nativeFirst = nativeMod.MarkdownBlock({ text: '# 标题', t })
  const nativeSecond = nativeMod.MarkdownBlock({ text: '# 标题\n正文', streaming: true, t })
  assert.equal(nativeFirst.type, NativeMarkdownText, '优先使用原生 MarkdownText')
  assert.equal(nativeFirst.props.labels.code.copyLabel, '复制', '原生复制文案本地化')
  assert.equal(nativeFirst.props.labels, nativeSecond.props.labels, '流式 labels 引用稳定')
  const fallback = mod.MarkdownBlock({ text: '```\nx\n```', t })
  assert.equal(fallback.type, MarkdownLite, '没有原生组件时回落')
  assert.equal(fallback.props.labels.code.copyLabel, '复制', '兜底复制文案同样本地化')

  // 空文本不炸
  assert.ok(render(h(MarkdownLite, { text: '' })), '空文本也有容器')
  console.log('6) markdown 原生/兜底渲染 ok')
}

console.log('ok')
