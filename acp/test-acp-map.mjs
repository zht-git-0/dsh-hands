// mapAcpUpdate / feedEvent 纯函数测试：node acp/test-acp-map.mjs
// 只喂假的 ACP session/update，不起进程、不碰网络；跑通最后打印 ok。
import assert from 'node:assert/strict'
import { createLiveView, mapAcpUpdate } from '../stream.js'

const state = { toolCalls: new Map() }

// 1) 消息块：正文增量原样透出
assert.deepEqual(
  mapAcpUpdate({ sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: '你好' } }, state),
  { text: '你好' },
)

// 2) 思考块：不追加正文，只留 thought 字段
const thought = mapAcpUpdate({ sessionUpdate: 'agent_thought_chunk', content: { text: '先想一下' } }, state)
assert.equal(thought.text, undefined)
assert.equal(thought.thought, '先想一下')

// 3) 工具调用：追加一行 [tool] title，并记下 id → title
const call = mapAcpUpdate({ sessionUpdate: 'tool_call', toolCallId: 't1', title: 'read', status: 'pending' }, state)
assert.equal(call.text, '\n[tool] read\n')
assert.equal(state.toolCalls.get('t1'), 'read')

// 4) 工具完成：补 done；同一个终态重复上报只报一次（不刷屏）
const done = mapAcpUpdate({ sessionUpdate: 'tool_call_update', toolCallId: 't1', status: 'completed' }, state)
assert.equal(done.text, '[tool] read done\n')
assert.equal(done.status, 'completed')
assert.deepEqual(mapAcpUpdate({ sessionUpdate: 'tool_call_update', toolCallId: 't1', status: 'completed' }, state), {})

// 5) 工具失败：用中文「失败」，标题从第一次 tool_call 里带过来
mapAcpUpdate({ sessionUpdate: 'tool_call', toolCallId: 't2', title: 'bash' }, state)
const failed = mapAcpUpdate({ sessionUpdate: 'tool_call_update', toolCallId: 't2', status: 'failed' }, state)
assert.equal(failed.text, '[tool] bash 失败\n')

// 6) usage：只存字段、不追加正文；优先 update.usage，其次摊平的外层字段
const usage = mapAcpUpdate(
  { sessionUpdate: 'usage_update', used: 12, size: 200000, cost: { amount: 0.003 } },
  state,
)
assert.equal(usage.text, undefined)
assert.deepEqual(usage.usage, { used: 12, size: 200000, cost: { amount: 0.003 } })
assert.deepEqual(
  mapAcpUpdate({ sessionUpdate: 'usage_update', usage: { inputTokens: 3, outputTokens: 4 } }, state).usage,
  { inputTokens: 3, outputTokens: 4 },
)

// 7) replay:true（session/load 重放的历史）整块丢弃
assert.deepEqual(
  mapAcpUpdate(
    { sessionUpdate: 'agent_message_chunk', content: { text: '历史正文' }, replay: true },
    state,
  ),
  {},
)
assert.deepEqual(mapAcpUpdate({ sessionUpdate: 'tool_call', toolCallId: 'h1', title: '历史工具', replay: true }, state), {})
assert.equal(state.toolCalls.has('h1'), false)

// 8) 认不出的 / 空 update 不炸也不产出
assert.deepEqual(mapAcpUpdate(null, state), {})
assert.deepEqual(mapAcpUpdate({ sessionUpdate: 'available_commands_update' }, state), {})

// 9) feedEvent 接上 live 管道：消息 + 工具 + 完成 + usage，replay 的历史不能出现
const live = createLiveView('opencode')
live.feedEvent({ sessionUpdate: 'agent_message_chunk', content: { text: '开工' } })
live.feedEvent({ sessionUpdate: 'tool_call', toolCallId: 't9', title: 'edit' })
live.feedEvent({ sessionUpdate: 'usage_update', used: 5, size: 1000 })
live.feedEvent({ sessionUpdate: 'tool_call_update', toolCallId: 't9', status: 'completed' })
live.feedEvent({ sessionUpdate: 'agent_message_chunk', content: { text: ' 历史' }, replay: true })
live.feedEvent({ sessionUpdate: 'agent_message_chunk', content: { text: '收工' } })

const rendered = live.render()
assert.equal(rendered, '开工\n[tool] edit\n[tool] edit done\n收工')
assert.ok(!rendered.includes('历史'), `重放内容漏进正文: ${JSON.stringify(rendered)}`)

// 10) 正文以 { 开头也按纯文本处理（不走 JSONL 折行）
const jsonish = createLiveView('opencode')
jsonish.feedEvent({ sessionUpdate: 'agent_message_chunk', content: { text: '{"a":1}' } })
assert.equal(jsonish.render(), '{"a":1}')

console.log('ok')
