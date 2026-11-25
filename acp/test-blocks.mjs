// 气泡分块（思维链/正文/工具）测试：node acp/test-blocks.mjs
// 只测 stream.js 的纯函数：喂代表性的 CLI JSONL，看 blocks 分得对不对、失败有没有回落。
import assert from 'node:assert/strict'
import { createLiveView, markNonTextBlocks } from '../stream.js'
import { blocksSignature } from '../index.js'

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
  const before = feed(view, 'claude', [
    {
      type: 'stream_event',
      event: { type: 'content_block_start', content_block: { type: 'tool_use', id: 'tu1', name: 'Write', input: { file_path: 'a.txt' } } },
    },
  ])
  const beforeSig = blocksSignature(before)
  const blocks = feed(view, 'claude', [
    { type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: 'tu1', content: long }] } },
  ])
  assert.notEqual(blocksSignature(blocks), beforeSig, 'tool status/output 变化必须改变 blocks 签名')
  const tool = blocks.find((b) => b.kind === 'tool')
  assert.ok(tool, 'tool 块存在')
  assert.equal(tool.status, 'completed')
  assert.equal(tool.output.length, 2000, '输出截断到 2000')
  console.log('10) claude tool_result 回填 ok')
}

// ── 11) ACP tool_call → tool_call_update：只留一个块（opencode 找出来的坑）────
{
  const view = createLiveView('opencode')
  view.feedEvent({ sessionUpdate: 'tool_call', toolCallId: 'tc1', title: 'Bash' })
  view.feedEvent({ sessionUpdate: 'tool_call_update', toolCallId: 'tc1', status: 'completed' })
  const tools = view.blocks().filter((b) => b.kind === 'tool')
  assert.equal(tools.length, 1, '同一个 ACP 工具不产生两个块')
  assert.equal(tools[0].status, 'completed')
  assert.equal(tools[0].name, 'Bash')
  console.log('11) ACP 工具去重 ok')
}

// ── 12) 超长单行整体丢弃，不把半截 JSON 当正文 ──────────────────────────────
{
  const view = createLiveView('opencode')
  view.feed('x'.repeat(70000))
  assert.equal(view.render(), '')
  view.feed('\n' + JSON.stringify({ type: 'text', part: { text: '有效正文' } }) + '\n')
  assert.equal(view.render(), '有效正文')
  view.feed('y'.repeat(70000))
  view.flush()
  assert.equal(view.render(), '有效正文', 'flush 也不能吐出被丢弃的超长残行')
  console.log('12) 超长单行丢弃 ok')
}

// ── 13) opencode 同 part 的累计/增量都保持 flat text 只追加 ──────────────────
{
  const view = createLiveView('opencode')
  view.feed(JSON.stringify({ type: 'text', part: { id: 'p1', text: '你好' } }) + '\n')
  view.feed(JSON.stringify({ type: 'text', part: { id: 'p1', text: '你好世界' } }) + '\n')
  view.feed(JSON.stringify({ type: 'text', part: { id: 'p1', text: '！' } }) + '\n')
  assert.equal(view.render(), '你好世界！')
  assert.equal(view.totalLength(), view.render().length)
  console.log('13) opencode 累计/增量单调偏移 ok')
}

// ── 14) claude 疑似图片/base64 文本：正文前给出可见警告 ─────────────────────
{
  const warning = '该段输出疑似非文本内容（可能是上游返回异常）'
  const normal = createLiveView('claude')
  normal.feed(JSON.stringify({ type: 'assistant', message: { content: [{ type: 'text', text: '正常中文输出' }] } }) + '\n')
  normal.flush()
  assert.equal(normal.render(), '正常中文输出')
  assert.ok(!normal.blocks().some((block) => block.text?.includes(warning)))

  const base64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB' + 'A'.repeat(600)
  const binary = createLiveView('claude')
  binary.feed(JSON.stringify({ type: 'assistant', message: { content: [{ type: 'text', text: base64 }] } }) + '\n')
  binary.flush()
  assert.ok(binary.render().startsWith(warning), '长 base64 正文前必须有警告')
  assert.ok(binary.blocks().some((block) => block.text?.startsWith(warning)))

  const imageJson = JSON.stringify({ type: 'image/png', data: 'A'.repeat(600), originalSize: 500 })
  const image = createLiveView('claude')
  image.feed(JSON.stringify({ type: 'assistant', message: { content: [{ type: 'text', text: imageJson }] } }) + '\n')
  image.flush()
  assert.ok(image.render().startsWith(warning), '图片 JSON 正文前必须有警告')

  const buffered = createLiveView('claude')
  buffered.feed(Buffer.from(JSON.stringify({ type: 'assistant', message: { content: [{ type: 'text', text: 'Buffer 中文正常' }] } }) + '\n', 'utf8'))
  buffered.flush()
  assert.equal(buffered.render(), 'Buffer 中文正常')

  const toolImage = createLiveView('claude')
  toolImage.feed(JSON.stringify({ type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: 'img1', content: { type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'A'.repeat(600) } } }] } }) + '\n')
  toolImage.flush()
  assert.ok(!toolImage.render().includes('AAAA'), 'user 图片对象不能泄漏成正文')
  console.log('14) claude 非文本警告 ok')
}

// ── 15) agy tool_info.parameters：同 step 合并、参数可展开 ──────────────────
{
  const view = createLiveView('agy')
  const blocks = feed(view, 'agy', [
    { event: 'step_update', step_update: { step_index: 2, state: 'ACTIVE', step_type: 'tool', tool_name: 'read_file', tool_info: { name: 'read_file', parameters: { Path: 'D:/repo/a.txt' } } } },
    { event: 'step_update', step_update: { step_index: 2, state: 'DONE', step_type: 'tool', tool_name: 'read_file', tool_info: { name: 'read_file', parameters: { Path: 'D:/repo/a.txt' }, output: '1 lines, 13 bytes' } } },
  ])
  const tools = blocks.filter((block) => block.kind === 'tool')
  assert.equal(tools.length, 1, '同一步 ACTIVE/DONE 应更新同一工具块')
  assert.equal(tools[0].name, 'read_file')
  assert.match(tools[0].input, /"Path": "D:\/repo\/a.txt"/)
  assert.equal(tools[0].output, '1 lines, 13 bytes')
  assert.equal(tools[0].status, 'completed')

  globalThis.window = { __ModuleLoader__: { load(def) { globalThis.__def = def } } }
  await import('../client.js')
  const ReactStub = {
    createElement(type, props, ...children) { return { type, props, children } },
    useCallback: (fn) => fn,
    useEffect() {},
    useLayoutEffect() {},
    useMemo: (fn) => fn(),
    useRef: (value) => ({ current: value }),
    useState: (value) => [value, () => {}],
    useSyncExternalStore() { return null },
  }
  const mod = globalThis.__def.factory((name) => {
    if (name === 'react') return ReactStub
    throw new Error(`unexpected require: ${name}`)
  })
  const tree = mod.AgentBlocks({
    t: (key) => key,
    running: false,
    blocks: [{ kind: 'tool', name: 'read_file', input: '{"Path":"a.txt"}', status: 'completed' }],
  })
  const texts = [];
  const walk = (node) => {
    if (node == null || typeof node === 'boolean') return;
    if (typeof node === 'string' || typeof node === 'number') { texts.push(String(node)); return; }
    if (Array.isArray(node)) { node.forEach(walk); return; }
    if (typeof node.type === 'function') { walk(node.type({ ...(node.props || {}), children: node.children })); return; }
    (node.children || []).forEach(walk);
  };
  walk(tree);
  assert.ok(JSON.stringify(tree).includes('details'), '只有参数也应可展开')
  assert.ok(texts.join('').includes('"Path":"a.txt"'), '展开区显示参数 JSON')
  console.log('15) agy 工具参数 ok')
}

// ── 16) 历史 blocks 同样加警告，不重写磁盘 ─────────────────────────────────
{
  const warning = '该段输出疑似非文本内容（可能是上游返回异常）'
  const blocks = [{ kind: 'text', text: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB' + 'A'.repeat(600) }]
  const marked = markNonTextBlocks(blocks, 'claude')
  assert.ok(marked[0].text.startsWith(warning))
  assert.equal(blocks[0].text.startsWith(warning), false, '不能修改原数组')
  assert.equal(markNonTextBlocks(blocks, 'opencode')[0].text, blocks[0].text)
  console.log('16) 历史 claude blocks 警告 ok')
}

console.log('ok')
