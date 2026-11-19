// 气泡分块（思维链/正文/工具）测试：node acp/test-blocks.mjs
// 只测 stream.js 的纯函数：喂代表性的 CLI JSONL，看 blocks 分得对不对、失败有没有回落。
import assert from 'node:assert/strict'
import { createLiveView } from '../stream.js'

const feed = (view, hand, events) => {
  for (const event of events) view.feed(JSON.stringify(event) + '\n')
  view.flush()
  return view.blocks()
}

// ── 1) opencode：text / tool / reasoning 分开 ──────────────────────────────
{
  const view = createLiveView('opencode')
  const blocks = feed(view, 'opencode', [
    { type: 'reasoning', part: { type: 'reasoning', text: '先看目录' } },
    { type: 'text', part: { id: 'p1', text: '你好' } },
    { type: 'tool_use', part: { tool: 'bash', state: { input: { command: 'ls -la' }, status: 'completed' } } },
  ])
  assert.deepEqual(blocks.map((b) => b.kind), ['reasoning', 'text', 'tool'])
  assert.equal(blocks[0].text, '先看目录')
  assert.equal(blocks[1].text, '你好')
  assert.equal(blocks[2].name, 'bash')
  assert.equal(blocks[2].detail, 'ls -la')
  assert.equal(blocks[2].status, 'completed')

  // 老字段 text 还在（向后兼容）
  assert.ok(view.render().includes('你好'))
  console.log('1) opencode 分块 ok')
}

// ── 2) claude：thinking_delta / text_delta / tool_use ──────────────────────
{
  const view = createLiveView('claude')
  const blocks = feed(view, 'claude', [
    { type: 'stream_event', event: { type: 'content_block_delta', delta: { type: 'thinking_delta', thinking: '想一下' } } },
    { type: 'stream_event', event: { type: 'content_block_delta', delta: { type: 'text_delta', text: '正文' } } },
    { type: 'stream_event', event: { type: 'content_block_start', content_block: { type: 'tool_use', name: 'Bash', input: { command: 'pwd' } } } },
  ])
  assert.deepEqual(blocks.map((b) => b.kind), ['reasoning', 'text', 'tool'])
  assert.equal(blocks[0].text, '想一下')
  assert.equal(blocks[2].name, 'Bash')
  console.log('2) claude 分块 ok')
}

// ── 3) codex：reasoning / agent_message / command_execution ────────────────
{
  const view = createLiveView('codex')
  const blocks = feed(view, 'codex', [
    { type: 'item.completed', item: { type: 'reasoning', id: 'r1', text: '盘一下' } },
    { type: 'item.completed', item: { type: 'agent_message', id: 'm1', text: '结论' } },
    { type: 'item.started', item: { type: 'command_execution', command: 'ls' } },
  ])
  assert.deepEqual(blocks.map((b) => b.kind), ['reasoning', 'text', 'tool'])
  assert.equal(blocks[2].name, 'command')
  console.log('3) codex 分块 ok')
}

// ── 4) 工具详情截断 + 连续文本合并 ─────────────────────────────────────────
{
  const view = createLiveView('opencode')
  const long = 'x'.repeat(400)
  const blocks = feed(view, 'opencode', [
    { type: 'text', part: { text: '一' } },
    { type: 'text', part: { text: '二' } },
    { type: 'tool_use', part: { tool: 'write', state: { input: { path: long }, status: 'running' } } },
  ])
  const textBlocks = blocks.filter((b) => b.kind === 'text')
  assert.equal(textBlocks.length, 1, '连续正文合并成一块')
  assert.equal(textBlocks[0].text, '一二')
  const tool = blocks.find((b) => b.kind === 'tool')
  assert.equal(tool.detail.length, 200, '工具参数截断到 200 字')
  console.log('4) 合并与截断 ok')
}

// ── 5) 纯文本输出（非 JSONL）回落成 text，不丢内容 ─────────────────────────
{
  const view = createLiveView('codex')
  view.feed('这不是 JSON，只是普通输出\n')
  view.flush()
  const blocks = view.blocks()
  assert.deepEqual(blocks.map((b) => b.kind), ['text'])
  assert.equal(blocks[0].text, '这不是 JSON，只是普通输出')
  console.log('5) 非 JSON 回落 ok')
}

// ── 6) 块数量上限：不会无限涨 ──────────────────────────────────────────────
{
  const view = createLiveView('opencode')
  for (let i = 0; i < 200; i += 1) {
    view.feed(JSON.stringify({ type: 'tool_use', part: { tool: `t${i}`, state: { input: {} } } }) + '\n')
  }
  view.flush()
  assert.ok(view.blocks().length <= 120, '最多 120 块')
  console.log('6) 块上限 ok')
}

// ── 7) 前端分块组件：三类块各渲染成对应结构 ─────────────────────────────────
{
  globalThis.window = { __ModuleLoader__: { load(def) { globalThis.__def = def } } }
  await import('../client.js')
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
  const mod = globalThis.__def.factory((name) => {
    if (name === 'react') return ReactStub
    throw new Error(`unexpected require: ${name}`)
  })
  const tree = mod.AgentBlocks({
    t: (key) => key,
    running: false,
    blocks: [
      { kind: 'reasoning', text: '想一下' },
      { kind: 'text', text: '正文' },
      { kind: 'tool', name: 'bash', detail: 'ls', status: 'completed' },
    ],
  })
  const text = JSON.stringify(tree)
  assert.ok(text.includes('dsh-hands-blocks'), '外层分块容器')
  assert.ok(text.includes('dsh-hands-blockReasoning'), '思维链块')
  assert.ok(text.includes('dsh-hands-blockText'), '正文块')
  assert.ok(text.includes('dsh-hands-blockTool'), '工具块')
  assert.ok(text.includes('toolDone'), '工具状态文案走 t()')
  console.log('7) 前端分块组件 ok')
}

// ── 8) 工具输出去重：同 id 只留一块，running→completed 更新原块 ────────────
{
  const view = createLiveView('opencode')
  const blocks = feed(view, 'opencode', [
    { type: 'tool_use', part: { id: 't1', tool: 'write', state: { input: { path: 'a.txt' }, status: 'running' } } },
    {
      type: 'tool_use',
      part: { id: 't1', tool: 'write', state: { input: { path: 'a.txt' }, status: 'completed', output: '写入 12 行' } },
    },
  ])
  const tools = blocks.filter((b) => b.kind === 'tool')
  assert.equal(tools.length, 1, '同一个 tool id 不产生两个块')
  assert.equal(tools[0].status, 'completed')
  assert.equal(tools[0].output, '写入 12 行', '工具输出挂在块上')
  console.log('8) 工具输出去重 ok')
}

// ── 9) codex 命令输出也进块 ────────────────────────────────────────────────
{
  const view = createLiveView('codex')
  const blocks = feed(view, 'codex', [
    { type: 'item.started', item: { id: 'c1', type: 'command_execution', command: 'ls' } },
    {
      type: 'item.completed',
      item: { id: 'c1', type: 'command_execution', command: 'ls', exit_code: 0, aggregated_output: 'a.txt\nb.txt' },
    },
  ])
  const tools = blocks.filter((b) => b.kind === 'tool')
  assert.equal(tools.length, 1)
  assert.equal(tools[0].output, 'a.txt\nb.txt')
  assert.equal(tools[0].status, 'exit 0')
  console.log('9) codex 命令输出 ok')
}

// ── 10) claude tool_result 回填 + 2000 字截断 ──────────────────────────────
{
  const view = createLiveView('claude')
  const long = 'y'.repeat(3000)
  const blocks = feed(view, 'claude', [
    {
      type: 'stream_event',
      event: { type: 'content_block_start', content_block: { type: 'tool_use', id: 'tu1', name: 'Write', input: { file_path: 'a.txt' } } },
    },
    { type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: 'tu1', content: long }] } },
  ])
  const tool = blocks.find((b) => b.kind === 'tool')
  assert.ok(tool, 'tool 块存在')
  assert.equal(tool.status, 'completed')
  assert.equal(tool.output.length, 2000, '输出截断到 2000')
  console.log('10) claude tool_result 回填 ok')
}

console.log('ok')
