// 把四个手下打印的 JSONL 事件流折成人能读的「对面正在说什么」，
// 同时从同一份输出里把最终答复、会话 id、用量抠出来。
// 纯函数，不碰文件系统，方便单独喂样本测。

const MAX_LIVE = 200000

function asText(value) {
  return typeof value === 'string' ? value : ''
}

function stripAnsi(value) {
  return String(value).replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, '')
}

function parseSingleJson(raw) {
  const text = String(raw || '').trim()
  if (!text) return null
  try {
    const value = JSON.parse(text)
    return value && typeof value === 'object' && !Array.isArray(value) ? value : null
  } catch {
    return null
  }
}

export function parseJsonLines(raw) {
  const out = []
  for (const line of String(raw || '').split(/\r?\n/)) {
    const s = line.trim()
    if (!s.startsWith('{')) continue
    try {
      const value = JSON.parse(s)
      if (value && typeof value === 'object' && !Array.isArray(value)) out.push(value)
    } catch {
      /* 半行（进程被 kill 时常见）直接丢掉 */
    }
  }
  return out
}

/**
 * ACP 的 session/update → live view 的「对面在说什么」，纯函数、不碰 IO。
 * state = { toolCalls: Map<id, title> }，就地更新；内部再用 toolStatus 去重。
 * 返回 { text?, usage?, thought?, status? }：
 * - agent_message_chunk → text 追加正文
 * - agent_thought_chunk → thought（只留字段，不进正文）
 * - tool_call → text 追加 "\n[tool] <title>\n"，并记 id
 * - tool_call_update 落到 completed / failed → text 追加 "[tool] <title> done/失败\n"（同一终态只报一次）
 * - usage_update → usage（优先 update.usage；opencode 把 used/size/cost 平铺在外层）
 * - replay:true → 空对象（session/load 重放的历史，整块丢弃）
 */
export function mapAcpUpdate(update, state) {
  const out = {}
  if (!update || typeof update !== 'object') return out
  if (update.replay === true) return out

  const store = state && typeof state === 'object' ? state : {}
  if (!(store.toolCalls instanceof Map)) store.toolCalls = new Map()
  if (!(store.toolStatus instanceof Map)) store.toolStatus = new Map()

  const kind = update.sessionUpdate
  const contentText = (content) => (typeof content?.text === 'string' ? content.text : '')
  const titleOf = (fallback = '') => {
    const value = update.title ?? update.toolName ?? update.kind ?? fallback
    const title = typeof value === 'string' ? value.trim() : ''
    return title || 'tool'
  }

  if (kind === 'agent_message_chunk') {
    const text = contentText(update.content)
    if (text) out.text = text
    return out
  }
  if (kind === 'agent_thought_chunk') {
    const thought = contentText(update.content)
    if (thought) out.thought = thought
    return out
  }
  if (kind === 'tool_call') {
    const id = String(update.toolCallId ?? update.id ?? '')
    const title = titleOf()
    if (id) store.toolCalls.set(id, title)
    out.text = `\n[tool] ${title}\n`
    return out
  }
  if (kind === 'tool_call_update') {
    const id = String(update.toolCallId ?? update.id ?? '')
    const title = titleOf(id ? store.toolCalls.get(id) : '')
    if (id) store.toolCalls.set(id, title)
    const status = String(update.status || '').toLowerCase()
    if (status !== 'completed' && status !== 'failed') return out
    // 同一个工具可能重复上报同一个终态（比如先 completed 再 completed），只报一次
    if (id && store.toolStatus.get(id) === status) return out
    if (id) store.toolStatus.set(id, status)
    out.status = status
    out.text = `[tool] ${title} ${status === 'completed' ? 'done' : '失败'}\n`
    return out
  }
  if (kind === 'usage_update') {
    // 标准形状是 update.usage；opencode 把 used/size/cost 平铺在 update 上，退而取整体
    const { sessionUpdate, replay, ...rest } = update
    out.usage = update.usage ?? (Object.keys(rest).length ? rest : null)
    return out
  }
  return out
}

/**
 * 造一个只属于这次派发的实时视图。
 * feed() 吃 stdout / stderr 的原始 chunk，render() 给出可直接显示的文本。
 * feedEvent() 吃 ACP 的 session/update，和 feed() 共用同一个文本缓冲。
 */
export function createLiveView(hand) {
  let text = ''
  const pending = { stdout: '', stderr: '' }
  let lastPart = { id: '', length: 0 }
  let claude = { messageId: '', sawDelta: false }
  let agy = { step: null, last: '' }
  // ACP 的结构化状态：工具 id → 标题，以及 thought / usage 留给以后用
  const acp = { toolCalls: new Map(), toolStatus: new Map(), thought: '', usage: null }

  const append = (value) => {
    const chunk = asText(value)
    if (!chunk) return
    text += chunk
    if (text.length > MAX_LIVE) text = text.slice(-MAX_LIVE)
  }
  const newline = () => {
    if (text && !text.endsWith('\n')) append('\n')
  }
  const block = (value) => {
    if (!value) return
    newline()
    append(value)
  }
  const line = (value) => {
    if (!value) return
    newline()
    append(String(value))
    append('\n')
  }

  function handleOpencode(ev) {
    if (ev.type === 'text' && ev.part && typeof ev.part.text === 'string') {
      const value = ev.part.text
      const id = String(ev.part.id || '')
      // 有的版本同一 part 会反复发累计文本，后到的版本发增量；两种都兼容。
      if (id && id === lastPart.id) {
        text = text.slice(0, Math.max(0, text.length - lastPart.length))
        append(value)
        lastPart.length = value.length
      } else {
        block(value)
        lastPart = { id, length: value.length }
      }
      return
    }
    if (ev.type === 'tool_use' || ev.part?.type === 'tool') {
      const part = ev.part || {}
      const state = part.state || {}
      const input = state.input || {}
      const name = part.tool || part.name || ev.tool || 'tool'
      const detail = input.command || input.filePath || input.file_path || input.path || input.description || ''
      line(`→ ${name}${detail ? `: ${detail}` : ''}`)
      if (typeof state.output === 'string' && state.output.trim()) block(state.output)
      if (state.status === 'error' || state.error) line(`! ${state.error || 'tool error'}`)
      return
    }
    if (ev.type === 'error') {
      line(`! ${ev.error?.message || ev.message || 'error'}`)
    }
  }

  function handleCodex(ev) {
    const item = ev.item
    if (ev.type === 'item.started' && item?.type === 'command_execution') {
      line(`$ ${item.command || ''}`.trim())
      return
    }
    if (ev.type === 'item.completed' && item) {
      if (item.type === 'agent_message') {
        block(item.text)
        return
      }
      if (item.type === 'command_execution') {
        const output = asText(item.aggregated_output) || asText(item.output)
        if (output) block(output)
        if (item.exit_code !== undefined && item.exit_code !== 0) line(`! exit ${item.exit_code}`)
        return
      }
      if (item.type === 'file_change') {
        const changes = Array.isArray(item.changes) ? item.changes : []
        for (const change of changes) line(`✎ ${change.path || change.file || 'file'}`)
        return
      }
      if (item.type === 'reasoning' && item.text) {
        block(item.text)
      }
    }
  }

  function handleClaude(ev) {
    if (ev.type === 'stream_event' && ev.event) {
      const event = ev.event
      if (event.type === 'message_start') {
        claude.messageId = String(event.message?.id || '')
        claude.sawDelta = false
        return
      }
      if (event.type === 'content_block_start' && event.content_block?.type === 'tool_use') {
        const block = event.content_block
        const input = block.input || {}
        const detail = input.command || input.file_path || input.filePath || input.path || input.description || ''
        line(`→ ${block.name || 'tool'}${detail ? `: ${detail}` : ''}`)
        return
      }
      if (event.type === 'content_block_delta' && event.delta?.type === 'text_delta') {
        const value = asText(event.delta.text)
        if (value) {
          if (!claude.sawDelta) newline()
          append(value)
          claude.sawDelta = true
        }
      }
      return
    }
    if (ev.type === 'assistant' && ev.message) {
      const content = Array.isArray(ev.message.content) ? ev.message.content : []
      // 已经用 stream_event 增量显示过同一条消息，就别把整段再打一遍。
      const skipText = claude.sawDelta && String(ev.message.id || '') === claude.messageId
      for (const part of content) {
        if (part.type === 'text' && part.text && !skipText) block(part.text)
        if (part.type === 'tool_use') {
          const input = part.input || {}
          const detail = input.command || input.file_path || input.filePath || input.path || input.description || ''
          line(`→ ${part.name || 'tool'}${detail ? `: ${detail}` : ''}`)
        }
      }
      claude.sawDelta = false
      claude.messageId = ''
      return
    }
    if (ev.type === 'result') {
      if (!text.trim() && ev.result) block(ev.result)
    }
  }

  function handleAgy(ev) {
    const step = ev.step_update
    if (step) {
      if (step.step_index !== agy.step) {
        newline()
        agy = { step: step.step_index, last: '' }
      }
      const delta = asText(step.text_delta)
      if (delta) {
        // 大多数时候是增量；如果它其实是累计文本，只补新增的那一段。
        if (delta.length > 8 && agy.last && delta.startsWith(agy.last)) {
          append(delta.slice(agy.last.length))
        } else if (delta !== agy.last) {
          append(delta)
        }
        agy.last = delta
      } else if (step.state === 'DONE' && typeof step.text === 'string') {
        block(step.text)
      }
      if (step.tool_name) line(`→ ${step.tool_name}`)
      return
    }
    if (ev.event === 'result') {
      if (!text.trim() && ev.result?.response) block(ev.result.response)
    }
  }

  function handleLine(rawLine, source) {
    const raw = stripAnsi(rawLine).replace(/\r$/, '')
    const trimmed = raw.trim()
    if (!trimmed) {
      append('\n')
      return
    }
    if (source === 'stderr' && /^Reading additional input from stdin/i.test(trimmed)) return
    if (!trimmed.startsWith('{')) {
      line(raw)
      return
    }
    let ev = null
    try {
      ev = JSON.parse(trimmed)
    } catch {
      line(raw)
      return
    }
    if (!ev || typeof ev !== 'object') {
      line(raw)
      return
    }
    if (ev.type === 'error' || ev.event === 'error') {
      const message = ev.message || ev.error?.message || ev.error
      if (message) line(`! ${typeof message === 'string' ? message : JSON.stringify(message)}`)
      return
    }
    if (hand === 'agy') handleAgy(ev)
    else if (hand === 'codex') handleCodex(ev)
    else if (hand === 'claude') handleClaude(ev)
    else handleOpencode(ev)
  }

  // ACP 给的是纯文本（已经是增量），不能再走 feed()：正文以 { 开头时会被当 JSONL 吃掉。
  // 只共用同一个 text 缓冲，工具行前后补换行，别和正文粘在一起。
  function feedAcpText(value) {
    let fragment = asText(value)
    if (!fragment) return
    if (fragment.startsWith('\n') && (!text || text.endsWith('\n'))) {
      fragment = fragment.replace(/^\n+/, '')
    }
    if (fragment && !fragment.startsWith('\n') && text && !text.endsWith('\n')) fragment = '\n' + fragment
    append(fragment)
  }

  return {
    feedEvent(update) {
      const mapped = mapAcpUpdate(update, acp)
      if (mapped.thought) acp.thought += mapped.thought
      if (mapped.usage !== undefined) acp.usage = mapped.usage
      if (mapped.text) feedAcpText(mapped.text)
      return mapped
    },
    feed(chunk, source = 'stdout') {
      const data = String(chunk || '')
      if (!data) return
      const key = source === 'stderr' ? 'stderr' : 'stdout'
      pending[key] += data
      let index = pending[key].indexOf('\n')
      while (index >= 0) {
        const rawLine = pending[key].slice(0, index)
        pending[key] = pending[key].slice(index + 1)
        handleLine(rawLine, key)
        index = pending[key].indexOf('\n')
      }
      // 一整行异常长时先吃掉，别把内存撑爆
      if (pending[key].length > 65536) {
        handleLine(pending[key], key)
        pending[key] = ''
      }
    },
    flush() {
      for (const key of ['stdout', 'stderr']) {
        if (pending[key]) {
          handleLine(pending[key], key)
          pending[key] = ''
        }
      }
    },
    render() {
      return text
    },
  }
}

export function collectAgy(raw) {
  let result = null
  let conversationId = ''
  let text = ''
  for (const ev of parseJsonLines(raw)) {
    if (ev.event === 'init' && ev.conversation_id) conversationId = String(ev.conversation_id)
    const step = ev.step_update
    if (step) {
      if (step.conversation_id) conversationId = String(step.conversation_id)
      if (typeof step.text_delta === 'string') text += step.text_delta
      else if (typeof step.text === 'string') text += step.text
    }
    if (ev.event === 'result' && ev.result && typeof ev.result === 'object') result = ev.result
  }
  if (!result) {
    const single = parseSingleJson(raw)
    if (single && !single.event && !single.type) result = single
  }
  if (result) {
    const out = { ...result }
    if (!out.conversation_id && conversationId) out.conversation_id = conversationId
    if (!out.response && text.trim()) out.response = text
    return out
  }
  if (text.trim()) return { status: 'SUCCESS', response: text, conversation_id: conversationId }
  return null
}

export function collectClaude(raw) {
  let result = null
  let sessionId = ''
  let text = ''
  for (const ev of parseJsonLines(raw)) {
    if (ev.session_id) sessionId = String(ev.session_id)
    if (ev.type === 'assistant' && ev.message && Array.isArray(ev.message.content)) {
      for (const part of ev.message.content) {
        if (part.type === 'text' && typeof part.text === 'string') text += part.text
      }
    }
    if (ev.type === 'result') result = ev
  }
  if (!result) {
    const single = parseSingleJson(raw)
    if (single && (typeof single.result === 'string' || single.session_id)) result = single
  }
  if (result) {
    const out = { ...result }
    if (!out.session_id && sessionId) out.session_id = sessionId
    if (typeof out.result !== 'string' && text) out.result = text
    return out
  }
  if (text) return { session_id: sessionId, result: text }
  return null
}

export function collectCodex(raw) {
  let answer = ''
  let sessionId = ''
  let usage = null
  let sawJson = false
  let failed = false
  for (const ev of parseJsonLines(raw)) {
    sawJson = true
    if (ev.type === 'thread.started' && ev.thread_id) sessionId = String(ev.thread_id)
    if (ev.type === 'item.completed' && ev.item?.type === 'agent_message' && typeof ev.item.text === 'string') {
      answer = ev.item.text
    }
    if (ev.type === 'turn.completed' && ev.usage) usage = ev.usage
    if (ev.type === 'turn.failed') failed = true
  }
  const tokens = usage
    ? (Number(usage.input_tokens) || 0) + (Number(usage.output_tokens) || 0)
    : null
  return { sawJson, answer, sessionId, usage, tokens, failed }
}

export function collectOpencode(raw) {
  let sessionId = ''
  const texts = []
  let cost = null
  let tokens = null
  for (const ev of parseJsonLines(raw)) {
    if (ev.sessionID) sessionId = String(ev.sessionID)
    if (ev.type === 'text' && ev.part && typeof ev.part.text === 'string') texts.push(ev.part.text)
    if (ev.part && ev.part.type === 'step-finish') {
      if (typeof ev.part.cost === 'number') cost = (cost || 0) + ev.part.cost
      if (ev.part.tokens) tokens = ev.part.tokens
    }
  }
  return {
    sawJson: texts.length > 0,
    answer: texts.join('\n').trim(),
    sessionId,
    cost,
    tokens,
  }
}
