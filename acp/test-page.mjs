// 顶层面板（和插件/自动化任务同级的那一页）渲染冒烟测试：node acp/test-page.mjs
// 不挂真 React：stub 出 h()/hooks，把 HandsPage 展开成树检查结构。
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
  // 真 store 的 slice 读出来就够断言了；不挂订阅。
  useSyncExternalStore(_subscribe, getSnapshot) {
    return typeof getSnapshot === 'function' ? getSnapshot() : null
  },
}

// ── 把树摊平，方便按类名/文本找节点 ────────────────────────────────────────
function flatten(node, out = []) {
  if (node === null || node === undefined || typeof node === 'boolean') return out
  if (Array.isArray(node)) {
    for (const item of node) flatten(item, out)
    return out
  }
  if (typeof node === 'string' || typeof node === 'number') {
    out.push(String(node))
    return out
  }
  if (typeof node === 'function') return flatten(node({}), out)
  if (typeof node !== 'object') return out
  // 函数组件按 props 展开，才看得见里面真正渲染的 DOM 结构
  if (typeof node.type === 'function') {
    const props = { ...(node.props || {}) }
    if (node.children?.length) props.children = node.children
    return flatten(node.type(props), out)
  }
  out.push(node)
  for (const child of node.children || []) flatten(child, out)
  return out
}

function byClass(tree, className) {
  return tree.filter(
    (node) => node && typeof node === 'object' && String(node.props?.className || '').split(/\s+/).includes(className),
  )
}

function textOf(tree) {
  return tree
    .filter((node) => typeof node === 'string')
    .join(' ')
}

const mod = def.factory((name) => {
  if (name === 'react') return ReactStub
  throw new Error(`unexpected require: ${name}`)
})

const t = (key) => key

// 1) 导航图标：16px 线条 SVG，跟着 sidebar 的 size 走
{
  const small = mod.HandsNavIcon({ size: 14 })
  assert.equal(small.type, 'svg')
  assert.equal(small.props.width, 14)
  assert.equal(small.props.strokeWidth, 1, '1px 线条重量')
  assert.ok(small.children.length >= 1, '至少一条 path')
  const fallback = mod.HandsNavIcon({})
  assert.equal(fallback.props.width, 16, '没传 size 用 16')
  console.log('1) 侧边栏图标 ok')
}

// 1.5) 各家的图形标：四个手都有，未知的手退回字母
{
  for (const hand of ['claude', 'codex', 'agy', 'opencode']) {
    const icon = mod.HandIcon({ hand, size: 18 })
    assert.ok(icon.type === 'svg' || icon.type === 'img', `${hand} 有图标节点`)
    if (icon.type === 'img') assert.ok(String(icon.props.src).startsWith('data:image/'), `${hand} 用内联 data URI`)
    assert.equal(icon.props.width, 18, `${hand} 跟着 size 走`)
    if (icon.type === 'svg') {
      assert.ok(
        icon.props.fill === 'currentColor' || icon.props.stroke === 'currentColor',
        `${hand} 颜色跟外层`,
      )
    }
    if (icon.type === 'svg') assert.ok(icon.children.length >= 1, `${hand} 至少一条 path`)
  }
  assert.equal(mod.HandIcon({ hand: 'mystery' }).type, 'span', '不认识的手退回字母')
  assert.ok(mod.HAND_ICON_PATHS.claude.length >= 4, 'claude 是星芒（多条线）')
  assert.equal(Object.keys(mod.HAND_BRAND_PATHS).length, 4, '四家都有品牌 mark')
  console.log('1.5) 各家图标 ok')
}

// 2) 整页结构：头（标题/副标题/连接状态/刷新）+ 三列面板
{
  const store = mod.createHandsStore()
  const page = mod.HandsPage({ t, store })
  const tree = flatten(page)

  assert.ok(byClass(tree, 'dsh-hands-page').length === 1, '外层 .dsh-hands-page')
  assert.ok(byClass(tree, 'dsh-hands-pageHead').length === 1, '头部')
  assert.ok(byClass(tree, 'dsh-hands-pageBody').length === 1, '主体')
  assert.ok(byClass(tree, 'dsh-hands-pageTitle').length === 1, '标题')
  assert.ok(byClass(tree, 'dsh-hands-pageSub').length === 1, '副标题')
  // 顶部横条：先 rail 再 body（爸爸 2026-11-21 19:37 要求把 AI 标签挪到顶部）
  const topwrap = byClass(tree, 'dsh-hands-v2-topwrap')[0]
  assert.ok(topwrap, '顶部横条容器存在')
  const kids = (topwrap.children || []).filter((c) => c && c.props && c.props.className)
  const classes = (topwrap.children || []).map((c) => String((c && c.props && c.props.className) || ''))
  const bodyIdx = classes.findIndex((name) => name.includes('dsh-hands-v2-body'))
  assert.ok(bodyIdx >= 0, '两列装在顶条容器里')
  const railIdx = classes.findIndex((name) => name.includes('dsh-hands-v2-rail'))
  // 整页模式下可能不挂横条（showRail=false）；挂了就必须在 body 前面
  if (railIdx >= 0) assert.ok(railIdx < bodyIdx, '横条在两列上面')
  // 页面自己的刷新按钮（第二列也有一个同名按钮，所以只要求至少一个）
  assert.ok(byClass(tree, 'dsh-hands-v2-iconBtn').length >= 1, '刷新按钮')

  // 主体里挂的是 v2 三列
  assert.ok(byClass(tree, 'dsh-hands-v2').length === 1, 'v2 面板')
  assert.ok(byClass(tree, 'dsh-hands-v2-rail').length === 1, '第一列 agent 卡片')
  assert.ok(byClass(tree, 'dsh-hands-v2-sessions').length === 1, '第二列会话')
  assert.ok(byClass(tree, 'dsh-hands-v2-thread').length === 1, '第三列对话')

  const text = textOf(tree)
  assert.ok(text.includes('navLabel'), '标题走 navLabel')
  assert.ok(text.includes('pageSub'), '副标题走 pageSub')
  assert.ok(text.includes('refresh') === false, '刷新是 title 不是正文')
  console.log('2) 整页结构 ok')
}

// 3) store 引用计数：两处同时挂载，先卸载的那份不许把流掐了
{
  const store = mod.createHandsStore()
  store.start()
  store.start()
  assert.equal(store.debug().started, true, '两处挂载后仍在跑')
  store.stop()
  assert.equal(store.debug().started, true, '先卸载一处不能停')
  store.stop()
  assert.equal(store.debug().started, false, '最后卸载才停')
  // 多调一次 stop 也不能把状态搞乱
  store.stop()
  assert.equal(store.debug().started, false, '多余 stop 幂等')
  console.log('3) store 引用计数 ok')
}

console.log('ok')
