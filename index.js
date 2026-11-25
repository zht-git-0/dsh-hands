import { spawn, spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'
import { StringDecoder } from 'node:string_decoder'
import {
  collectAgy,
  collectClaude,
  collectCodex,
  collectOpencode,
  createLiveView,
} from './stream.js'
import { createAcpSessionPool } from './acp/session-pool.mjs'

export const name = 'hands'
export const inject = ['tools', 'webServer']

// agy（Antigravity CLI）默认装在这里；config.bin 可以覆盖。
const DEFAULT_BIN =
  process.platform === 'win32'
    ? path.join(os.homedir(), 'AppData', 'Local', 'agy', 'bin', 'agy.exe')
    : 'agy'

// agy 自己的会话资料：每个会话的标题、预览、最近修改、所属工作区
const AGY_ROOT = path.join(os.homedir(), '.gemini', 'antigravity-cli')
const META_FILE = path.join(AGY_ROOT, 'cache', 'conversation_metadata.json')
const LAST_FILE = path.join(AGY_ROOT, 'cache', 'last_conversations.json')
// 我自己的名字索引：label -> { id, cwd, updated }
const INDEX_FILE = path.join(os.homedir(), '.dsh', 'agy-sessions.json')

// 一个会话在磁盘上的三处痕迹：会话库、brain 工作区、标注
function sessionPaths(id) {
  return {
    db: path.join(AGY_ROOT, 'conversations', `${id}.db`),
    brain: path.join(AGY_ROOT, 'brain', id),
    annotations: path.join(AGY_ROOT, 'annotations', `${id}.pbtxt`),
  }
}

// 删会话先丢进 trash，不做不可撤销的删除
function trashDir() {
  return path.join(AGY_ROOT, 'trash')
}

function moveIntoTrash(source, id, label) {
  try {
    if (!fs.existsSync(source)) return null
    const dir = path.join(trashDir(), id)
    fs.mkdirSync(dir, { recursive: true })
    const target = path.join(dir, `${label || 'item'}${path.extname(source) || ''}`)
    fs.renameSync(source, target)
    return target
  } catch {
    return null
  }
}

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'))
  } catch {
    return fallback
  }
}

function writeJson(file, value) {
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.writeFileSync(file, JSON.stringify(value, null, 2), 'utf8')
    return true
  } catch {
    return false
  }
}

function loadIndex() {
  const raw = readJson(INDEX_FILE, {})
  return raw && typeof raw === 'object' ? raw : {}
}

function saveIndex(index) {
  writeJson(INDEX_FILE, index)
}

function listKnownSessions() {
  const meta = readJson(META_FILE, {})?.conversations ?? {}
  const last = readJson(LAST_FILE, {}) ?? {}
  const index = loadIndex()

  const labels = {}
  for (const [label, entry] of Object.entries(index)) {
    if (entry?.id) labels[entry.id] = label
  }
  const cwdOf = {}
  for (const [cwd, id] of Object.entries(last)) {
    if (id && !cwdOf[id]) cwdOf[id] = cwd
  }

  const rows = Object.entries(meta).map(([id, value]) => {
    const s = value?.summary ?? {}
    const workspaces = Array.isArray(s.WorkspaceURIs)
      ? s.WorkspaceURIs.map((u) => {
          try {
            return decodeURIComponent(String(u).replace(/^file:\/\//, ''))
          } catch {
            return String(u)
          }
        })
      : []
    return {
      conversationId: id,
      label: labels[id],
      title: s.Title || '',
      preview: String(s.Preview ?? '').replace(/\s+/g, ' ').slice(0, 120),
      steps: s.NumSteps,
      updatedAt: value?.last_modified_time || s.UpdatedAt || '',
      workspaces,
      lastCwd: cwdOf[id],
    }
  })

  // 索引里有、但 agy 元数据里没有的（少见），也列出来
  for (const [label, entry] of Object.entries(index)) {
    if (!entry?.id || rows.some((r) => r.conversationId === entry.id)) continue
    rows.push({
      conversationId: entry.id,
      label,
      title: '',
      preview: '',
      updatedAt: entry.updated ?? '',
      workspaces: entry.cwd ? [entry.cwd] : [],
      lastCwd: entry.cwd,
    })
  }

  rows.sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)))
  // 工具返回值必须是无损 JSON：抹掉 undefined / 非字符串字段
  return rows.map((row) => {
    const clean = {}
    for (const [key, value] of Object.entries(row)) {
      if (value === undefined || value === null || value === '') continue
      clean[key] = value
    }
    return clean
  })
}

function asText(value) {
  return [{ type: 'text', text: JSON.stringify(value, null, 2) }]
}

// 工具返回值必须是无损 JSON：递归去掉 undefined / null
function clean(value) {
  if (Array.isArray(value)) return value.map(clean)
  if (value && typeof value === 'object') {
    const out = {}
    for (const [key, entry] of Object.entries(value)) {
      if (entry === undefined || entry === null) continue
      out[key] = clean(entry)
    }
    return out
  }
  return value
}

function localDateKey(ms = Date.now()) {
  const date = new Date(ms)
  const pad = (value) => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

// 会话 key：hand/名字。没名字时用目标 sid（或派发 id）的短码，
// 不再把所有无名任务塞进「临时-日期」——那会把不同会话误并成一行。
export function fallbackSessionName(id) {
  const sid = String(id || '').trim()
  return sid ? `未命名会话（${sid.slice(0, 8)}）` : '未命名会话'
}

function isFallbackSessionName(name) {
  return /^未命名会话（.{1,8}）$/.test(String(name || '')) || name === '未命名会话'
}

function sessionKeyOf(hand, session, startedMs = Date.now(), fallbackId = '') {
  const name = String(session || '').trim()
  return `${hand}/${name || fallbackSessionName(fallbackId)}`
}

// 按目标会话 id 反查名字索引。sessionId 是 DSH 调用方 id，绝不能拿来当手下会话 id。
export function sessionMetadataFromIndex(index, conversationId) {
  const wanted = String(conversationId || '').trim()
  if (!wanted || !index || typeof index !== 'object') return null
  let latest = null
  let cwd = ''
  let cwdUpdated = ''
  for (const [name, value] of Object.entries(index)) {
    if (!value || typeof value !== 'object' || String(value.id || '') !== wanted) continue
    const entry = { name, cwd: String(value.cwd || ''), updated: String(value.updated || '') }
    if (!latest || entry.updated > latest.updated) latest = entry
    if (entry.cwd && (!cwd || entry.updated > cwdUpdated)) {
      cwd = entry.cwd
      cwdUpdated = entry.updated
    }
  }
  return latest ? { ...latest, cwd: cwd || latest.cwd } : null
}

// 恢复任务/老日志缺 name 或 cwd 时，用目标 conversationId 补元数据。
// 查不到就显示「未命名会话（sid 前 8 位）」，仍保留原 hand，不制造未分组。
export function recoverSessionMetadata(entry, sessionIndexes = {}) {
  const hand = String(entry?.hand || '')
  const conversationId = String(entry?.conversationId || '')
  const indexed = sessionMetadataFromIndex(sessionIndexes?.[hand], conversationId)
  const fallbackId = conversationId || String(entry?.dispatchId || entry?.id || '')
  const currentName = String(entry?.session || entry?.name || '').trim()
  const name = currentName && !isFallbackSessionName(currentName)
    ? currentName
    : indexed?.name || currentName || fallbackSessionName(fallbackId)
  const cwd = String(entry?.cwd || '').trim() || indexed?.cwd || ''
  const oldKey = String(entry?.sessionKey || '')
  const fallbackKey = `${hand}/${fallbackSessionName(fallbackId)}`
  const sessionKey = !oldKey || /\/临时-\d{4}-\d{2}-\d{2}$/.test(oldKey) || oldKey === fallbackKey
    ? `${hand}/${name}`
    : oldKey
  return {
    ...entry,
    session: name,
    name,
    sessionKey,
    cwd,
  }
}

// 一条记录属于哪个会话 key。算法和 listSessions 保持一致：
// 有名会话走 hand/sid:<conversationId>，没 conversationId 的才退回 sessionKey。
export function turnKeyOf(entry) {
  const hand = String(entry?.hand || '')
  const startedMs = Date.parse(entry?.startedAt || entry?.at) || 0
  const sid = String(entry?.conversationId || entry?.id || '')
  const oldKey = String(entry?.sessionKey || '')
  const sessionKey = !oldKey || /\/临时-\d{4}-\d{2}-\d{2}$/.test(oldKey)
    ? sessionKeyOf(hand, entry?.session, startedMs, sid)
    : oldKey
  const conversationId = String(entry?.conversationId || '')
  return conversationId ? `${hand}/sid:${conversationId}` : sessionKey
}

// 查询 key 能命中一条记录的所有写法：正规 key、sessionKey、sid 后缀。
// 抽成纯函数给 /turns 和 /stream?key= 的 live 分支共用，避免两套 key 逻辑漂移。
export function turnMatches(entry, key) {
  const wanted = String(key || '')
  if (!wanted) return false
  // key 的第一段就是 hand；不同 hand 永远不互相命中（否则 sid:xxx 后缀会串味）
  const cut = wanted.indexOf('/')
  const wantedHand = cut > 0 ? wanted.slice(0, cut) : ''
  if (wantedHand && String(entry?.hand || '') !== wantedHand) return false
  const sessionKey = String(entry?.sessionKey || '')
  const conversationId = String(entry?.conversationId || '')
  return (
    turnKeyOf(entry) === wanted ||
    (sessionKey && sessionKey === wanted) ||
    (conversationId && wanted.endsWith(`sid:${conversationId}`))
  )
}

// 一轮 = 一次派发。把历史 job（mergedJobs 的产物）和在跑的 RUNNING entry
// 摊平成面板要的头字段；纯函数、不碰闭包，acp/test-turns.mjs 直接 import。
// 注意：只挑字段，output / jobFile 一律不往外带（太占带宽）。
export function turnsFor(jobs, running, key, opts = {}) {
  const wanted = String(key || '')
  if (!wanted) return []
  const before = opts.before ? String(opts.before) : ''
  const limit = Math.min(Math.max(1, Number(opts.limit) || 50), 500)

  const matches = (entry) => turnMatches(entry, wanted)

  const now = Date.now()
  const seen = new Set()
  const rows = []
  const source = [
    ...(Array.isArray(running) ? running : []).map((item) => [item, true]),
    ...(Array.isArray(jobs) ? jobs : []).map((job) => [job, false]),
  ]
  for (const [entry, isRunning] of source) {
    if (!entry || !matches(entry)) continue
    const id = String(entry.id || '')
    if (id && seen.has(id)) continue
    if (id) seen.add(id)
    const startedAt = String(entry.startedAt || entry.at || '')
    if (before && startedAt && startedAt >= before) continue
    rows.push({
      id,
      hand: String(entry.hand || ''),
      tool: String(entry.tool || ''),
      startedAt,
      at: String(entry.at || entry.startedAt || ''),
      status: isRunning ? 'RUNNING' : String(entry.status || (entry.ok === true ? 'OK' : 'UNKNOWN')),
      ok: isRunning ? false : entry.ok === true,
      ms: isRunning ? Math.max(0, now - (Date.parse(startedAt) || now)) : Number(entry.ms) || 0,
      prompt: String(entry.prompt || ''),
      excerpt: String(entry.excerpt || ''),
      tokens: entry.tokens ?? null,
      cost: entry.cost ?? null,
      model: String(entry.model || ''),
      write: !!entry.write,
      running: !!isRunning,
      queued: !isRunning && String(entry.status || '').toUpperCase() === 'QUEUED',
      queuePosition: Number(entry.queuePosition) || 0,
      queueLimit: Number(entry.queueLimit) || 0,
      sessionLockKey: String(entry.sessionLockKey || ''),
    })
  }
  rows.sort((a, b) => String(b.startedAt).localeCompare(String(a.startedAt)))
  return rows.slice(0, limit)
}

// ── 历史轮次的 blocks 补渲染：从 job 文件的原始文本里解析「工具行 + 正文」──
// 老轮次（log 里没有 blocks —— 插件当时没写、或被 interrupted 覆盖掉了）：
// 面板要看到工具列表，就从 `readJobText` 的原文里解析出来喂给前端。
// 文本格式见 stream.js 的 line() 调用：`→ name: detail`（opencode、claude）、
// `[tool] name`（agy）、`$ command` / `✎ path`（codex）、`! error`。
export function deriveBlocksFromText(text) {
  const blocks = []
  let buf = ''
  const flushText = () => {
    const t = String(buf || '').trim()
    if (t) blocks.push({ kind: 'text', text: t })
    buf = ''
  }
  const pushTool = (name, detail = '', status = '') => {
    flushText()
    blocks.push({
      kind: 'tool',
      name: String(name || 'tool').trim().slice(0, 80) || 'tool',
      detail: String(detail || '').trim().slice(0, 200),
      status,
    })
  }
  for (const rawLine of String(text || '').split(/\r?\n/)) {
    const line = String(rawLine || '')
    if (line.startsWith('→ ')) {
      const s = line.slice(2)
      const cut = s.indexOf(': ')
      pushTool(cut > 0 ? s.slice(0, cut) : s, cut > 0 ? s.slice(cut + 2) : '')
      continue
    }
    if (line.startsWith('[tool] ')) {
      pushTool(line.slice('[tool] '.length).trim())
      continue
    }
    if (line.startsWith('$ ') || line.startsWith('✎ ')) {
      pushTool(line.slice(2).trim())
      continue
    }
    if (line.startsWith('! ')) {
      pushTool(line.slice(2).trim(), '', 'error')
      continue
    }
    if (line.trim()) buf += (buf ? '\n' : '') + line
  }
  flushText()
  return blocks.slice(-80)
}

function shortTextHash(value) {
  let hash = 2166136261
  const text = String(value || '')
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

// SSE 用签名判断语义分块是否变化；status/output 变化也必须推帧。
export function blocksSignature(blocks) {
  if (!Array.isArray(blocks) || !blocks.length) return ''
  return `${blocks.length}:${blocks.map((block) => [
    String(block?.kind || ''),
    String(block?.text || '').length,
    shortTextHash(block?.text),
    String(block?.name || ''),
    String(block?.status || ''),
    String(block?.output || '').length,
    shortTextHash(block?.output),
    String(block?.detail || ''),
  ].join(':')).join('|')}`
}

// live 增量记账：只发 text 从 sentLength 起新增的那一段。
// sentLength 可能来自上一帧的 next，理论上不会越界，但磁盘上的全文会变（截尾 / 重写），
// 越界时夹到 [0, text.length]，保证 next 永远不往回退。
// 纯函数，acp/test-live-delta.mjs 直接 import。
export function computeLiveDelta(text, sentLength) {
  const full = String(text ?? '')
  let sent = Number(sentLength)
  if (Number.isNaN(sent)) sent = 0
  // ±Infinity 也算越界：正的夹到末尾，负的夹到开头
  if (!Number.isFinite(sent)) sent = sent > 0 ? full.length : 0
  sent = Math.trunc(sent)
  if (sent < 0) sent = 0
  if (sent > full.length) sent = full.length
  const delta = full.slice(sent)
  return { delta, next: sent + delta.length, changed: delta.length > 0 }
}

// 实时文本是尾部滑窗时，用单调 totalLength 作为绝对偏移，窗口滑动才不会冻结增量。
export function computeLiveDeltaByLength(text, sentLength, totalLength) {
  const full = String(text ?? '')
  let sent = Number(sentLength)
  if (!Number.isFinite(sent) || sent < 0) sent = 0
  sent = Math.trunc(sent)
  let total = Number(totalLength)
  if (!Number.isFinite(total) || total < 0) total = full.length
  total = Math.trunc(total)
  const next = Math.max(sent, total)
  const count = Math.max(0, next - sent)
  const delta = count ? full.slice(-count) : ''
  return { delta, from: next - delta.length, next, changed: delta.length > 0 }
}

// /health 的 30s 缓存 + in-flight 合并：并发请求共享同一次探测，别同时起四份。
// now 可注入，acp/test-health.mjs 不需要真等 30 秒。探测抛错时不缓存，下次重试。
export function withHealthCache(fn, { ttlMs = 30000, now = Date.now } = {}) {
  let at = 0
  let value
  let inflight = null

  const cached = async () => {
    if (at && now() - at < ttlMs) return value
    if (inflight) return inflight
    const job = (async () => {
      try {
        const fresh = await fn()
        value = fresh
        at = now()
        return fresh
      } finally {
        // 不管成没成都要把闸放开，否则一次失败会永久卡住后续请求
        if (inflight === job) inflight = null
      }
    })()
    inflight = job
    return job
  }

  // 只读缓存，不触发探测；调试和测试用
  cached.peek = () => (at ? { at, value } : null)
  cached.reset = () => {
    at = 0
    value = undefined
    inflight = null
  }
  return cached
}

// 只保留 UTF-8 文本的最后 maxBytes 字节，别把多字节字符切成两半。
function tailUtf8(value, maxBytes) {
  const text = String(value || '')
  const buf = Buffer.from(text, 'utf8')
  if (buf.length <= maxBytes) return text
  let start = buf.length - maxBytes
  while (start < buf.length && (buf[start] & 0xc0) === 0x80) start += 1
  return buf.subarray(start).toString('utf8')
}

export const MAX_PROCESS_OUTPUT_BYTES = 2 * 1024 * 1024
const PROCESS_OUTPUT_HEAD_BYTES = 128 * 1024

// 头部保留 init/session id，尾部保留最终 result；中间超长输出截掉。
function capProcessOutput(value) {
  const text = String(value || '')
  const buf = Buffer.from(text, 'utf8')
  if (buf.length <= MAX_PROCESS_OUTPUT_BYTES) return text
  let headEnd = Math.min(PROCESS_OUTPUT_HEAD_BYTES, MAX_PROCESS_OUTPUT_BYTES)
  while (headEnd > 0 && headEnd < buf.length && (buf[headEnd] & 0xc0) === 0x80) headEnd -= 1
  const head = buf.subarray(0, headEnd).toString('utf8')
  const tail = tailUtf8(text, Math.max(0, MAX_PROCESS_OUTPUT_BYTES - headEnd - 1))
  return head + '\n' + tail
}

// 杀一整棵进程树。只针对我们自己 spawn 出来的 pid，绝不按镜像名连坐。
// Windows 上 CLI 常常再套一层 cmd/孙进程，child.kill() 会留下孤儿，所以走 taskkill /T /F；
// 其它平台先按进程组杀（spawn 时若 detach 过），再退回单 pid。
// 纯函数、只吃 pid，方便 acp/test-cancel.mjs 直接 import。
export function killProcessTree(pid) {
  const target = Number(pid)
  if (!Number.isFinite(target) || target <= 0) return Promise.resolve(false)

  if (process.platform === 'win32') {
    return new Promise((resolve) => {
      let settled = false
      const settle = (value) => {
        if (settled) return
        settled = true
        resolve(value)
      }
      let killer
      try {
        killer = spawn('taskkill', ['/PID', String(target), '/T', '/F'], {
          windowsHide: true,
          stdio: 'ignore',
        })
      } catch {
        settle(false)
        return
      }
      // taskkill 自己卡住时别把 HTTP 响应拖死
      const timer = setTimeout(() => settle(false), 10000)
      killer.on('error', () => {
        clearTimeout(timer)
        settle(false)
      })
      killer.on('close', (code) => {
        clearTimeout(timer)
        settle(code === 0)
      })
    })
  }

  // 先试进程组（pid 前面加负号），不行再单杀
  try {
    process.kill(-target, 'SIGTERM')
    return Promise.resolve(true)
  } catch {
    /* 不是组长 */
  }
  try {
    process.kill(target, 'SIGTERM')
    return Promise.resolve(true)
  } catch {
    return Promise.resolve(false)
  }
}

// ── /health 探测 ──────────────────────────────────────────────────────────
// 每家只看两件事：bin 在不在、能不能跑起来（--version，失败再退 --help）。
// 单次 spawn 5 秒超时，整家 20 秒封顶；任何失败都折算成字段，不抛给 HTTP。
const HEALTH_TTL_MS = 30000
const HEALTH_PROBE_TIMEOUT_SEC = 5
const HEALTH_AGENT_TIMEOUT_MS = 20000

function firstLine(value, max = 80) {
  const line = String(value || '')
    .split(/\r?\n/)
    .map((item) => item.trim())
    .find(Boolean)
  return line ? line.slice(0, max) : ''
}

function withTimeout(promise, ms, fallback) {
  return new Promise((resolve) => {
    let settled = false
    const finish = (value) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolve(value)
    }
    const timer = setTimeout(() => finish(fallback), ms)
    Promise.resolve(promise).then(finish, () => finish(fallback))
  })
}

async function probeAgent(exe) {
  const binPath = String(exe || '')
  const exists = !!binPath && fs.existsSync(binPath)
  // 绝对路径 / 带目录的写法找不到就是找不到，不用再去起进程
  if (!exists && (path.isAbsolute(binPath) || binPath.includes(path.sep))) {
    return clean({ bin: binPath, exists: false, runnable: false, version: '', error: 'not found' })
  }

  let firstError = ''
  let version = ''
  for (const args of [['--version'], ['--help']]) {
    const result = await runProcess(binPath, args, { timeoutSec: HEALTH_PROBE_TIMEOUT_SEC })
    const line = firstLine(result.stdout) || firstLine(result.stderr)
    if (!version) version = line
    if (result.code === 0) {
      return clean({ bin: binPath, exists, runnable: true, version: line || version, exitCode: 0 })
    }
    if (!firstError) {
      firstError = result.timedOut
        ? 'timeout'
        : firstLine(result.stderr) || line || `exit ${result.code}`
    }
  }
  return clean({ bin: binPath, exists, runnable: false, version, error: firstError || 'not runnable' })
}

async function healthPayload(bins) {
  const entries = Object.entries(bins)
  const settled = await Promise.allSettled(
    entries.map(([, exe]) =>
      withTimeout(
        probeAgent(exe).catch((error) => ({
          bin: String(exe || ''),
          exists: false,
          runnable: false,
          version: '',
          error: String(error?.message ?? error),
        })),
        HEALTH_AGENT_TIMEOUT_MS,
        {
          bin: String(exe || ''),
          exists: !!exe && fs.existsSync(String(exe)),
          runnable: false,
          version: '',
          error: 'timeout',
        },
      ),
    ),
  )
  const agents = {}
  settled.forEach((result, index) => {
    const [hand, exe] = entries[index]
    agents[hand] =
      result.status === 'fulfilled'
        ? result.value
        : clean({
            bin: String(exe || ''),
            exists: false,
            runnable: false,
            version: '',
            error: String(result.reason?.message ?? result.reason),
          })
  })
  return { checkedAt: new Date().toISOString(), agents }
}

// Windows 上 .cmd/.bat 包装器经 cmd.exe 解析：带换行的参数会被截断（实测 opencode 的
// 包装器收到的只有第一行，见 acp/test-prompt-transport.mjs 第 3 节）。能抠出包装器里
// 真正的 .exe 就直接 spawn 它——参数不过 cmd 解析，多行 prompt 原样进 argv；抠不出就
// 返回 ''，调用方按旧路径走。
export function winCmdExeOf(bin) {
  const target = String(bin || '').trim()
  if (!target || process.platform !== 'win32') return ''
  if (!/\.(cmd|bat)$/i.test(target)) return ''
  try {
    if (!fs.existsSync(target)) return ''
    const dir = path.dirname(path.resolve(target))
    const body = fs.readFileSync(target, 'utf8')
    // 包装器形如：  "%dp0%\node_modules\@opencode\cli\bin\opencode.exe" %*
    const candidates = [
      ...body.matchAll(/"([^"]+)"/g),
      ...body.matchAll(/(?:^|\s)([^\s"']+\.exe)(?=\s|$)/gi),
    ]
    for (const m of candidates) {
      const raw = String((m && m[1]) || '').trim()
      const expanded = raw
        .replace(/%~dp0%/gi, `${dir}\\`)
        .replace(/%dp0%/gi, `${dir}\\`)
      const exe = path.resolve(expanded)
      if (/\.exe$/i.test(exe) && fs.existsSync(exe)) return exe
    }
    // 兜底：同目录同名 .exe（opencode.cmd → opencode.exe）
    const sibling = path.join(dir, path.basename(target).replace(/\.(cmd|bat)$/i, '.exe'))
    return fs.existsSync(sibling) ? sibling : ''
  } catch {
    return ''
  }
}

// 跑一次进程。不经过 shell，参数数组直接交给 spawn，中文和空格都不会被拆坏。
export function runProcess(bin, args, { cwd, timeoutSec = 900, input, onChunk, onSpawn, env } = {}) {
  return new Promise((resolve) => {
    const started = Date.now()
    let child
    let settled = false
    let hardTimer = null
    let exitGraceTimer = null
    // cwd 不存在时 spawn 会报成「spawn cmd.exe ENOENT」，完全看不出真正原因，先自己说清楚
    if (cwd && !fs.existsSync(cwd)) {
      resolve({ code: -1, stdout: '', stderr: `cwd 不存在：${cwd}`, ms: 0, timedOut: false })
      return
    }
    try {
      // stdin 必须显式给个已关闭的管道：codex 在非 TTY 下会等 stdin EOF，
      // 继承父进程的 stdin 会一直挂着（踩过，表现为「Reading additional input from stdin...」然后超时）
      // Windows 上 .cmd/.bat 包装器能不解就走 shell：cmd 把带换行的参数截断（实测只到第一行），
      // 能解出里面真正的 .exe 就直接 spawn 它——参数不过 cmd 解析，多行 prompt 原样进 argv。
      const exe = winCmdExeOf(bin)
      const needsShell = process.platform === 'win32' && !exe && /\.(cmd|bat)$/i.test(bin)
      const spawnBin = exe || bin
      const spawnArgs = needsShell
        ? args.map((a) => (/[\s"&|<>^]/.test(a) ? `"${String(a).replace(/"/g, '""')}"` : a))
        : args
      child = spawn(spawnBin, spawnArgs, {
        cwd: cwd || undefined,
        windowsHide: true,
        env: env || process.env,
        stdio: ['pipe', 'pipe', 'pipe'],
        shell: needsShell,
        detached: process.platform !== 'win32',
      })
      if (input) child.stdin.end(input)
      else child.stdin.end()
      child.stdin?.on('error', () => {})
      // spawn 成功就把句柄交出去记账（RUNNING_PROCS）；这里出错不能影响进程本体
      try {
        onSpawn?.(child)
      } catch {
        /* 记账失败不影响跑活 */
      }
    } catch (error) {
      resolve({ code: -1, stdout: '', stderr: String(error?.message ?? error), ms: 0, timedOut: false })
      return
    }
    let stdout = ''
    let stderr = ''
    let stdoutBytes = 0
    let stderrBytes = 0
    let timedOut = false
    const appendOutput = (key, value) => {
      if (!value) return
      const bytes = Buffer.byteLength(String(value), 'utf8')
      if (key === 'stderr') {
        stderr += value
        stderrBytes += bytes
        if (stderrBytes > MAX_PROCESS_OUTPUT_BYTES) {
          stderr = capProcessOutput(stderr)
          stderrBytes = Buffer.byteLength(stderr, 'utf8')
        }
      } else {
        stdout += value
        stdoutBytes += bytes
        if (stdoutBytes > MAX_PROCESS_OUTPUT_BYTES) {
          stdout = capProcessOutput(stdout)
          stdoutBytes = Buffer.byteLength(stdout, 'utf8')
        }
      }
    }
    // 子进程的 chunk 可能从多字节字符中间切开；直接 toString('utf8') 会把中文变成 �??
    const outDecoder = new StringDecoder('utf8')
    const errDecoder = new StringDecoder('utf8')
    let decodersFlushed = false
    const flushDecoders = () => {
      if (decodersFlushed) return
      decodersFlushed = true
      const outTail = outDecoder.end()
      const errTail = errDecoder.end()
      appendOutput('stdout', outTail)
      appendOutput('stderr', errTail)
      try {
        onChunk?.(outTail, 'stdout')
      } catch {
        /* 实时视图失败不能影响手下干活 */
      }
      try {
        onChunk?.(errTail, 'stderr')
      } catch {
        /* 同上 */
      }
    }
    const finish = (code, errorText = '') => {
      if (settled) return
      settled = true
      clearTimeout(hardTimer)
      clearTimeout(exitGraceTimer)
      flushDecoders()
      if (errorText) appendOutput('stderr', errorText)
      resolve({ code, stdout, stderr, ms: Date.now() - started, timedOut })
    }
    hardTimer = timeoutSec > 0 ? setTimeout(() => {
      timedOut = true
      const forceFinish = () => {
        child.stdout?.destroy()
        child.stderr?.destroy()
        finish(-1)
      }
      try {
        if (process.platform === 'win32' && child.pid) {
          const killer = spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' })
          killer.on('error', forceFinish)
        } else {
          try {
            process.kill(-child.pid, 'SIGKILL')
          } catch {
            child.kill('SIGKILL')
          }
        }
      } catch {
        /* 尽力而为 */
      }
      // 杀进程失败也不能让队列槽位永久占死。
      exitGraceTimer = setTimeout(forceFinish, 2000)
    }, Math.max(5, timeoutSec) * 1000) : null

    child.stdout?.on('data', (chunk) => {
      if (settled) return
      const text = outDecoder.write(chunk)
      appendOutput('stdout', text)
      try {
        onChunk?.(text, 'stdout')
      } catch {
        /* 实时视图失败不能影响手下干活 */
      }
    })
    child.stderr?.on('data', (chunk) => {
      if (settled) return
      const text = errDecoder.write(chunk)
      appendOutput('stderr', text)
      try {
        onChunk?.(text, 'stderr')
      } catch {
        /* 同上 */
      }
    })
    child.on('error', (error) => finish(-1, error?.message ?? String(error)))
    child.on('exit', (code) => {
      if (settled) return
      clearTimeout(hardTimer)
      clearTimeout(exitGraceTimer)
      // Windows 孙进程可能继续持有 stdout/stderr 管道，让 close 永远不来。
      // 主进程退出后给管道 2 秒收尾；不再对已退出的 pid 调 taskkill，避免误伤复用 pid。
      exitGraceTimer = setTimeout(() => {
        child.stdout?.destroy()
        child.stderr?.destroy()
        finish(code)
      }, 2000)
    })
    child.on('close', (code) => finish(code))
  })
}

const DEFAULT_OPENCODE_BIN =
  process.platform === 'win32'
    ? path.join(process.env.ProgramFiles || 'C:\\Program Files', 'nodejs', 'opencode.cmd')
    : 'opencode'

const DEFAULT_CLAUDE_BIN =
  process.platform === 'win32'
    ? path.join(os.homedir(), '.local', 'bin', 'claude.exe')
    : 'claude'

const DEFAULT_CODEX_BIN =
  process.platform === 'win32'
    ? path.join(os.homedir(), 'AppData', 'Local', 'Programs', 'OpenAI', 'Codex', 'bin', 'codex.exe')
    : 'codex'

// ── 异步回传：纯函数，单独导出给 acp/test-async.mjs 测 ──────────────────

// 二进制会搬家：重装、升级、开机后目录没了（2026-11-18 实测：~/.local/bin 整个不见了）。
// 按顺序试，第一个真实存在的就用；一个都不在就返回最后一个，
// 至少报错信息里那个路径是「本来该在的位置」，不是瞎编的。
// 裸命令名走 PATH 解析：where（Windows）/ which（其他），拿到绝对路径再判存在。
export function whichBin(name) {
  const raw = String(name || '').trim()
  if (!raw || /[\\/]/.test(raw)) return ''
  try {
    const probe = spawnSync(process.platform === 'win32' ? 'where' : 'which', [raw], {
      encoding: 'utf8',
      timeout: 4000,
      windowsHide: true,
    })
    if (probe.status !== 0) return ''
    const rows = String(probe.stdout || '')
      .split(/\r?\n/)
      .map((x) => x.trim())
      .filter((x) => x && fs.existsSync(x))
    // Windows 上 npm 会同时给 opencode / opencode.cmd / opencode.ps1，
    // 无扩展名那个是 sh 脚本，spawn 不了；优先挑可执行的 .exe/.cmd/.bat。
    const runnable = rows.find((x) => /\.(exe|cmd|bat)$/i.test(x))
    return runnable || rows[0] || ''
  } catch {
    return ''
  }
}

export function pickBin(candidates) {
  const list = (Array.isArray(candidates) ? candidates : [candidates])
    .map((item) => String(item || '').trim())
    .filter(Boolean)
  for (const candidate of list) {
    try {
      if (fs.existsSync(candidate)) return candidate
      // 裸命令名：交给 PATH
      if (!/[\\/]/.test(candidate)) {
        const resolved = whichBin(candidate)
        if (resolved) return resolved
      }
    } catch {
      // 权限问题就当它不存在，继续试下一个
    }
  }
  return list[list.length - 1] || ''
}

// 派活的默认目录：优先用调用方 DSH 会话的 cwd，其次 args.cwd，最后才落到进程 cwd。
// 之前直接 process.cwd()，结果会话被建到 ~/.dsh/profiles/desktop 下（2026-11-21 踩到）。
export function cwdFromExec(exec) {
  try {
    const session = exec && (exec.agent?.session || exec.session || exec.caller?.session)
    const cwd = (session && (session.cwd || session.directory)) || (exec && exec.cwd) || ''
    return typeof cwd === 'string' ? cwd : ''
  } catch {
    return ''
  }
}

export function resolveRunCwd(args, exec) {
  const explicit = args && args.cwd ? String(args.cwd) : ''
  if (explicit) return path.resolve(explicit)
  const fromSession = cwdFromExec(exec)
  return fromSession ? path.resolve(fromSession) : process.cwd()
}

export function sessionIdFromExec(exec) {
  try {
    const agent = exec && (exec.agent || exec.caller || exec.agentRef)
    if (agent && agent.session) {
      const sid = agent.session.id || agent.session.sessionId
      if (typeof sid === 'string' && sid) return sid
    }
    if (agent && typeof agent === 'object') {
      for (const key of ['sessionId', 'id']) {
        if (typeof agent[key] === 'string' && agent[key]) return agent[key]
      }
    }
  } catch {
    // 拿不到就返回空串，调用方按「不能回传」处理，绝不猜一个会话投进去
  }
  return ''
}

export function findAgentFor(ctx, sessionId) {
  const raw = String(sessionId || '').trim()
  if (!raw) return undefined
  // 工具 execute 收到的 ctx 直接挂着调用方 agent（ctx.agent.followup），
  // 这是最可靠的一条路；ctx.get('agents') 那套是另一层服务上下文，未必在。
  try {
    const direct = ctx && typeof ctx === 'object' ? ctx.agent || ctx.caller || ctx.agentRef : null
    if (direct && typeof direct.followup === 'function') {
      const sid = direct.session && (direct.session.id || direct.session.sessionId)
      // 有 session id 时对一下，避免把 A 会话的回传投到 B
      if (!sid || !raw || String(sid) === raw) return direct
      if (String(sid) !== raw && String(sid).replace(/^session-/, '') === raw.replace(/^session-/, '')) {
        return direct
      }
    }
  } catch {
    /* 落到下面的注册表查找 */
  }
  let agents
  try {
    agents = (ctx && typeof ctx.get === 'function' ? ctx.get('agents') : undefined) || ctx?.agents
  } catch {
    return undefined
  }
  if (!agents || typeof agents.get !== 'function') return undefined
  const candidates = [raw]
  if (raw.startsWith('session-')) candidates.push(raw.slice('session-'.length))
  else candidates.push(`session-${raw}`)
  for (const candidate of candidates) {
    try {
      const agent = agents.get(candidate)
      if (agent) return agent
    } catch {
      // 试下一个写法
    }
  }
  return undefined
}

export function formatDuration(ms) {
  const total = Math.max(0, Number(ms) || 0)
  const minutes = Math.floor(total / 60000)
  const seconds = Math.round((total % 60000) / 1000)
  if (minutes >= 60) return `${Math.floor(minutes / 60)} 小时 ${minutes % 60} 分`
  return minutes ? `${minutes} 分 ${seconds} 秒` : `${seconds} 秒`
}

// 回传正文：状态行 + 派活原文 + 结果摘要 + 完整日志位置，一段纯文本
export function asyncReportText(job, summary) {
  const lines = []
  lines.push(`【手下回传】${job.hand} · ${job.tool}`)
  lines.push(
    `状态 ${summary.status} · 用时 ${formatDuration(summary.ms)} · 退出码 ${
      summary.exitCode === undefined || summary.exitCode === null ? '—' : summary.exitCode
    }${summary.cost ? ` · 花费 $${Number(summary.cost).toFixed(4)}` : ''}`,
  )
  const prompt = String(job.prompt || '').trim()
  if (prompt) lines.push(`派活：${prompt.length > 160 ? `${prompt.slice(0, 160)}…` : prompt}`)
  const body = String(summary.excerpt || '').trim()
  lines.push('')
  lines.push(body ? (body.length > 1800 ? `${body.slice(0, 1800)}…` : body) : '（没有输出）')
  if (summary.jobFile) {
    lines.push('')
    lines.push(`完整日志：${summary.jobFile}`)
  }
  if (summary.error) {
    lines.push('')
    lines.push(`错误：${String(summary.error).slice(0, 400)}`)
  }
  return lines.join('\n')
}

// ── 异步任务的落盘状态：重启不丢、同一份回传不重复投 ────────────────────
// 内存里的 ASYNC_JOBS 只服务「正在跑」的那几秒；真正要活过重启的是这个文件。
// 每个 job 记到 delivery=sent 才算完，重启后只补投没投出去的那些。
export const ASYNC_STATE_FILE = path.join(os.homedir(), '.dsh', 'hands-async.json')

export function readAsyncState(file = ASYNC_STATE_FILE) {
  try {
    const data = JSON.parse(fs.readFileSync(file, 'utf8'))
    if (data && typeof data === 'object' && data.jobs && typeof data.jobs === 'object') return data
  } catch {
    // 没有文件 / 文件坏了：当成空状态，不影响插件启动
  }
  return { v: 1, jobs: {} }
}

function asyncJobStartedMs(value) {
  const numeric = Number(value)
  if (Number.isFinite(numeric)) return numeric
  const parsed = Date.parse(String(value || ''))
  return Number.isFinite(parsed) ? parsed : 0
}

export function writeAsyncState(state, file = ASYNC_STATE_FILE) {
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true })
    const entries = Object.entries(state?.jobs || {})
      .sort((a, b) => asyncJobStartedMs(b[1]?.startedAt) - asyncJobStartedMs(a[1]?.startedAt))
      .slice(0, 200)
    const jobs = Object.fromEntries(entries)
    fs.writeFileSync(file, JSON.stringify({ v: 1, jobs }, null, 1), 'utf8')
    // 落盘副本和内存 state 同步裁剪，避免 asyncState.jobs 只增不减。
    if (state && typeof state === 'object') state.jobs = jobs
    return true
  } catch {
    return false
  }
}

// EPERM 只说明没权限探测，不能证明进程还活着；普通权限下按不存活处理。
export function isProcessAlive(pid) {
  const target = Number(pid)
  if (!Number.isInteger(target) || target <= 0) return false
  try {
    process.kill(target, 0)
    return true
  } catch {
    return false
  }
}

export const MAX_RECOVERED_PROCESS_AGE_MS = 24 * 60 * 60 * 1000
export const PROCESS_START_TOLERANCE_MS = 5_000

// 尽力读取进程启动时间（Unix ms）。Windows 走 PowerShell，Linux 读 /proc，其它 POSIX 用 ps。
function readProcessStartTimeUncached(pid) {
  const target = Number(pid)
  if (!Number.isInteger(target) || target <= 0) return null
  try {
    if (process.platform === 'win32') {
      const result = spawnSync('powershell.exe', [
        '-NoProfile', '-NonInteractive', '-Command',
        `(Get-Process -Id ${target} -ErrorAction Stop).StartTime.ToFileTimeUtc()`,
      ], { encoding: 'utf8', timeout: 1500, windowsHide: true })
      if (result.status !== 0) return null
      const fileTime = Number(String(result.stdout || '').trim())
      return Number.isFinite(fileTime) ? Math.trunc(fileTime / 10000) - 11644473600000 : null
    }
    if (process.platform === 'linux') {
      const stat = fs.readFileSync(`/proc/${target}/stat`, 'utf8')
      const close = stat.lastIndexOf(')')
      if (close < 0) return null
      const fields = stat.slice(close + 2).trim().split(/\s+/)
      const ticks = Number(fields[19])
      const boot = fs.readFileSync('/proc/stat', 'utf8').match(/^btime\s+(\d+)/m)
      const tickRate = Number(spawnSync('getconf', ['CLK_TCK'], { encoding: 'utf8', timeout: 500 }).stdout) || 100
      if (!Number.isFinite(ticks) || !boot) return null
      return Number(boot[1]) * 1000 + Math.trunc((ticks / tickRate) * 1000)
    }
    const result = spawnSync('ps', ['-p', String(target), '-o', 'lstart='], { encoding: 'utf8', timeout: 1000 })
    if (result.status !== 0) return null
    const at = Date.parse(String(result.stdout || '').trim())
    return Number.isFinite(at) ? at : null
  } catch {
    return null
  }
}

const processStartCache = new Map()
export function getProcessStartTime(pid) {
  const target = Number(pid)
  const cached = processStartCache.get(target)
  if (cached && Date.now() - cached.at < 2000) return cached.value
  const value = readProcessStartTimeUncached(target)
  processStartCache.set(target, { at: Date.now(), value })
  if (processStartCache.size > 50) processStartCache.delete(processStartCache.keys().next().value)
  return value
}

// 异步任务是否仍活跃：有 pid 时以进程存活为准（宿主重启后 pid 真死了就收尸）；
// 没 pid 的旧记录才退回 status=RUNNING（无法确认死亡，不能贸然标中断）。
export function isAsyncJobActive(record, {
  isAlive,
  inspectProcess = getProcessStartTime,
  now = Date.now(),
  maxAgeMs = MAX_RECOVERED_PROCESS_AGE_MS,
  startToleranceMs = PROCESS_START_TOLERANCE_MS,
} = {}) {
  if (!record?.id || record.endedAt) return false
  // QUEUED 明确表示进程从未启动，不能因为旧版本没有 pid 就误判成 RUNNING。
  if (String(record.status || '').toUpperCase() === 'QUEUED') return false
  const alive = typeof isAlive === 'function' ? isAlive : isProcessAlive
  const pid = Number(record.pid)
  if (Number.isInteger(pid) && pid > 0) {
    if (!alive(pid)) return false
    const expectedStart = Number(record.pidStartedAt)
    if (record.pidStartVerified === true && Number.isFinite(expectedStart)) {
      const currentStart = Number(inspectProcess(pid))
      if (Number.isFinite(currentStart)) return Math.abs(currentStart - expectedStart) <= startToleranceMs
    }
    // 没拿到可信启动时间（旧记录/平台不支持）时才用最大寿命兜底。
    const startedAt = Number(record.startedAt)
    const taskStartedMs = Number.isFinite(startedAt) ? startedAt : Date.parse(String(record.startedAt || ''))
    return !Number.isFinite(taskStartedMs) || Number(now) - taskStartedMs <= maxAgeMs
  }
  return String(record.status || '').toUpperCase() === 'RUNNING'
}

// async jobId 与派发日志 id 的关联：
// 1) 新记录显式写 dispatchId；2) 两者本来就同 id；
// 3) 修复前 hands_run 先派发、后生成 UUID，只能按 hand/tool、完整 prompt、时间唯一匹配。
// 第 3 条只接受 10 秒内唯一候选，绝不凭时间接近就硬合并。
export const ASYNC_DISPATCH_MATCH_WINDOW_MS = 10_000

export function findAsyncDispatchStart(record, recordsOrStarts) {
  if (!record) return null
  const starts = recordsOrStarts instanceof Map
    ? recordsOrStarts
    : new Map(
        (Array.isArray(recordsOrStarts) ? recordsOrStarts : [])
          .filter((entry) => entry?.phase === 'start' && entry?.id)
          .map((entry) => [String(entry.id), entry]),
      )
  const explicit = String(record.dispatchId || '')
  if (explicit) return starts.get(explicit) || null
  const direct = String(record.id || '')
  if (direct && starts.has(direct)) return starts.get(direct)
  const rawStarted = record.startedAt
  const numericStarted = Number(rawStarted)
  const startedMs = Number.isFinite(numericStarted) ? numericStarted : Date.parse(String(rawStarted || ''))
  const prompt = String(record.prompt || '')
  if (!Number.isFinite(startedMs) || !prompt) return null
  const candidates = []
  for (const start of starts.values()) {
    if (String(start.hand || '') !== String(record.hand || '')) continue
    if (record.tool && start.tool && String(record.tool) !== String(start.tool)) continue
    const at = Date.parse(String(start.startedAt || start.at || ''))
    if (!Number.isFinite(at) || Math.abs(at - startedMs) > ASYNC_DISPATCH_MATCH_WINDOW_MS) continue
    const startPrompt = String(start.prompt || '')
    if (!startPrompt) continue
    // startDispatch 会把 prompt 截到 4000；只认完整一致或精确的截断前缀。
    if (startPrompt !== prompt && !(startPrompt.length === 4000 && prompt.startsWith(startPrompt))) continue
    candidates.push({ start, distance: Math.abs(at - startedMs) })
  }
  return candidates.length === 1 ? candidates[0].start : null
}

// 启动对账计划：有 start 没 end，但 asyncState 仍 RUNNING / pid 仍活着的，不收尸。
// 只有无法证明还活着的才补 INTERRUPTED。纯函数，方便测「插件重启但进程没死」。
export function planLogReconciliation(records, asyncJobs = {}, { isAlive, inspectProcess, now, maxAgeMs, startToleranceMs, runningIds = [] } = {}) {
  const starts = new Map()
  const ended = new Set()
  for (const record of Array.isArray(records) ? records : []) {
    if (!record?.id) continue
    const id = String(record.id)
    if (record.phase === 'start') starts.set(id, record)
    else if (record.phase === 'end') ended.add(id)
  }
  const active = new Set((Array.isArray(runningIds) ? runningIds : []).map(String).filter(Boolean))
  for (const record of Object.values(asyncJobs || {})) {
    if (!isAsyncJobActive(record, { isAlive, inspectProcess, now, maxAgeMs, startToleranceMs })) continue
    const start = findAsyncDispatchStart(record, starts)
    active.add(String(start?.id || record.dispatchId || record.id || ''))
  }
  const interrupt = []
  for (const [id, start] of starts) {
    if (ended.has(id) || active.has(id)) continue
    interrupt.push({ id, start })
  }
  return { interrupt, active: [...active].filter((id) => starts.has(id) && !ended.has(id)) }
}

// 重启后该做什么：没跑完的里真死了才标 ORPHAN（进程已经没了），跑完但没投的补投一次。
// 「没跑完」只有在进程确认不在时才算（见 isProcessAlive）：进程还活着的留 running——
// 诚实标签，别把「可能还在跑」宣成「已死无结果」。
// 纯函数，只决定「要不要投 / 标什么」，真投递在外面做 —— 这样能单测。
export function planAsyncRecovery(state, { isAlive, inspectProcess, now, maxAgeMs, startToleranceMs } = {}) {
  const jobs = Object.values(state?.jobs || {})
  const deliver = []
  const orphan = []
  const running = []
  const queued = []
  for (const record of jobs) {
    if (!record || !record.id) continue
    if (record.delivery === 'sent') continue
    if (!record.endedAt && String(record.status || '').toUpperCase() === 'QUEUED') {
      queued.push(record.id)
      continue
    }
    if (!record.endedAt) {
      if (isAsyncJobActive(record, { isAlive, inspectProcess, now, maxAgeMs, startToleranceMs })) running.push(record.id)
      else orphan.push(record.id)
      continue
    }
    if (record.report) deliver.push(record.id)
  }
  return { deliver, orphan, running, queued }
}

// ── 回传重试：投不进去就退避重试，别把一次「会话正忙」当成永久失败 ──────────
// 场景：异步任务跑完时父会话恰好繁忙 / agent 句柄瞬时拿不到，followup 会抛。
// 只靠重启补投太重（要重启才有第二次机会），这里在进程内退避重试 3 次。
export const ASYNC_DELIVERY_RETRY_DELAYS_MS = [30 * 1000, 90 * 1000, 240 * 1000]

export function asyncDeliveryRetryDelay(attempt, delays = ASYNC_DELIVERY_RETRY_DELAYS_MS) {
  const index = Number(attempt)
  if (!Number.isInteger(index) || index < 0) return -1
  const list = Array.isArray(delays) && delays.length ? delays : ASYNC_DELIVERY_RETRY_DELAYS_MS
  if (index >= list.length) return -1
  return Math.max(1000, Number(list[index]) || 0)
}

// 投递结果 → 下一次投递状态。纯函数，acp/test-async-retry.mjs 直接测。
// attempts 记「已经重试过几次」：第一次失败后 attempts=1，下一次间隔取 delays[0]。
export function nextAsyncDelivery(record, result, now = Date.now(), delays = ASYNC_DELIVERY_RETRY_DELAYS_MS) {
  const attempts = Math.max(0, Number(record?.deliveryAttempts || 0))
  if (result === 'sent') {
    return { delivery: 'sent', attempts, retryAt: 0, delayMs: 0, exhausted: false }
  }
  const delayMs = asyncDeliveryRetryDelay(attempts, delays)
  if (delayMs < 0) {
    return { delivery: 'failed', attempts, retryAt: 0, delayMs: 0, exhausted: true }
  }
  return { delivery: 'retrying', attempts: attempts + 1, retryAt: now + delayMs, delayMs, exhausted: false }
}

// 并发闸门：同时最多跑 limit 个，多的排队（先进先出）。
// 提成模块级是为了能单测：并发上限、排队顺序、失败不卡队列。
// run(start, key) 的第二参数是调用方的稳定标识（异步任务传 jobId）；
// cancel(key) 把还在排队的条目摘下、promise 立刻 resolve({cancelled:true})，
// start 不会再被调用；已在跑的条目取消不了（取消在总线上拦截进程）。
export function createAsyncQueue(limit = 3) {
  // 0 要夹到 1（不能退化成默认值），没传/非数字才用默认 3
  const raw = limit === undefined || limit === null || limit === '' ? NaN : Math.trunc(Number(limit))
  const max = Number.isFinite(raw) ? Math.max(1, Math.min(16, raw)) : 3
  let active = 0
  let seq = 0
  const waiting = []
  const activeTasks = new Map()
  const cancelledIds = new Set()

  function pump() {
    while (active < max && waiting.length) {
      const task = waiting.shift()
      task.started = false
      active += 1
      activeTasks.set(task.key, task)
      Promise.resolve()
        .then(() => {
          if (cancelledIds.has(task.key)) return { cancelled: true, cancelledPhase: 'queued' }
          task.started = true
          return task.start()
        })
        .then(task.resolve, task.reject)
        .finally(() => {
          activeTasks.delete(task.key)
          cancelledIds.delete(task.key)
          active -= 1
          pump()
        })
    }
  }

  return {
    run(start, key) {
      const id = key === undefined || key === null ? seq : key
      seq += 1
      return new Promise((resolve, reject) => {
        waiting.push({ start, resolve, reject, key: id })
        pump()
      })
    },
    cancel(key) {
      const index = waiting.findIndex((task) => task.key === key)
      if (index < 0) {
        const task = activeTasks.get(key)
        if (!task || task.started) return false
        cancelledIds.add(key)
        task.resolve({ cancelled: true, cancelledPhase: 'queued' })
        return true
      }
      const [task] = waiting.splice(index, 1)
      task.resolve({ cancelled: true, cancelledPhase: 'queued' })
      return true
    },
    isCancelled(key) {
      return cancelledIds.has(key)
    },
    stats() {
      return { limit: max, active, waiting: waiting.length }
    },
  }
}

// 每个目标会话的等待上限：默认 3 个「排在正在跑的任务后面」的任务，第 4 个驳回。
// 与全局 maxAsync（同时最多跑几个）是两层不同的闸门。
export function normalizeSessionQueueLimit(limit) {
  const raw = limit === undefined || limit === null || limit === '' ? NaN : Math.trunc(Number(limit))
  return Number.isFinite(raw) ? Math.max(1, Math.min(16, raw)) : 3
}

export function normalizeAsyncSessionCwd(value) {
  const raw = String(value || '').trim()
  if (!raw) return ''
  try {
    const resolved = path.resolve(raw).replace(/\\/g, '/')
    return process.platform === 'win32' ? resolved.toLowerCase() : resolved
  } catch {
    return raw.replace(/\\/g, '/')
  }
}

// 锁的是「手下自己的目标会话」，不是调用方 DSH 会话（job.sessionId 只用于回传）。
// 已知 conversationId 时优先用它；同时保留 session+cwd 别名，供新会话在拿到 id 后合并。
export function asyncSessionLockKeys(job = {}) {
  const hand = String(job.hand || '').trim().toLowerCase()
  const conversationId = String(job.conversationId || '').trim()
  const session = String(job.session || '').trim()
  if (conversationId) return [`v1:${hand}:id:${conversationId}`]
  if (session) return [`v1:${hand}:name:${session}:cwd:${normalizeAsyncSessionCwd(job.cwd)}`]
  return [`v1:${hand}:job:${String(job.id || '')}`]
}

// 目标会话级串行队列：每个 lane 同时只允许一个任务进入全局并发闸门。
// 位置是 1-based 的「前面还有几个」；lane 为空时连别名一起清理，不会留死锁。
export function createSessionQueue(limit = 3) {
  const max = normalizeSessionQueueLimit(limit)
  const lanes = new Map()
  const cancelledIds = new Set()

  const findLane = (keys) => {
    for (const key of keys) {
      const lane = lanes.get(key)
      if (lane) return lane
    }
    return null
  }
  const registerKeys = (lane, keys) => {
    for (const key of keys) {
      if (!key) continue
      lanes.set(key, lane)
      lane.keys.add(key)
    }
  }
  const cleanup = (lane) => {
    for (const key of lane.keys) {
      if (lanes.get(key) === lane) lanes.delete(key)
    }
    lane.keys.clear()
  }
  const notifyWaiting = (lane) => {
    lane.waiting.forEach((task, index) => {
      task.onQueue?.({ status: 'QUEUED', position: index + (lane.active ? 1 : 0) })
    })
  }
  const startTask = (lane, task) => {
    lane.active = task
    task.started = false
    try {
      task.onStart?.({ status: 'RUNNING', position: 0 })
    } catch (error) {
      lane.active = null
      task.reject(error)
      pump(lane)
      return
    }
    Promise.resolve()
      .then(() => {
        if (cancelledIds.has(task.key)) return { cancelled: true, cancelledPhase: 'queued' }
        task.started = true
        return task.start()
      })
      .then(task.resolve, task.reject)
      .finally(() => {
        cancelledIds.delete(task.key)
        if (lane.active === task) lane.active = null
        pump(lane)
      })
  }
  const pump = (lane) => {
    if (lane.active) return
    const next = lane.waiting.shift()
    if (!next) {
      cleanup(lane)
      return
    }
    startTask(lane, next)
    notifyWaiting(lane)
  }

  return {
    enqueue({ key, keys = [], start, onStart, onQueue } = {}) {
      const id = String(key ?? '')
      const allKeys = [...new Set([id, ...(Array.isArray(keys) ? keys : [])].filter(Boolean))]
      let lane = findLane(allKeys)
      if (!lane) {
        lane = { keys: new Set(), active: null, waiting: [] }
      }
      let resolve
      let reject
      const promise = new Promise((yes, no) => {
        resolve = yes
        reject = no
      })
      const task = { key: id, start, resolve, reject, onStart, onQueue }
      if (lane.active || lane.waiting.length) {
        if (lane.waiting.length >= max) {
          return { accepted: false, status: 'FULL', position: 0, limit: max, promise: null }
        }
        registerKeys(lane, allKeys)
        lane.waiting.push(task)
        const position = lane.waiting.length - 1 + (lane.active ? 1 : 0)
        onQueue?.({ status: 'QUEUED', position })
        return { accepted: true, status: 'QUEUED', position, limit: max, promise }
      }
      registerKeys(lane, allKeys)
      startTask(lane, task)
      return { accepted: true, status: 'RUNNING', position: 0, limit: max, promise }
    },
    cancel(key) {
      const wanted = String(key ?? '')
      for (const lane of new Set(lanes.values())) {
        const index = lane.waiting.findIndex((task) => task.key === wanted)
        if (index >= 0) {
          const [task] = lane.waiting.splice(index, 1)
          task.resolve({ cancelled: true, cancelledPhase: 'queued' })
          notifyWaiting(lane)
          if (!lane.active) pump(lane)
          return true
        }
        if (lane.active?.key === wanted && lane.active.resolve && !lane.active.started) {
          cancelledIds.add(wanted)
          lane.active.resolve({ cancelled: true, cancelledPhase: 'queued' })
          return true
        }
      }
      return false
    },
    isCancelled(key) {
      return cancelledIds.has(String(key ?? ''));
    },
    addAliases(key, keys = []) {
      const allKeys = [String(key || ''), ...(Array.isArray(keys) ? keys : [])].filter(Boolean)
      const lane = findLane(allKeys)
      if (lane) registerKeys(lane, allKeys)
      return !!lane
    },
    reserve(keys = []) {
      const allKeys = (Array.isArray(keys) ? keys : []).filter(Boolean)
      if (!allKeys.length) return null
      let lane = findLane(allKeys)
      if (!lane) {
        lane = { keys: new Set(), active: null, waiting: [] }
        registerKeys(lane, allKeys)
      } else {
        registerKeys(lane, allKeys)
      }
      if (lane.active) return null
      const token = { reserved: true, key: `reserved:${allKeys[0] || 'unknown'}` }
      lane.active = token
      return token
    },
    release(token) {
      if (!token) return false
      for (const lane of new Set(lanes.values())) {
        if (lane.active !== token) continue
        lane.active = null
        pump(lane)
        return true
      }
      return false
    },
    position(key) {
      const wanted = String(key ?? '')
      for (const lane of new Set(lanes.values())) {
        if (lane.active?.key === wanted) return 0
        const index = lane.waiting.findIndex((task) => task.key === wanted)
        if (index >= 0) return index + 1
      }
      return null
    },
    stats() {
      const unique = new Set(lanes.values())
      let waiting = 0
      for (const lane of unique) waiting += lane.waiting.length
      return { limit: max, sessions: unique.size, waiting }
    },
  }
}

// 打开文件夹的安全闸：只允许打开「已知会话的工作目录」，不接受任意路径。
// 纯函数，acp/test-open-folder.mjs 直接测；返回 '' 表示拒绝。
export function resolveOpenFolder(knownCwds, wanted) {
  const raw = String(wanted || '').trim()
  if (!raw) return ''
  // Windows 路径不分大小写，但字符串比较分；统一小写后再比。
  const norm = (value) => (process.platform === 'win32' ? String(value).toLowerCase() : String(value))
  const target = path.resolve(raw)
  const known = new Set()
  for (const value of Array.isArray(knownCwds) ? knownCwds : []) {
    const item = String(value || '').trim()
    if (item) known.add(norm(path.resolve(item)))
  }
  return known.has(norm(target)) ? target : ''
}

// ── agy 的第三方供应商（provider） ─────────────────────────────────────────────
//
// 用法：
//   - 不传 provider（或 'official'）= 官方：不注入任何 env、不写 settings.json、不传
//     --settings，子进程环境与用户默认一致。
//   - 传 provider=<name> = 读 ~/.dsh/hands-providers.json 里的条目：注入
//     GOOGLE_GEMINI_BASE_URL / GEMINI_API_KEY，并在 ~/.dsh/agy-profiles/<name>/ 写
//     settings.json（{model, modelProvider:'gemini'}），再传 --settings 指给 agy ——
//     agy 在这次会话里认这个第三方模型名，不污染用户默认 ~/.gemini。
//   - 密钥不写明文：优先环境变量 apiKeyEnv；再从 cc-switch 的 sqlite 读
//     （providers 表 app_type='agy'，settings_config.env 里的 GOOGLE_GEMINI_BASE_URL /
//     GEMINI_API_KEY / GEMINI_MODEL）。

export const AGY_PROVIDERS_FILE = path.join(os.homedir(), '.dsh', 'hands-providers.json')
export const AGY_PROFILES_ROOT = path.join(os.homedir(), '.dsh', 'agy-profiles')
export const CC_SWITCH_DB = path.join(os.homedir(), '.cc-switch', 'cc-switch.db')

// node:sqlite 在 Node 22.5+ 才有；老版本或被禁时给 null，cc-switch 兜底就是空。
let sqliteDbSync = undefined
function loadDatabaseSync() {
  if (sqliteDbSync !== undefined) return sqliteDbSync
  try {
    sqliteDbSync = createRequire(import.meta.url)('node:sqlite').DatabaseSync
  } catch {
    sqliteDbSync = null
  }
  return sqliteDbSync
}

function agyClean(value) {
  return String(value ?? '').trim()
}

function normalizeAgyProvider(entry) {
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return null
  return {
    baseUrl: agyClean(entry.baseUrl),
    model: agyClean(entry.model),
    apiKeyEnv: agyClean(entry.apiKeyEnv) || 'GEMINI_API_KEY',
  }
}

// 供应商配置读取：文件缺 / 文件坏 / 没有条目 → 只留 official，不影响插件启动。
export function readAgyProviders(file = AGY_PROVIDERS_FILE) {
  const providers = { official: normalizeAgyProvider({}) }
  try {
    const raw = JSON.parse(fs.readFileSync(file, 'utf8'))
    if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
      for (const [name, entry] of Object.entries(raw)) {
        const norm = normalizeAgyProvider(entry)
        if (norm && agyClean(name)) providers[agyClean(name)] = norm
      }
    }
  } catch {
    /* 没有文件 / 坏文件：只留 official */
  }
  return providers
}

// 供应商配置文件不存在时写一份示例（结构同用户给的示例）；已存在不覆盖。
export function ensureAgyProvidersFile(file = AGY_PROVIDERS_FILE) {
  if (fs.existsSync(file)) return file
  const example = {
    official: {},
    znbcode: { baseUrl: 'https://znbcode.com', apiKeyEnv: 'GEMINI_API_KEY', model: 'Gemini 4 Neon (XHigh)' },
  }
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, JSON.stringify(example, null, 2) + '\n', 'utf8')
  return file
}

// cc-switch（Windows 上换模型的常用工具）里 app_type='agy' 的那条 settings_config：
// 返回 { GOOGLE_GEMINI_BASE_URL, GEMINI_API_KEY, GEMINI_MODEL }；读不到就是空串。
export function readCcSwitchAgyEnv(file = CC_SWITCH_DB, preferredName = '') {
  const out = { GOOGLE_GEMINI_BASE_URL: '', GEMINI_API_KEY: '', GEMINI_MODEL: '' }
  const DatabaseSync = loadDatabaseSync()
  if (!DatabaseSync) return out
  try {
    const db = new DatabaseSync(file, { readOnly: true })
    let rows = []
    try {
      rows = db.prepare("SELECT * FROM providers WHERE app_type = 'agy'").all()
    } catch {
      rows = []
    } finally {
      try {
        db.close()
      } catch {
        /* ignore */
      }
    }
    const envOf = (row) => {
      let sc = row && row.settings_config
      if (typeof sc === 'string') {
        try {
          sc = JSON.parse(sc)
        } catch {
          sc = null
        }
      }
      if (!sc || typeof sc !== 'object') return {}
      const env = sc.env
      return env && typeof env === 'object' ? env : sc
    }
    const pick =
      rows.find((row) => agyClean(row && row.name) === agyClean(preferredName)) ||
      rows.find((row) => agyClean(envOf(row).GEMINI_API_KEY)) ||
      rows[0]
    if (pick) {
      const env = envOf(pick)
      out.GOOGLE_GEMINI_BASE_URL = agyClean(env.GOOGLE_GEMINI_BASE_URL)
      out.GEMINI_API_KEY = agyClean(env.GEMINI_API_KEY)
      out.GEMINI_MODEL = agyClean(env.GEMINI_MODEL)
    }
  } catch {
    /* db 不存在 / 无法读：返回空 */
  }
  return out
}

// 第三方供应商的凭证：{ name, baseUrl, apiKey, model }
// 缺 key → 抛清晰错误（别静默跑官方）；不认识的 provider → 抛错。
export function resolveAgyProviderCredentials(provider, providers = readAgyProviders(), ccSwitchEnv = {}) {
  const name = agyClean(provider) || 'official'
  const entry = (providers && providers[name]) || null
  if (!entry) throw new Error(`未知 agy 供应商「${name}」：请先在 ${AGY_PROVIDERS_FILE} 里添加`)
  if (name === 'official') return { name, baseUrl: '', apiKey: '', model: '' }
  const apiKeyEnv = entry.apiKeyEnv || 'GEMINI_API_KEY'
  const apiKey =
    agyClean(process.env[apiKeyEnv]) ||
    agyClean(ccSwitchEnv[apiKeyEnv]) ||
    agyClean(ccSwitchEnv.GEMINI_API_KEY)
  if (!apiKey) {
    throw new Error(
      `agy 供应商「${name}」缺 API key：请设置环境变量 ${apiKeyEnv}，或在 cc-switch 的 app_type='agy' 提供商里填 GEMINI_API_KEY`,
    )
  }
  return {
    name,
    baseUrl: entry.baseUrl || ccSwitchEnv.GOOGLE_GEMINI_BASE_URL,
    apiKey,
    model: entry.model || ccSwitchEnv.GEMINI_MODEL,
  }
}

export function isSafeAgyConversationId(id) {
  const value = String(id || '').trim()
  return /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(value) && value !== '.' && value !== '..'
}

export function agyProviderSettingsFile(provider, profilesRoot = AGY_PROFILES_ROOT) {
  const name = agyClean(provider).replace(/[^\w.-]+/g, '_') || 'provider'
  if (name === '.' || name === '..') throw new Error('agy provider name must not be a path segment')
  return path.join(profilesRoot, name, 'settings.json')
}

// 独立 settings.json：{model, modelProvider:'gemini'}（没有 model 时不写 model 键），返回路径。
export function writeAgyProviderSettings(provider, model, profilesRoot = AGY_PROFILES_ROOT) {
  const file = agyProviderSettingsFile(provider, profilesRoot)
  fs.mkdirSync(path.dirname(file), { recursive: true })
  const settings = { modelProvider: 'gemini' }
  if (agyClean(model)) settings.model = agyClean(model)
  fs.writeFileSync(file, JSON.stringify(settings, null, 2) + '\n', 'utf8')
  return file
}

// 派活前的供应商准备：
//   { provider:'official', env:null, settingsFile:null } → 官方，什么都不动；
//   { provider, env, settingsFile, credentials }         → 注入 env + 写 settings.json。
export function agyProviderContext(provider, opts = {}) {
  ensureAgyProvidersFile(opts.providersFile)
  const providers = readAgyProviders(opts.providersFile)
  const name = agyClean(provider) || 'official'
  if (name === 'official') return { provider: 'official', env: null, settingsFile: null }
  const ccSwitch = readCcSwitchAgyEnv(opts.ccSwitchFile, providers[name] ? name : '')
  const cred = resolveAgyProviderCredentials(name, providers, ccSwitch)
  const settingsFile = writeAgyProviderSettings(name, cred.model, opts.profilesRoot)
  const env = {}
  if (cred.baseUrl) env.GOOGLE_GEMINI_BASE_URL = cred.baseUrl
  env.GEMINI_API_KEY = cred.apiKey
  return { provider: name, env, settingsFile, credentials: cred }
}

// ── 会话守卫（hoist 到模块顶层，测试直接 import 这些纯逻辑）───────────────────────
// 守卫语义（sessionMode）：
//   resume → 只续已有，找不到就报错；
//   new    → 只新建，重名/近似名就报错（除非 allowNewSession）；
//   auto（默认） → 有就续、没有就建，但近似名仍然要求确认。
export function sameCwd(a, b) {
  const norm = (v) => String(v || '').replace(/[\\/]+$/, '').replace(/\\/g, '/').toLowerCase()
  if (!norm(a) || !norm(b)) return false // 空不算同目录：先前返回 true，守卫因此失效
  return norm(a) === norm(b)
}
const sessionRoot = (name) => String(name || '').trim().toLowerCase().replace(/[\s_\-]*\d+$/, '')
function archiveKeySet(archivedKeys) {
  if (archivedKeys instanceof Set) return archivedKeys
  return new Set(Array.isArray(archivedKeys) ? archivedKeys.map(String).filter(Boolean) : [])
}
// 索引里的名字可能对应两种归档键：hand/名字（没拿到 sid 的旧记录）或 hand/sid:id。
// 两种都认，避免「归档按钮点的是 sid 行，守卫却还按名字统计」。
export function isArchivedSessionEntry(hand, name, entry, archivedKeys) {
  if (entry?.archived === true) return true
  const keys = archiveKeySet(archivedKeys)
  const prefix = String(hand || '')
  if (!prefix) return false
  if (keys.has(String(entry?.key || '')) || keys.has(String(entry?.sessionKey || ''))) return true
  if (keys.has(`${prefix}/${String(name || '')}`)) return true
  const id = String(entry?.id || '')
  return !!id && keys.has(`${prefix}/sid:${id}`)
}
const findLookalikeSession = (index, name, archivedKeys = [], hand = '') => {
  const root = sessionRoot(name)
  if (!root) return []
  return Object.keys(index || {}).filter(
    (k) => k !== name && sessionRoot(k) === root && !isArchivedSessionEntry(hand, k, index[k], archivedKeys),
  )
}
const sameCwdOthers = (index, name, cwd, archivedKeys = [], hand = '') => {
  if (!cwd) return []
  return Object.keys(index || {}).filter((k) => {
    const other = index[k]
    if (k === name || !other || !String(other.cwd || '').trim()) return false
    if (isArchivedSessionEntry(hand, k, other, archivedKeys)) return false
    return sameCwd(other.cwd, cwd)
  })
}
export const NAME_LEDGER = path.join(os.homedir(), '.dsh', 'hands-session-names.json')
const readNameLedger = () => readJson(NAME_LEDGER, {}) || {}
export function recordSessionName(hand, name, id, cwd) {
  if (!name || !id) return
  try {
    const ledger = readNameLedger()
    ledger[String(name)] = { hand, id: String(id), cwd: cwd || '', at: new Date().toISOString() }
    writeJson(NAME_LEDGER, ledger)
  } catch {
    /* 记账失败不影响派活 */
  }
}

// 会话索引只合并一个 key：写盘前重读最新文件，避免两个并发会话用旧快照互相覆盖。
export function updateSessionIndex(file, name, entry) {
  const key = String(name || '').trim()
  if (!key) return false
  let tmp = ''
  try {
    const latest = readJson(file, {}) || {}
    latest[key] = { ...(latest[key] && typeof latest[key] === 'object' ? latest[key] : {}), ...(entry || {}) }
    fs.mkdirSync(path.dirname(file), { recursive: true })
    tmp = `${file}.${process.pid}.${crypto.randomUUID()}.tmp`
    fs.writeFileSync(tmp, JSON.stringify(latest, null, 2) + '\n', 'utf8')
    fs.renameSync(tmp, file)
    return true
  } catch {
    try {
      if (tmp) fs.unlinkSync(tmp)
    } catch {
      /* 临时文件清理失败不影响原索引 */
    }
    return false
  }
}
// 新会话必须用一个从没用过的名字：名字一旦用过，即使 allowNewSession 也不许再开
// （否则面板里会出现两条同名会话，index 只留最新那条，旧的那条就成孤儿）。
function assertFreshName(hand, name, allowNewSession) {
  if (!name) return
  const used = readNameLedger()[String(name)]
  if (!used) return
  throw new Error(
    `${hand}: 会话名「${name}」已经用过（${used.hand} / ${used.cwd || '未知目录'} / ${used.at}）。` +
      '接着干就 resume 原名；要新开请换一个没出现过的名字（同名会让面板出现两条一样的会话）。',
  )
}
// 拒绝新建时给「该目录下所有已有会话」的清单（名字 / 最后活跃时间 / 是否运行中）：
// 让人能直接挑一个 resume，而不是只报一句拒绝。runningNames 缺省取 RUNNING 里当前在跑的会话名。
export function sameDirSessionsEntries(index, name, cwd, runningNames, archivedKeys = [], hand = '') {
  const running = new Set(
    Array.isArray(runningNames)
      ? runningNames.map(String).filter(Boolean)
      : [...RUNNING.values()].map((r) => String(r?.session || '')).filter(Boolean),
  )
  const rows = []
  for (const key of Object.keys(index || {})) {
    if (key === name) continue
    const entry = index[key]
    if (!entry || !sameCwd(entry.cwd, cwd)) continue
    if (isArchivedSessionEntry(hand, key, entry, archivedKeys)) continue
    rows.push({ name: key, at: String(entry.updated || entry.startedAt || ''), running: running.has(key) })
  }
  return rows
}
export function sameDirSessionsText(index, name, cwd, runningNames, archivedKeys = [], hand = '') {
  const rows = sameDirSessionsEntries(index, name, cwd, runningNames, archivedKeys, hand)
  if (!rows.length) return ''
  return `该目录已有会话：${rows.map((r) => `「${r.name}」（活跃 ${r.at || '未知'}，${r.running ? '运行中' : '未运行'}）`).join('、')}。`
}

// 日志行与索引行合并：取消/失败时日志可能没写 conversationId，先按 hand/name 建了一行；
// 索引随后带来真实 sid。把别名行并进 sid 行，保留轮次/今日数/最早开始/最新结束状态。
export function mergeSessionRows(target, alias) {
  if (!target || !alias) return target
  target.turns = (Number(target.turns) || 0) + (Number(alias.turns) || 0)
  target.today = (Number(target.today) || 0) + (Number(alias.today) || 0)
  const targetStart = String(target.startedAt || '')
  const aliasStart = String(alias.startedAt || '')
  if (aliasStart && (!targetStart || aliasStart < targetStart)) target.startedAt = aliasStart
  const targetAt = String(target.lastAt || '')
  const aliasAt = String(alias.lastAt || '')
  if (aliasAt && (!targetAt || aliasAt > targetAt)) {
    target.lastAt = aliasAt
    target.status = alias.status
    target.ok = alias.ok === true
    target.ms = Number(alias.ms) || 0
    target.excerpt = String(alias.excerpt || '')
  }
  target.running = !!(target.running || alias.running)
  if (target.running) {
    target.status = 'RUNNING'
    target.ok = false
  }
  target.notStarted = !target.turns && !target.running ? !!(target.notStarted && alias.notStarted) : false
  for (const key of ['conversationId', 'sessionKey', 'cwd', 'model']) {
    if (!target[key] && alias[key]) target[key] = alias[key]
  }
  if ((!target.name || isFallbackSessionName(target.name)) && alias.name && !isFallbackSessionName(alias.name)) {
    target.name = alias.name
    target.sessionKey = `${target.hand || alias.hand || ''}/${target.name}`
  }
  return target
}

export function upsertSessionIndexRow(rows, hand, name, value = {}) {
  const id = String(value?.id || '')
  const key = id ? `${hand}/sid:${id}` : `${hand}/${name}`
  const aliases = []
  for (const [aliasKey, alias] of rows) {
    if (aliasKey === key || alias?.hand !== hand || alias?.conversationId) continue
    const sameName = alias?.sessionKey === `${hand}/${name}` || alias?.name === name
    const cwdOk = !alias?.cwd || !value?.cwd || sameCwd(alias.cwd, value.cwd)
    if (sameName && cwdOk) aliases.push([aliasKey, alias])
  }
  let row = rows.get(key)
  const hadRow = !!row
  if (!row) {
    row = {
      key,
      hand,
      name: '',
      sessionKey: '',
      conversationId: '',
      turns: 0,
      today: 0,
      status: 'NOT_STARTED',
      ok: false,
      ms: 0,
      startedAt: '',
      lastAt: '',
      cwd: '',
      model: '',
      excerpt: '',
      running: false,
      notStarted: true,
    }
  }
  for (const [aliasKey, alias] of aliases) {
    mergeSessionRows(row, alias)
    rows.delete(aliasKey)
  }
  row.key = key
  row.hand = hand
  row.conversationId = id
  const updated = String(value?.updated || '')
  if (!hadRow || !row.name || isFallbackSessionName(row.name) || (updated && (!row.lastAt || updated > row.lastAt))) row.name = String(name)
  row.sessionKey = `${hand}/${row.name || name}`
  if (!row.cwd) row.cwd = String(value?.cwd || '')
  if (updated && (!row.lastAt || updated > row.lastAt)) row.lastAt = updated
  if (!row.turns && !row.running) {
    row.status = 'NOT_STARTED'
    row.notStarted = true
  }
  rows.set(key, row)
  return key
}

export function resolveSession(index, name, cwd, args, hand, requesterSessionId, archivedKeys = [], opts = {}) {
  const mode = String(args?.sessionMode || 'auto')
  const entry = name && index ? index[name] : null
  const near = name ? findLookalikeSession(index, name, archivedKeys, hand) : []
  const nearHint = near.length ? `（名字相近的已有会话：${near.join('、')}）` : ''
  // allowNewSession 已废弃：改用 issue_new_session_ticket 发票据，传了也不再放行（保留字段避免旧调用方炸裂）
  const allowHint = args?.allowNewSession
    ? ' allowNewSession 已废弃，改用 issue_new_session_ticket 发票据；传了也不放行。'
    : ''

  if (mode === 'resume') {
    if (!entry) {
      throw new Error(
        `${hand}: 会话「${name || '(未填)'}」不存在。` +
          (nearHint || '') +
          ' 要继续老会话请用已有的准确名字；要新建请显式传 sessionMode:"new"。',
      )
    }
    if (!sameCwd(entry.cwd, cwd)) {
      throw new Error(
        `${hand}: 会话「${name}」是在 ${entry.cwd || '(未知目录)'} 建的，和本次目录 ${cwd || '(未指定)'} 不一致。` +
          ' 想在这里继续就换个会话名；要新建请传 sessionMode:"new"。',
      )
    }
    return { id: String(entry.id), reset: false }
  }

  // 新建会话（mode "new"，或 auto 换名新建）：
  //   目录里有其他会话 / 名字近似已有会话 → 必须带 ticket 并通过校验；
  //   目录里没有其他会话 → 免票。
  const creatingNew = !entry
  const ticketInfo = creatingNew
    ? opts.ticketApproved === true
      ? { ok: true, record: null, why: '' }
      : validateSessionTicket(args?.ticket, hand, cwd, name, requesterSessionId)
    : { ok: false, record: null, why: '' }
  const hasTicket = creatingNew && opts.ticketApproved !== true && String(args?.ticket || '').trim() !== ''
  const others = sameCwdOthers(index, name, cwd, archivedKeys, hand)
  const list = sameDirSessionsText(index, name, cwd, undefined, archivedKeys, hand)
  const ticketRequired = () =>
    ` 新建前请用 issue_new_session_ticket 发一张票据，或 resume 原会话。${allowHint}`

  if (mode === 'new') {
    assertFreshName(hand, name, args?.allowNewSession)
    if (entry) {
      throw new Error(
        `${hand}: 会话「${name}」已经存在。要继续它请传 sessionMode:"resume"；要另开一个请换个名字。${allowHint}`,
      )
    }
    if (others.length && !ticketInfo.ok) {
      throw new Error(
        `${hand}: 目录 ${cwd} 已经有会话「${others.join('、')}」。${list ? `${list} ` : ''}${ticketRequired()}`,
      )
    }
    if (near.length && !ticketInfo.ok) {
      throw new Error(
        `${hand}: 要新建的会话名「${name}」和已有会话 ${near.join('、')} 只差一个后缀，像是手滑或中断后重派。` +
          ` 新建前先用 issue_new_session_ticket 发一张票据${nearHint}，或直接 resume ${near[0]}。${allowHint}`,
      )
    }
    if (hasTicket && !ticketInfo.ok) {
      throw new Error(`${hand}: 票据校验未通过：${ticketInfo.why}${list ? ` ${list}` : ''}${ticketRequired()}`)
    }
    if (ticketInfo.ok && opts.consumeTicket !== false) consumeSessionTicket(ticketInfo.record)
    return {
      id: null,
      reset: false,
      ...(ticketInfo.record ? { ticketExpiresAt: Number(ticketInfo.record.issuedAt) + SESSION_TICKET_TTL_MS } : {}),
    }
  }

  // auto
  if (entry) {
    const r = resumeEntry(index, name, cwd)
    return { id: r.id, reset: r.reset }
  }
  assertFreshName(hand, name, args?.allowNewSession)
  const othersAuto = sameCwdOthers(index, name, cwd)
  if (othersAuto.length && !ticketInfo.ok) {
    throw new Error(
      `${hand}: 这次用的名字「${name}」在目录 ${cwd} 里不存在，但该目录已有会话「${othersAuto.join('、')}」。` +
        `${list ? `${list} ` : ''}${ticketRequired()}`,
    )
  }
  if (near.length && !ticketInfo.ok) {
    throw new Error(
      `${hand}: 会话名「${name}」和已有会话 ${near.join('、')} 只差一个后缀。` +
        ` 新建前先用 issue_new_session_ticket 发一张票据${nearHint}，或直接 resume ${near[0]}。${allowHint}`,
    )
  }
  if (hasTicket && !ticketInfo.ok) {
    throw new Error(`${hand}: 票据校验未通过：${ticketInfo.why}${list ? ` ${list}` : ''}${ticketRequired()}`)
  }
  if (ticketInfo.ok && opts.consumeTicket !== false) consumeSessionTicket(ticketInfo.record)
  return {
    id: null,
    reset: false,
    ...(ticketInfo.record ? { ticketExpiresAt: Number(ticketInfo.record.issuedAt) + SESSION_TICKET_TTL_MS } : {}),
  }
}
function resumeEntry(index, name, cwd) {
  const entry = name && index ? index[name] : null
  if (!entry || !entry.id) return { id: null, reset: false }
  if (!sameCwd(entry.cwd, cwd)) return { id: null, reset: true, previousCwd: entry.cwd }
  return { id: String(entry.id), reset: false }
}

// ── 新建会话票据（ticket）── 按 claude 评审的设计：没有加密装饰 ───────────────
// 同目录已有会话时，新建/换名新建必须先拿 ticket，而不是无闸进闸（2026-11-23 起）。
//   - 票据：一次性随机串，绑 hand + 规范化 cwd + 精确 name + 发起方会话 id；10 分钟过期。
//   - 存在进程内 Map（插件重启即失效，可重开）；发放 + 核销记录进 ~/.dsh/hands-session-tickets.json
//     （持久化只存账本，不存票据本体）。
//   - 同一 cwd 10 分钟内最多发一张票（账本里记了发放时间算），第二张直接拒。
//   - allowNewSession 已废弃：传了也不再放行（resolveSession 里拒绝信息里会说）。
export const SESSION_TICKET_TTL_MS = 10 * 60 * 1000
export const SESSION_TICKET_RATE_MS = 10 * 60 * 1000

// 票据在入队时已核销，但排队不能把授权窗口拖没；出队前再检查原始截止时间。
export function assertSessionTicketWindow(expiresAt, now = Date.now()) {
  const deadline = Number(expiresAt)
  if (Number.isFinite(deadline) && Number(now) > deadline) {
    throw new Error('排队期间新建会话票据已过期，请重新签发票据后再派活')
  }
}
export const SESSION_TICKET_LEDGER_FILE = path.join(os.homedir(), '.dsh', 'hands-session-tickets.json')
const SESSION_TICKETS = new Map() // ticket -> { ticket, hand, cwd, name, reason, requesterSessionId, issuedAt }

export function readSessionTicketLedger(file = SESSION_TICKET_LEDGER_FILE) {
  const data = readJson(file, { v: 1, issued: [], redeemed: [] }) || { v: 1, issued: [], redeemed: [] }
  return {
    v: 1,
    issued: Array.isArray(data.issued) ? data.issued : [],
    redeemed: Array.isArray(data.redeemed) ? data.redeemed : [],
  }
}

export function appendSessionTicketLedger(entry, file = SESSION_TICKET_LEDGER_FILE) {
  try {
    const ledger = readSessionTicketLedger(file)
    const list = String(entry?.event || '') === 'redeemed' ? ledger.redeemed : ledger.issued
    list.push({
      at: String(entry?.at || ''),
      event: String(entry?.event || ''),
      hand: String(entry?.hand || ''),
      cwd: String(entry?.cwd || ''),
      name: String(entry?.name || ''),
      reason: String(entry?.reason || ''),
      requesterSessionId: String(entry?.requesterSessionId || ''),
    })
    writeJson(file, ledger)
    return true
  } catch {
    return false
  }
}

// 同一 cwd、在 10 分钟窗口内已发过票（账本的 issued 记录拿时间戳算）
function sessionTicketsRecentIssued(cwd, now = Date.now(), file = SESSION_TICKET_LEDGER_FILE) {
  return readSessionTicketLedger(file).issued.filter((e) => {
    const at = Date.parse(String(e?.at || ''))
    if (!Number.isFinite(at)) return false
    return sameCwd(e?.cwd, cwd) && now - at < SESSION_TICKET_RATE_MS
  })
}

// 签发票据：返回 { ticket, hand, cwd, name, reason, sessions, hint }。
// sessions = 该目录现有会话清单（名字 / 最后活跃 / 是否运行中）——提示「先看清单，能 resume 就别新开」。
export function issueSessionTicket(fields = {}, opts = {}) {
  const hand = String(fields?.hand || '').trim()
  const name = String(fields?.name || '').trim()
  if (!hand) throw new Error('hand is required')
  if (!name) throw new Error('name is required')
  const cwd = String(fields?.cwd || '').trim() || resolveRunCwd(fields, {})
  const reason = String(fields?.reason || '').trim()
  const requesterSessionId = String(fields?.requesterSessionId || '').trim()
  const now = Date.now()
  const busy = sessionTicketsRecentIssued(cwd, now, opts.file)
  if (busy.length) {
    throw new Error(
      `同一目录 ${cwd} 在 ${Math.round(SESSION_TICKET_RATE_MS / 60000)} 分钟内已经发过票据` +
        `（${busy.map((b) => String(b.name || '')).join('、') || '—'}），最多一张。` +
        '等窗口过后再发，或先让手下 resume 既有会话。',
    )
  }
  const ticket = `st-${crypto.randomUUID()}`
  SESSION_TICKETS.set(ticket, { ticket, hand, cwd, name, reason, requesterSessionId, issuedAt: now })
  appendSessionTicketLedger(
    { at: new Date(now).toISOString(), event: 'issued', hand, cwd, name, reason, requesterSessionId },
    opts.file,
  )
  return {
    ticket,
    hand,
    cwd,
    name,
    reason,
    sessions: sameDirSessionsEntries(fields?.index || {}, name, cwd, undefined, fields?.archivedKeys, hand),
    hint: '先看清单，能 resume 就别新开',
  }
}

// 校验票据（不消耗）：{ ok, record, why }
export function validateSessionTicket(ticket, hand, cwd, name, requesterSessionId, opts = {}) {
  const id = String(ticket || '').trim()
  const rec = id ? SESSION_TICKETS.get(id) : null
  const bad = (record, why) => ({ ok: false, record, why })
  if (!rec) return bad(null, id ? '票据无效或已核销' : '没有票据')
  if (String(rec.hand || '') !== String(hand || '')) {
    return bad(rec, `票据绑 hand=${rec.hand || '(未记)'}，本次是 ${hand || '(未填)'}`)
  }
  if (!sameCwd(rec.cwd, cwd)) {
    return bad(rec, `票据绑目录 ${rec.cwd || '(未知目录)'}，不能在 ${cwd || '(未指定)'} 用（跨目录挪用）`)
  }
  if (String(rec.name || '') !== String(name || '')) {
    return bad(rec, `票据绑名字「${rec.name || ''}」，不能在「${name || ''}」上用`)
  }
  if (rec.requesterSessionId && requesterSessionId && String(rec.requesterSessionId) !== String(requesterSessionId)) {
    return bad(rec, '票据是别的会话发的，发起方会话不匹配')
  }
  const now = Number.isFinite(opts.now) ? opts.now : Date.now()
  const ttlMs = Number.isFinite(opts.ttlMs) && opts.ttlMs >= 0 ? opts.ttlMs : SESSION_TICKET_TTL_MS
  if (now - Number(rec.issuedAt || 0) > ttlMs) {
    return bad(rec, `票据已过期（有效期 ${Math.round(SESSION_TICKET_TTL_MS / 60000)} 分钟）`)
  }
  return { ok: true, record: rec, why: '' }
}

// 核销：票据只能核销一次 —— 从进程内 Map 里删掉，并记核销事实进账本
export function consumeSessionTicket(rec, opts = {}) {
  if (!rec) return false
  SESSION_TICKETS.delete(String(rec.ticket || ''))
  appendSessionTicketLedger(
    {
      at: new Date().toISOString(),
      event: 'redeemed',
      hand: rec.hand,
      cwd: rec.cwd,
      name: rec.name,
      reason: rec.reason,
      requesterSessionId: rec.requesterSessionId,
    },
    opts.file,
  )
  return true
}

// ── 在跑的派活（RUNNING）—— hoist 到模块顶层：sameDirSessionsText（拒绝新建时列清单）要查它 ──
const RUNNING = new Map()

// 把 start / end / 旧的单行记录合并成「一次派发」。旧日志没有 phase，原样兼容。
// 纯函数导出：面板状态测试要验证「A 收尾不会改 B」。
export function mergeJobRecords(records) {
  const starts = new Map()
  const jobs = new Map()
  for (const record of Array.isArray(records) ? records : []) {
    if (!record?.id) continue
    const id = String(record.id)
    if (record.phase === 'start') {
      starts.set(id, record)
      continue
    }
    if (record.phase === 'end') {
      const merged = { ...(starts.get(id) || {}), ...record }
      delete merged.phase
      delete merged.v
      jobs.set(id, merged)
      continue
    }
    jobs.set(id, { ...record })
  }
  return [...jobs.values()]
}

// 面板统一状态：历史 end ∪ 当前 RUNNING ∪ asyncState 里仍活跃的恢复任务。
// 旧版本曾把活进程误补成 INTERRUPTED；只要 asyncState/pid 证明它还活着，就以 RUNNING 覆盖。
// 已经写了真正 end 的任务不覆盖（收尾记录优先于过期的 asyncState）。
export function buildPanelDispatchState(records, asyncJobs = {}, running = [], { isAlive, inspectProcess, now, maxAgeMs, startToleranceMs, sessionIndexes = {} } = {}) {
  const jobs = mergeJobRecords(records)
  const jobById = new Map(jobs.map((job) => [String(job.id || ''), job]))
  const starts = new Map()
  for (const record of Array.isArray(records) ? records : []) {
    if (record?.phase === 'start' && record?.id) starts.set(String(record.id), record)
  }
  const runningMap = new Map()
  for (const entry of Array.isArray(running) ? running : []) {
    if (entry?.id) runningMap.set(String(entry.id), entry)
  }
  const queuedMap = new Map()
  for (const record of Object.values(asyncJobs || {})) {
    if (!record?.id) continue
    const status = String(record.status || '').toUpperCase()
    if (status === 'QUEUED' && !record.endedAt) {
      const id = String(record.dispatchId || record.id || '')
      if (!id || runningMap.has(id)) continue
      const numericRecordStart = Number(record.startedAt)
      const startedMs = Number.isFinite(numericRecordStart)
        ? numericRecordStart
        : Date.parse(String(record.startedAt || '')) || Date.now()
      const metadata = recoverSessionMetadata(
        {
          ...record,
          id,
          dispatchId: id,
          status: 'QUEUED',
          running: false,
          queued: true,
          queuePosition: Math.max(0, Number(record.queuePosition) || 0),
          queueLimit: Math.max(0, Number(record.queueLimit) || 0),
        },
        sessionIndexes,
      )
      const entry = {
        ...metadata,
        startedAt: new Date(startedMs).toISOString(),
        at: new Date(startedMs).toISOString(),
        status: 'QUEUED',
        running: false,
        queued: true,
        output: '',
        outputAt: startedMs,
      }
      queuedMap.set(id, entry)
      // 历史里也要看得到 QUEUED；但不覆盖已经存在的真正收尾记录。
      if (!jobById.has(id)) {
        jobs.push(entry)
        jobById.set(id, entry)
      }
      continue
    }
    if (!isAsyncJobActive(record, { isAlive, inspectProcess, now, maxAgeMs, startToleranceMs })) continue
    const start = findAsyncDispatchStart(record, starts)
    const id = String(start?.id || record.dispatchId || record.id || '')
    if (!id || runningMap.has(id)) continue
    const numericRecordStart = Number(record.startedAt)
    const startedMs = Number.isFinite(numericRecordStart)
      ? numericRecordStart
      : Date.parse(String(record.startedAt || '')) || Date.now()
    const job = jobById.get(id)
    // 真正的收尾记录已经落盘：不能拿旧 asyncState 把它盖回 RUNNING。
    // INTERRUPTED 即使老数据没带 interrupted 标记，也允许被仍存活的进程纠正。
    if (job && job.status !== 'INTERRUPTED' && !job.interrupted) continue
    const parsedStart = Date.parse(start?.startedAt || start?.at || '')
    const resolvedStartMs = parsedStart || startedMs
    const hand = String(start?.hand || record.hand || '')
    const metadata = recoverSessionMetadata(
      {
        ...record,
        ...start,
        id,
        dispatchId: id,
        hand,
        tool: String(record.tool || start?.tool || ''),
        prompt: String(record.prompt || start?.prompt || ''),
        session: String(start?.session || record.session || ''),
        conversationId: String(start?.conversationId || record.conversationId || ''),
        cwd: String(start?.cwd || record.cwd || ''),
        model: String(start?.model || record.model || ''),
        status: 'RUNNING',
        running: true,
        queued: false,
        queuePosition: 0,
      },
      sessionIndexes,
    )
    runningMap.set(id, {
      ...metadata,
      startedAt: String(start?.startedAt || new Date(resolvedStartMs).toISOString()),
      at: String(start?.at || start?.startedAt || new Date(resolvedStartMs).toISOString()),
      status: 'RUNNING',
      running: true,
      queued: false,
      recovered: true,
      output: '',
      outputAt: resolvedStartMs,
    })
  }
  const activeIds = new Set(runningMap.keys())
  const visibleJobs = jobs.filter((job) => !activeIds.has(String(job.id || '')))
  const queued = [...queuedMap.values()].sort((a, b) =>
    Number(a.queuePosition || 0) - Number(b.queuePosition || 0) || String(a.startedAt).localeCompare(String(b.startedAt)),
  )
  return { jobs: visibleJobs, running: [...runningMap.values()], queued }
}

export function apply(ctx, config = {}) {
  // 四家的二进制：配置 > 本机常用安装位置 > 默认值，取第一个真实存在的。
  // 这样重装 / 目录被清之后不用改配置也能自己找回来。
  // 自动找二进制，开源版不写死任何本机路径：
  // 配置 > PATH 里的同名命令 > DSH 自带 node 目录 > 各家常见安装位置。
  const NODE_DIR =
    process.env.DSH_NODE_DIR || (process.execPath ? path.dirname(process.execPath) : '')
  const LOCAL_BIN = path.join(os.homedir(), '.local', 'bin')
  const bin = pickBin([
    config.agyBin,
    config.bin,
    'agy',
    'agy.exe',
    NODE_DIR && path.join(NODE_DIR, 'agy.exe'),
    LOCAL_BIN && path.join(LOCAL_BIN, 'agy.exe'),
    DEFAULT_BIN,
  ])
  const codexBin = pickBin([
    config.codexBin,
    'codex',
    'codex.cmd',
    NODE_DIR && path.join(NODE_DIR, 'codex.cmd'),
    DEFAULT_CODEX_BIN,
  ])
  const claudeBin = pickBin([
    config.claudeBin,
    'claude',
    'claude.exe',
    LOCAL_BIN && path.join(LOCAL_BIN, 'claude.exe'),
    NODE_DIR && path.join(NODE_DIR, 'claude.exe'),
    DEFAULT_CLAUDE_BIN,
  ])
  const opencodeBin = pickBin([
    config.opencodeBin,
    'opencode',
    'opencode.cmd',
    NODE_DIR && path.join(NODE_DIR, 'opencode.cmd'),
    DEFAULT_OPENCODE_BIN,
  ])
  const defaultTimeout = Number(config.timeoutSec) || 900
  // 会话守卫（sameCwd / assertFreshName / resolveSession / sameDirSessionsText 等）
  // 全部 hoist 到模块顶层（下面定义）：测试可以直接 import 这些纯逻辑，不用进 apply。
  // 异步任务默认不限时：只有显式传 timeoutSec > 0 才限时。
  // 之前 only agy_run 走了这个逻辑，codex/claude/opencode 的异步照样被 900 秒砍掉。
  const effTimeout = (args) =>
    args?.async === true
      ? (args?.timeoutSec == null ? 0 : Math.max(0, Number(args.timeoutSec) || 0))
      : Number(args?.timeoutSec) || defaultTimeout
  // 默认跳过权限确认（发布版行为）；要收紧就在配置里写 skipPermissions: false
  const skipPermissions = config.skipPermissions !== false
  // ACP 开关（第 6 步）：默认空 = 四家全走 CLI，和以前完全一样。
  // 填 ['opencode'] 就让 opencode 走 ACP runner，其余照旧；一家一家切，出事删掉这个配置即可回退。
  const acpHands = new Set(
    (Array.isArray(config.acpHands) ? config.acpHands : String(config.acpHands || '').split(','))
      .map((hand) => String(hand || '').trim().toLowerCase())
      .filter(Boolean),
  )
  const useAcp = (hand) => acpHands.has(String(hand || '').toLowerCase())
  // /health 的四家探测：30s 缓存 + in-flight 合并，别让并发请求同时起四份进程。
  const healthCache = withHealthCache(
    () => healthPayload({ agy: bin, codex: codexBin, claude: claudeBin, opencode: opencodeBin }),
    { ttlMs: HEALTH_TTL_MS },
  )

  // ── 设置页用的 HTTP 接口 ────────────────────────────────────────────────
  function readBody(req) {
    return new Promise((resolve) => {
      let raw = ''
      req.on('data', (chunk) => {
        raw += chunk
        if (raw.length > 1_000_000) raw = raw.slice(0, 1_000_000)
      })
      req.on('end', () => resolve(raw))
      req.on('error', () => resolve(raw))
    })
  }

  function parseBody(raw) {
    try {
      const value = JSON.parse(raw || '{}')
      return value && typeof value === 'object' ? value : {}
    } catch {
      return {}
    }
  }

  function listTrash() {
    try {
      return fs
        .readdirSync(trashDir(), { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => {
          const dir = path.join(trashDir(), entry.name)
          let movedAt = ''
          try {
            movedAt = fs.statSync(dir).mtime.toISOString()
          } catch {}
          return { conversationId: entry.name, movedAt }
        })
    } catch {
      return []
    }
  }

  // 从 trash 里搬回去：文件名是按 kind 存的，位置可预测
  function restoreSession(id) {
    const dir = path.join(trashDir(), id)
    if (!fs.existsSync(dir)) return { ok: false, reason: 'trash 里没有这个会话' }
    const paths = sessionPaths(id)
    const moved = []
    const plan = [
      [path.join(dir, 'db.db'), paths.db],
      [path.join(dir, 'brain'), paths.brain],
      [path.join(dir, 'annotations.pbtxt'), paths.annotations],
    ]
    for (const [from, to] of plan) {
      if (!fs.existsSync(from)) continue
      try {
        fs.mkdirSync(path.dirname(to), { recursive: true })
        fs.renameSync(from, to)
        moved.push(to)
      } catch {}
    }
    try {
      fs.rmSync(dir, { recursive: true, force: true })
    } catch {}
    return { ok: moved.length > 0, moved }
  }

  async function checkEnv() {
    const report = {
      bin,
      binExists: fs.existsSync(bin),
      agyRoot: AGY_ROOT,
      agyRootExists: fs.existsSync(AGY_ROOT),
      platform: process.platform,
      nodeVersion: process.version,
      checkedAt: new Date().toISOString(),
    }
    if (report.binExists) {
      const probe = await runProcess(bin, ['help'], { timeoutSec: 20 })
      report.runnable = probe.code === 0
      report.exitCode = probe.code
      report.firstLine = String(probe.stdout || probe.stderr || '').split('\n')[0].slice(0, 140)
    }
    try {
      report.conversations = listKnownSessions().length
    } catch {
      report.conversations = 0
    }
    try {
      report.indexed = Object.keys(loadIndex()).length
    } catch {
      report.indexed = 0
    }
    return clean(report)
  }

  // ── 调度日志：谁被派了什么活、跑了多久、成没成、当场说了什么 ──────────────
  //
  // v2 每条派发写两行：spawn 前 {phase:"start"}、收尾 {phase:"end"}。
  // 启动时只有 start 没有 end、且 asyncState/pid 都不再证明它活着的活才补成 INTERRUPTED。
  // 插件重启但旧进程还活着时留 RUNNING，等旧进程自己写真正的 end。
  // 日志只留元信息 + excerpt + jobFile；完整输出按 id 写进 hands-jobs/<id>.txt。
  // 流式片段仍然只在内存里滚（createLiveView），不落盘。
  const LOG_FILE = path.join(os.homedir(), '.dsh', 'hands-log.jsonl')
  const JOBS_DIR = path.join(os.homedir(), '.dsh', 'hands-jobs')
  const ARCHIVE_FILE = path.join(os.homedir(), '.dsh', 'hands-archive.json')
  const readArchive = () => {
    const raw = readJson(ARCHIVE_FILE, { keys: [] }) || {}
    return Array.isArray(raw.keys) ? raw.keys.map(String) : []
  }
  const writeArchive = (keys) => writeJson(ARCHIVE_FILE, { keys: [...new Set(keys.map(String))] })
  const LOG_KEEP = 1000
  const JOB_MAX_BYTES = 1024 * 1024
  const NL = String.fromCharCode(10)
  let runningRevision = 0
  let historyRevision = 0
  // v2 /stream?key= 的三份 revision：agents 维度、每个 hand 的 sessions、每个 key 的 turns。
  // 旧的 runningRevision / historyRevision 原样留给无 key 分支，两边互不干扰。
  let agentsRevision = 0
  let revisionSeq = 0
  const handRevisions = new Map()
  const keyRevisions = new Map()
  let today = { date: localDateKey(), byHand: Object.create(null), byKey: Object.create(null) }

  function touchRunning() {
    runningRevision += 1
  }

  function touchHistory() {
    historyRevision += 1
    runningRevision += 1
  }

  function nextRevision() {
    revisionSeq += 1
    return revisionSeq
  }

  // 一条记录同时属于 sessionKey 和 hand/sid:<conversationId> 两个 key（有 conversationId 时）。
  // 两个都 bump，前端拿哪种写法查都能收到更新。
  function touchAgentDimensions(entry) {
    if (!entry) return
    agentsRevision = nextRevision()
    const hand = String(entry.hand || '')
    if (hand) handRevisions.set(hand, nextRevision())
    const keys = new Set()
    const sessionKey = String(entry.sessionKey || '')
    if (sessionKey) keys.add(sessionKey)
    const conversationId = String(entry.conversationId || '')
    if (conversationId) keys.add(`${hand}/sid:${conversationId}`)
    for (const key of keys) keyRevisions.set(key, nextRevision())
  }

  function readRecords() {
    try {
      const lines = fs.readFileSync(LOG_FILE, 'utf8').split(NL).filter(Boolean)
      return lines
        .map((line) => {
          try {
            const value = JSON.parse(line)
            return value && typeof value === 'object' ? value : null
          } catch {
            return null
          }
        })
        .filter(Boolean)
    } catch {
      return []
    }
  }

  function mergedJobs(records = readRecords()) {
    return mergeJobRecords(records)
  }

  function readJobs() {
    return mergedJobs().sort((a, b) =>
      String(b.at || b.startedAt || '').localeCompare(String(a.at || a.startedAt || '')),
    )
  }

  // 面板专用：把日志、当前 RUNNING、asyncState 里仍活着的任务统一成一份状态。
  // 历史接口不能只读 end 日志，否则插件重启后仍活的异步任务会凭空变成 INTERRUPTED。
  function panelDispatchState(sessionIndexes = readSessionIndexes()) {
    return buildPanelDispatchState(readRecords(), asyncState.jobs, [...RUNNING.values()], {
      sessionIndexes,
    })
  }

  // 日志按行裁，最多 LOG_KEEP 行。start 被裁掉也没关系：end 自带全部元信息。
  function appendRecord(record) {
    try {
      fs.mkdirSync(path.dirname(LOG_FILE), { recursive: true })
      fs.appendFileSync(LOG_FILE, JSON.stringify(record) + NL, 'utf8')
      const lines = fs.readFileSync(LOG_FILE, 'utf8').split(NL).filter(Boolean)
      if (lines.length > LOG_KEEP) {
        fs.writeFileSync(LOG_FILE, lines.slice(-LOG_KEEP).join(NL) + NL, 'utf8')
      }
    } catch {
      /* 日志写失败不影响干活 */
    }
  }

  function saveJobText(id, value) {
    const text = String(value || '')
    if (!text) return ''
    try {
      fs.mkdirSync(JOBS_DIR, { recursive: true })
      const file = path.join(JOBS_DIR, `${id}.txt`)
      fs.writeFileSync(file, tailUtf8(text, JOB_MAX_BYTES), 'utf8')
      return file
    } catch {
      return ''
    }
  }

  function readJobText(entry) {
    if (!entry) return ''
    if (typeof entry.output === 'string' && entry.output) return entry.output
    const file = String(entry.jobFile || '')
    if (!file) return ''
    try {
      const root = path.resolve(JOBS_DIR)
      const resolved = path.resolve(file)
      if (resolved !== root && !resolved.startsWith(root + path.sep)) return ''
      return fs.readFileSync(resolved, 'utf8')
    } catch {
      return ''
    }
  }

  // 宿主重启后的收尸：有 start、没 end，且 asyncState/pid 都不再证明它活着的，才补 INTERRUPTED。
  function reconcileLog() {
    const records = readRecords()
    const plan = planLogReconciliation(records, asyncState.jobs, { runningIds: [...RUNNING.keys()] })
    const now = Date.now()
    for (const { id, start } of plan.interrupt) {
      const startedMs = Date.parse(start.startedAt || start.at) || now
      appendRecord(
        clean({
          ...start,
          v: 2,
          phase: 'end',
          at: new Date(now).toISOString(),
          status: 'INTERRUPTED',
          ok: false,
          ms: Math.max(0, now - startedMs),
          excerpt: '',
          error: 'interrupted: host restarted',
          interrupted: true,
        }),
      )
    }
  }

  function ensureToday() {
    const date = localDateKey()
    if (today.date !== date) today = { date, byHand: Object.create(null), byKey: Object.create(null) }
    return today
  }

  function bumpToday(hand, key, atMs = Date.now()) {
    const bucket = ensureToday()
    if (localDateKey(atMs) !== bucket.date) return
    bucket.byHand[hand] = (bucket.byHand[hand] || 0) + 1
    bucket.byKey[key] = (bucket.byKey[key] || 0) + 1
  }

  // 今日次数只放内存：启动时从日志里重算，之后每次派发 +1。
  function seedToday(jobs = readJobs()) {
    const bucket = ensureToday()
    bucket.byHand = Object.create(null)
    bucket.byKey = Object.create(null)
    for (const job of jobs) {
      const startedMs = Date.parse(job.startedAt || job.at)
      if (!Number.isFinite(startedMs) || localDateKey(startedMs) !== bucket.date) continue
      const hand = String(job.hand || '')
      const key = String(job.sessionKey || sessionKeyOf(hand, job.session, startedMs, job.conversationId || job.id))
      bucket.byHand[hand] = (bucket.byHand[hand] || 0) + 1
      bucket.byKey[key] = (bucket.byKey[key] || 0) + 1
    }
  }

  function todayCount(hand) {
    ensureToday()
    return today.byHand[String(hand || '')] || 0
  }

  // 会话列表 = 日志聚合 ∪ 四个 *-sessions.json；没派过活的也列出来，标 NOT_STARTED。
  // 有名会话优先用 conversationId 归并，所以改 session 名字不会把历史拆成两段。
  function sessionIndexFiles() {
    return [
      ['agy', INDEX_FILE],
      ['codex', CODEX_INDEX],
      ['claude', CLAUDE_INDEX],
      ['opencode', OPENCODE_INDEX],
    ]
  }

  function readSessionIndexes() {
    const indexes = {}
    for (const [hand, file] of sessionIndexFiles()) {
      const value = readJson(file, {})
      if (value && typeof value === 'object') indexes[hand] = value
    }
    return indexes
  }

  function listSessions(handFilter = '', opts = {}) {
    const wantArchived = !!opts.archived
    ensureToday()
    const rows = new Map()
    const sessionIndexes = readSessionIndexes()
    const ensureRow = (key, hand) => {
      let row = rows.get(key)
      if (!row) {
        row = {
          key,
          hand,
          name: '',
          sessionKey: '',
          conversationId: '',
          turns: 0,
          today: 0,
          status: 'NOT_STARTED',
          ok: false,
          ms: 0,
          startedAt: '',
          lastAt: '',
          cwd: '',
          model: '',
          excerpt: '',
          running: false,
          queued: false,
          queuePosition: 0,
          queueLimit: 0,
          notStarted: false,
        }
        rows.set(key, row)
      }
      return row
    }

    const absorb = (source, running) => {
      const record = recoverSessionMetadata(source, sessionIndexes)
      const hand = String(record.hand || '')
      if (handFilter && hand !== handFilter) return
      const startedMs = Date.parse(record.startedAt || record.at) || Date.now()
      const sessionKey = String(record.sessionKey || sessionKeyOf(hand, record.session, startedMs, record.conversationId || record.id))
      const conversationId = String(record.conversationId || '')
      const key = conversationId ? `${hand}/sid:${conversationId}` : sessionKey
      const row = ensureRow(key, hand)
      row.turns += 1
      if (!row.conversationId && conversationId) row.conversationId = conversationId
      if (!row.sessionKey) row.sessionKey = sessionKey
      if (!row.name && record.session) row.name = String(record.session)
      if (!row.cwd && record.cwd) row.cwd = String(record.cwd)
      if (!row.model && record.model) row.model = String(record.model)
      if (localDateKey(startedMs) === today.date) row.today += 1
      if (!row.startedAt || startedMs < (Date.parse(row.startedAt) || Infinity)) {
        row.startedAt = new Date(startedMs).toISOString()
      }
      const at = String(record.at || record.startedAt || '')
      if (!row.lastAt || at > row.lastAt) {
        row.lastAt = at
        row.status = running ? 'RUNNING' : String(record.status || 'UNKNOWN')
        row.ok = running ? false : record.ok === true
        row.ms = running ? Math.max(0, Date.now() - startedMs) : Number(record.ms) || 0
        row.excerpt = String(record.excerpt || '').slice(-600)
        row.running = !!running
        row.queued = !running && String(record.status || '').toUpperCase() === 'QUEUED'
        row.queuePosition = row.queued ? Math.max(0, Number(record.queuePosition) || 0) : 0
        row.queueLimit = Math.max(0, Number(record.queueLimit) || 0)
        if (record.session) row.name = String(record.session)
      }
      // 同一会话里只要还有一条在跑，聚合行就必须是 RUNNING，不能被较晚收尾的别的轮次盖掉。
      if (running) {
        row.status = 'RUNNING'
        row.ok = false
        row.running = true
        row.ms = Math.max(0, Date.now() - startedMs)
      }
    }

    const panel = panelDispatchState(sessionIndexes)
    for (const job of panel.jobs) {
      if (String(job.status || '').toUpperCase() !== 'QUEUED') absorb(job, false)
    }
    for (const entry of panel.running) absorb(entry, true)
    for (const entry of panel.queued || []) absorb(entry, false)
    // QUEUED 是「还没启动」的活跃状态：同会话有 RUNNING 时聚合行仍显示 RUNNING，
    // 否则不能被时间更晚的 end 记录盖掉；多个排队任务展示最靠前的位置。
    for (const row of rows.values()) {
      const pending = (panel.queued || []).filter((entry) => turnMatches(entry, row.key))
      if (!pending.length) continue
      const position = Math.min(...pending.map((entry) => Number(entry.queuePosition) || 1))
      row.queued = true
      row.queuePosition = position
      row.queueLimit = Math.max(Number(row.queueLimit) || 0, ...pending.map((entry) => Number(entry.queueLimit) || 0))
      if (!row.running) {
        row.status = 'QUEUED'
        row.ok = false
      }
    }

    for (const [hand, index] of Object.entries(sessionIndexes)) {
      if (handFilter && hand !== handFilter) continue
      for (const [name, value] of Object.entries(index)) {
        upsertSessionIndexRow(rows, hand, name, value && typeof value === 'object' ? value : {})
      }
    }

    const archived = new Set(readArchive())
    // 归档不再单独成视图：给每行打标记，前端在文件夹底部折叠展示
    return [...rows.values()]
      .map((row) => {
        const named = recoverSessionMetadata(row, sessionIndexes)
        return { ...named, archived: isArchivedSessionEntry(row.hand, named.name, named, archived) }
      })
      .sort((a, b) => String(b.lastAt || '').localeCompare(String(a.lastAt || '')))
  }

  // 历史记录不把整段输出塞进每次快照：默认只带摘录，点开某一行时再单独取。
  function stripOutput(entry) {
    if (!entry || typeof entry !== 'object') return entry
    const { output, ...rest } = entry
    if (!rest.excerpt && output) rest.excerpt = String(output).slice(-600)
    return rest
  }

  // 在跑的进程句柄：id -> { child, startedAt, run }。单独存一份，绝不塞进 RUNNING：
  // RUNNING 会被 clean() 递归序列化，ChildProcess 有循环引用会直接炸。
  const RUNNING_PROCS = new Map()
  let runSeq = 0

  function trackProc(id, child, run) {
    if (!id) return
    if (run?.cancelled || run?.finished) {
      void killProcessTree(child?.pid)
      return
    }
    RUNNING_PROCS.set(String(id), { child, startedAt: Date.now(), run })
    // 把 pid 落盘：重启对账用它判「进程还在不在」，比凭无 endedAt 就宣告 ORPHAN 诚实。
    // 只有异步 job 有对应记录；同步派活不进 asyncState。
    try {
      const record =
        asyncState.jobs[String(id)] ||
        Object.values(asyncState.jobs).find((job) => String(job.dispatchId || '') === String(id))
      if (record && child?.pid) {
        record.pid = child.pid
        record.pidRecordedAt = Date.now()
        const pidStartedAt = getProcessStartTime(child.pid)
        if (Number.isFinite(pidStartedAt)) {
          record.pidStartedAt = pidStartedAt
          record.pidStartVerified = true
        }
        saveAsyncState()
      }
    } catch {
      /* 落盘失败只影响重启后的兜底判断，不影响跑活 */
    }
  }

  function startDispatch(fields = {}) {
    // 允许调用方预分配 id：异步派活要先拿到 jobId 才能立刻返回，
    // 而真正的 startDispatch 在队列排到后才执行。
    const id = fields.id
      ? String(fields.id)
      : `${Date.now().toString(36)}-${(++runSeq).toString(36)}`
    const startedMs = Date.now()
    const startedAt = new Date(startedMs).toISOString()
    const session = String(fields.session || '')
    const conversationId = String(fields.conversationId || '')
    const sessionKey = sessionKeyOf(fields.hand, session, startedMs, conversationId || id)
    const entry = {
      id,
      startedAt,
      hand: String(fields.hand || ''),
      tool: String(fields.tool || ''),
      prompt: String(fields.prompt || '').slice(0, 4000),
      write: !!fields.write,
      session,
      sessionKey,
      conversationId,
      cwd: String(fields.cwd || ''),
      model: String(fields.model || ''),
      output: '',
      outputLength: 0,
      outputAt: startedMs,
    }
    appendRecord(
      clean({
        v: 2,
        phase: 'start',
        id,
        at: startedAt,
        startedAt,
        hand: entry.hand,
        tool: entry.tool,
        prompt: entry.prompt,
        write: entry.write,
        session: entry.session,
        sessionKey: entry.sessionKey,
        conversationId: entry.conversationId,
        cwd: entry.cwd,
        model: entry.model,
      }),
    )
    bumpToday(entry.hand, entry.sessionKey, startedMs)
    const live = createLiveView(entry.hand)
    RUNNING.set(id, entry)
    // 异步 job 先按目标会话排队、这里才真正派发；补上权威 id 和目标会话元数据。
    const asyncRecord = asyncState.jobs[id]
    if (asyncRecord) {
      Object.assign(asyncRecord, dispatchJobMetadata({ id, entry }))
      const liveJob = ASYNC_JOBS.get(id)
      if (liveJob) Object.assign(liveJob, dispatchJobMetadata({ id, entry }))
      sessionQueue.addAliases(id, asyncSessionLockKeys(asyncRecord))
      saveAsyncState()
    }
    touchRunning()
    touchAgentDimensions(entry)
    return {
      id,
      startedMs,
      entry,
      cancelled: !!ASYNC_JOBS.get(id)?.cancelled,
      finished: false,
      push(chunk, source) {
        if (run.finished) return
        live.feed(chunk, source)
        entry.output = live.render()
        entry.blocks = live.blocks()
        entry.outputLength = live.totalLength()
        entry.outputAt = Date.now()
        touchRunning()
      },
      // ACP 的结构化更新走同一套 live view（feedEvent 内部丢弃 replay:true 的历史块）
      feedEvent(update) {
        if (run.finished) return
        live.feedEvent(update)
        entry.output = live.render()
        entry.blocks = live.blocks()
        entry.outputLength = live.totalLength()
        entry.outputAt = Date.now()
        touchRunning()
      },
      flush() {
        live.flush()
        entry.output = live.render()
        entry.blocks = live.blocks()
        entry.outputLength = live.totalLength()
      },
    }
  }

  // 把一次派发收尾：从运行中移除，元信息进日志，全文进 hands-jobs。
  // 幂等：cancel 先收尾之后，工具那条 await 分支再收一次就是空操作，不会写出两条 end。
  function finishDispatch(run, fields = {}) {
    if (!run || run.finished) return false
    run.finished = true
    run.flush?.()
    const output = String(run.entry.output || '')
    const endMs = Date.now()
    const startedMs = Number.isFinite(run.startedMs) ? run.startedMs : endMs
    const status = String(fields.status || (fields.ok ? 'OK' : 'ERROR')).toUpperCase()
    const jobFile = saveJobText(run.id, output)
    const sessionKey =
      run.entry.sessionKey || sessionKeyOf(run.entry.hand, run.entry.session, startedMs, run.entry.conversationId || run.id)
    RUNNING.delete(run.id)
    RUNNING_PROCS.delete(run.id)
    appendRecord(
      clean({
        v: 2,
        phase: 'end',
        id: run.id,
        at: new Date(endMs).toISOString(),
        startedAt: run.entry.startedAt,
        hand: run.entry.hand,
        tool: run.entry.tool,
        prompt: run.entry.prompt,
        status,
        ok: fields.ok === true,
        ms: Number.isFinite(fields.ms) ? fields.ms : endMs - startedMs,
        write: run.entry.write,
        session: run.entry.session,
        sessionKey,
        conversationId: fields.conversationId || run.entry.conversationId || '',
        cwd: run.entry.cwd,
        model: run.entry.model,
        exitCode: fields.exitCode,
        excerpt: String(fields.excerpt || output).slice(0, 1200),
        outputLength: Number(run.entry.outputLength) || 0,
        jobFile: jobFile || undefined,
        tokens: fields.tokens,
        cost: fields.cost,
        stopReason: fields.stopReason ? String(fields.stopReason) : undefined,
        runner: fields.runner ? String(fields.runner) : undefined,
        // 语义分块（思维链/正文/工具）：面板据此分开渲染；老字段 output/excerpt 不动。
        blocks: Array.isArray(run.entry.blocks) && run.entry.blocks.length
          ? run.entry.blocks.slice(-80)
          : undefined,
        error: fields.error ? String(fields.error).slice(0, 1200) : undefined,
      }),
    )
    touchHistory()
    const conversationId = fields.conversationId || run.entry.conversationId || ''
    touchAgentDimensions({ ...run.entry, sessionKey, conversationId })
    const asyncRecord = asyncState.jobs[run.id]
    if (asyncRecord) {
      Object.assign(asyncRecord, dispatchJobMetadata({ id: run.id, entry: { ...run.entry, conversationId } }))
      sessionQueue.addAliases(run.id, asyncSessionLockKeys({ ...run.entry, conversationId }))
      saveAsyncState()
    }
    return true
  }

  // ── 异步派活：先返回 jobId，跑完把结果投回调用方会话 ──────────────────────
  // 依据（2026-11-18 核实）：dsh-qq-bridge/lib/host.js:1505
  //   await agent.followup({ id, role:'user', content:[{type:'text',text}], source:{kind} })
  // 能把消息投进会话并把它唤醒；同文件 :1502 的注释说得很清楚：
  //   **必须 await**，漏接 reject 会让整个 DSH 宿主退出。
  // 会话句柄的取法见 host.js:939-952：id 有带/不带 `session-` 前缀两种写法，双向试。

  const ASYNC_JOBS = new Map() // jobId -> 内存状态（正在跑的那几秒用）
  // 落盘状态：谁跑完了、谁还没投、谁投过。重启后靠它补投 / 收尸。
  const asyncState = readAsyncState()
  const saveAsyncState = () => writeAsyncState(asyncState)

  function beginAsyncJob(job, run) {
    if (run) Object.assign(job, dispatchJobMetadata(run))
    if (!job.dispatchId) job.dispatchId = job.id
    ASYNC_JOBS.set(job.id, job)
    asyncState.jobs[job.id] = { ...job }
    saveAsyncState()
    return job
  }

  // 手下会话身份与 DSH 调用方 sessionId 分开存；恢复时只用这些字段回查索引。
  function dispatchJobMetadata(run) {
    return {
      dispatchId: run.id,
      session: String(run.entry.session || ''),
      sessionKey: String(run.entry.sessionKey || ''),
      conversationId: String(run.entry.conversationId || ''),
      cwd: String(run.entry.cwd || ''),
      model: String(run.entry.model || ''),
      sessionLockKey: asyncSessionLockKeys(run.entry)[0] || '',
    }
  }

  // ── 并发闸门：同时最多跑 N 个异步活，多的排队（先进先出） ──────────────
  // 四个手下同时起进程会把机器压死（每个都是独立 CLI，还带自己的模型会话）。
  // 同步调用不受限：那是调用方自己愿意等的。
  const asyncQueue = createAsyncQueue(config.maxAsync)
  // 第二参数 key：异步任务传 jobId，/dsh-hands/cancel 就拿它去 asyncQueue.cancel
  const runQueued = (start, key) => asyncQueue.run(start, key)
  const asyncQueueStats = () => asyncQueue.stats()
  const sessionQueueLimit = normalizeSessionQueueLimit(config.maxSessionQueue)
  const sessionQueue = createSessionQueue(sessionQueueLimit)

  // 宿主重启后，旧进程可能仍活着。给它保留目标会话锁，直到 pid 真死才释放，
  // 否则新任务会与旧任务同时改同一个工作区。无 pid 的旧 RUNNING 无法证明存活，不锁。
  const recoveredSessionLocks = new Map()
  for (const record of Object.values(asyncState.jobs || {})) {
    if (!record?.id || record.endedAt || String(record.status || '').toUpperCase() !== 'RUNNING') continue
    const pid = Number(record.pid)
    if (!Number.isInteger(pid) || pid <= 0 || !isAsyncJobActive(record)) continue
    const token = sessionQueue.reserve(asyncSessionLockKeys(record))
    if (token) recoveredSessionLocks.set(String(record.id), { token, pid })
  }
  ctx.effect(() => {
    if (!recoveredSessionLocks.size) return () => {}
    const timer = setInterval(() => {
      for (const [id, locked] of recoveredSessionLocks) {
        const current = asyncState.jobs[id]
        if (current && isAsyncJobActive(current)) continue
        if (!sessionQueue.release(locked.token)) continue
        recoveredSessionLocks.delete(id)
        const record = asyncState.jobs[id]
        if (record && !record.endedAt) {
          const endedAt = new Date().toISOString()
          const startedMs = Date.parse(record.startedAt || '') || Date.now()
          const start = findAsyncDispatchStart(record, readRecords())
          record.status = 'ORPHAN'
          record.endedAt = endedAt
          record.delivery = record.delivery === 'sent' ? 'sent' : 'skipped'
          record.deliveryError = 'DSH 重启后恢复的进程已经退出'
          record.recoverNote = `恢复锁在 pid ${locked.pid} 退出后释放`
          if (start) {
            appendRecord(
              clean({
                ...start,
                id: String(start.id),
                v: 2,
                phase: 'end',
                at: endedAt,
                startedAt: String(start.startedAt || start.at || new Date(startedMs).toISOString()),
                status: 'ORPHAN',
                ok: false,
                ms: Math.max(0, Date.parse(endedAt) - startedMs),
                excerpt: '',
                error: '重启后进程已退出（恢复进程 orphan）',
              }),
            )
          }
          saveAsyncState()
          touchRunning()
          touchHistory()
          touchAgentDimensions({
            ...(start || {}),
            ...record,
            id: String(start?.id || record.dispatchId || record.id),
            status: 'ORPHAN',
          })
        }
      }
    }, 5000)
    timer.unref?.()
    return () => clearInterval(timer)
  }, 'dsh-hands: recovered session locks')

  function setAsyncJobStatus(job, status, queuePosition = 0) {
    job.status = status
    job.queuePosition = Math.max(0, Number(queuePosition) || 0)
    job.queueLimit = sessionQueueLimit
    const record = asyncState.jobs[job.id]
    if (record) {
      record.status = job.status
      record.queuePosition = job.queuePosition
      record.queueLimit = job.queueLimit
      saveAsyncState()
    }
    touchRunning()
    touchAgentDimensions(job)
  }

  // perform 在 startDispatch 之前失败（例如排队期间票据过期/新会话已被前序建出）时，
  // asyncState 有失败回传，但还必须补一条 end，否则面板里这条 job 会凭空消失。
  function recordAsyncStartFailure(job, error, { status = 'ERROR', excerpt = '' } = {}) {
    const id = String(job.dispatchId || job.id)
    const hasStart = readRecords().some((row) => row?.phase === 'start' && String(row.id || '') === id)
    if (hasStart) return false
    const now = Date.now()
    const startedAt = new Date(Number(job.startedAt) || now).toISOString()
    appendRecord(
      clean({
        v: 2,
        phase: 'end',
        id,
        at: new Date(now).toISOString(),
        startedAt,
        hand: String(job.hand || ''),
        tool: String(job.tool || ''),
        prompt: String(job.prompt || ''),
        write: !!job.write,
        session: String(job.session || ''),
        sessionKey: String(job.sessionKey || ''),
        conversationId: String(job.conversationId || ''),
        cwd: String(job.cwd || ''),
        model: String(job.model || ''),
        status,
        ok: false,
        ms: Math.max(0, now - (Number(job.startedAt) || now)),
        excerpt,
        error: String(error?.message ?? error).slice(0, 1200),
      }),
    )
    touchHistory()
    touchAgentDimensions(job)
    return true
  }

  // 五条异步派活共用：先按目标会话排队，队首才进入全局并发闸门。
  // 队列满时在写 asyncState 之前直接拒绝，不会留下一个假装 RUNNING 的幽灵 job。
  function startAsyncJob(ctx, job, start, summarize) {
    const keys = asyncSessionLockKeys(job)
    const placement = sessionQueue.enqueue({
      key: job.id,
      keys,
      start: () => runQueued(async () => {
        if (job.cancelled || asyncQueue.isCancelled(job.id)) return { cancelled: true, cancelledPhase: 'queued' }
        const value = await start()
        if (job.cancelled) {
          return {
            ...(value && typeof value === 'object' ? value : {}),
            status: 'CANCELLED',
            cancelled: true,
            cancelledPhase: 'running',
          }
        }
        return value
      }, job.id),
      onStart: () => setAsyncJobStatus(job, 'RUNNING', 0),
      onQueue: ({ position }) => setAsyncJobStatus(job, 'QUEUED', position),
    })
    if (!placement.accepted) {
      throw new Error(`该会话已有任务在跑，且排队已满（上限 ${placement.limit}）`)
    }
    job.status = placement.status
    job.queuePosition = placement.position
    job.queueLimit = placement.limit
    job.sessionLockKey = keys[0] || ''
    beginAsyncJob(job)
    placement.promise
      .then(async (value) => {
        if (value?.cancelledPhase === 'queued' && await settleCancelledQueuedJob(ctx, job, null, value)) return job
        return settleAsyncJob(ctx, job, summarize(value))
      })
      .catch(async (error) => {
        recordAsyncStartFailure(job, error)
        return settleAsyncJob(ctx, job, {
          status: 'ERROR',
          ms: Date.now() - job.startedAt,
          exitCode: null,
          excerpt: '',
          error: String(error?.message ?? error),
        })
      })
    return {
      status: job.status,
      queuePosition: job.queuePosition,
      queueLimit: job.queueLimit,
      sessionLockKey: job.sessionLockKey,
    }
  }

  function asyncDispatchNote(status, queuePosition) {
    return status === 'QUEUED'
      ? `已排队，前面还有 ${queuePosition} 个`
      : '跑完会把结果投回这个会话，期间你可以接着干别的'
  }

  async function deliverAsyncReport(ctx, job, text) {
    const agent = findAgentFor(ctx, job.sessionId)
    if (!agent || typeof agent.followup !== 'function') {
      job.delivery = 'no-agent'
      job.deliveryError = job.sessionId ? '会话已经不在（agent 找不到）' : '派活时没拿到会话 id'
      return false
    }
    try {
      // ⚠️ 必须 await：reject 不接住会让整个 DSH 宿主退出
      await agent.followup({
        id: `${job.id}-report`,
        role: 'user',
        content: [{ type: 'text', text }],
        source: { kind: 'plugin:hands' },
      })
      job.delivery = 'sent'
      job.deliveredAt = new Date().toISOString()
      return true
    } catch (error) {
      job.delivery = 'failed'
      job.deliveryError = String(error?.message ?? error).slice(0, 400)
      return false
    }
  }

  // 收尾：写 end 记录 + 把回传投回会话。两条路都走这里，行为一致。
  async function settleAsyncJob(ctx, job, summary) {
    job.status = summary.status
    job.ms = summary.ms
    job.queuePosition = 0
    job.endedAt = new Date().toISOString()
    const text = asyncReportText(job, summary)
    const record = asyncState.jobs[job.id] || (asyncState.jobs[job.id] = { ...job })
    Object.assign(record, {
      sessionId: job.sessionId || record.sessionId || '',
      status: job.status,
      ms: job.ms,
      queuePosition: 0,
      endedAt: job.endedAt,
      report: String(text).slice(0, 2000), // 存正文：重启后能原样补投，不用重算
    })
    touchRunning()
    touchHistory()
    touchAgentDimensions(job)
    // 已经投过就别再投一次（同一次派活只该有一条回传）
    if (record.delivery === 'sent') {
      saveAsyncState()
      releaseSettledAsyncJob(job.id, record)
      return job
    }
    await deliverAsyncWithRetry(ctx, job, record, text)
    releaseSettledAsyncJob(job.id, record)
    return job
  }

  // 队列期取消（/dsh-hands/cancel 把排队中的条目摘下、value.cancelled）：
  // perform 没跑，从运行表摘下并写 end 记录，回传按 CANCELLED 收尾。返回 true。
  // 已在跑正常走 settleAsyncJob，返回 false。
  async function settleCancelledQueuedJob(ctx, job, run, value) {
    if (!value?.cancelled) return false
    if (run && !run.finished) {
      finishDispatch(run, {
        status: 'CANCELLED',
        ok: false,
        ms: Date.now() - job.startedAt,
        error: 'cancelled',
        excerpt: 'cancelled',
      })
    } else {
      recordAsyncStartFailure(job, 'cancelled while queued', {
        status: 'CANCELLED',
        excerpt: '排队时被取消，进程没有启动',
      })
    }
    await settleAsyncJob(ctx, job, {
      status: 'CANCELLED',
      ms: Date.now() - job.startedAt,
      exitCode: null,
      excerpt: '排队时被取消，进程没有启动',
      error: 'cancelled while queued',
    })
    return true
  }

  // ── 回传的退避重试 ─────────────────────────────────────────────────────
  // 状态机在 nextAsyncDelivery()（纯函数、可单测）；这里只管定时器和落盘。
  const asyncDeliveryTimers = new Map() // jobId -> timer

  function clearAsyncDeliveryTimer(id) {
    const timer = asyncDeliveryTimers.get(id)
    if (!timer) return
    clearTimeout(timer)
    asyncDeliveryTimers.delete(id)
  }

  // 任务已结束且回传状态已经定案才从内存活跃表移除；重试中的仍要可见。
  function releaseSettledAsyncJob(id, record = asyncState.jobs[id]) {
    const job = ASYNC_JOBS.get(String(id || ''))
    if (!job?.endedAt || !record) return false
    if (record.delivery === 'retrying' || record.nextRetryAt || asyncDeliveryTimers.has(job.id)) return false
    if (!['sent', 'failed', 'no-agent', 'skipped'].includes(String(record.delivery || ''))) return false
    return ASYNC_JOBS.delete(job.id)
  }

  function scheduleAsyncDeliveryRetry(ctx, id, delayMs) {
    clearAsyncDeliveryTimer(id)
    const timer = setTimeout(() => {
      asyncDeliveryTimers.delete(id)
      const record = asyncState.jobs[id]
      if (!record || record.delivery === 'sent' || !record.report) return
      const job = {
        id: record.id,
        hand: record.hand,
        tool: record.tool,
        sessionId: record.sessionId,
        prompt: record.prompt,
        delivery: 'pending',
      }
      deliverAsyncWithRetry(ctx, job, record, record.report).catch(() => {
        // 重试失败也要如实落盘，别让状态卡在 retrying
        record.delivery = 'failed'
        record.deliveryError = record.deliveryError || '重试投递失败'
        delete record.nextRetryAt
        saveAsyncState()
      })
    }, Math.max(1000, Number(delayMs) || 0))
    timer.unref?.()
    asyncDeliveryTimers.set(id, timer)
  }

  // 投一次；失败就按退避排下一次。返回是否投成功。
  async function deliverAsyncWithRetry(ctx, job, record, text) {
    let ok = false
    try {
      ok = await deliverAsyncReport(ctx, job, text)
    } catch (error) {
      job.delivery = 'failed'
      job.deliveryError = String(error?.message ?? error).slice(0, 400)
      ok = false
    }
    const next = job.delivery === 'no-agent'
      ? { delivery: 'no-agent', attempts, retryAt: 0, delayMs: 0, exhausted: false }
      : nextAsyncDelivery(record, ok ? 'sent' : 'failed')
    record.delivery = next.delivery
    record.deliveryAttempts = next.attempts
    record.deliveryError = ok ? '' : job.deliveryError || record.deliveryError || ''
    record.deliveredAt = ok ? job.deliveredAt || new Date().toISOString() : record.deliveredAt || ''
    if (next.delivery === 'retrying') {
      record.nextRetryAt = next.retryAt
      scheduleAsyncDeliveryRetry(ctx, record.id, next.delayMs)
    } else {
      delete record.nextRetryAt
      clearAsyncDeliveryTimer(record.id)
    }
    saveAsyncState()
    releaseSettledAsyncJob(job.id, record)
    return ok
  }

  // 插件卸载时把重试定时器全部撤掉，别让已停用的插件还在后台投东西。
  ctx.effect(() => () => {
    for (const timer of asyncDeliveryTimers.values()) clearTimeout(timer)
    asyncDeliveryTimers.clear()
  }, 'dsh-hands: async delivery timers')

  // 启动时对账：进程真死了的标 ORPHAN（还在跑的诚实留 RUNNING，跑完后补投），
  // 跑完但没投出去的补投一次。
  async function recoverAsyncJobs() {
    const plan = planAsyncRecovery(asyncState)
    for (const id of plan.queued || []) {
      const record = asyncState.jobs[id]
      if (!record) continue
      record.status = 'CANCELLED'
      record.endedAt = record.endedAt || new Date().toISOString()
      record.delivery = record.delivery === 'sent' ? 'sent' : 'skipped'
      record.deliveryError = 'DSH 重启：排队任务从未启动，已安全丢弃'
      record.recoverNote = `排队任务未启动（原位置 ${Number(record.queuePosition) || 0}），宿主重启后不自动重放`
      record.queuePosition = 0
      console.warn(`[dsh-hands] 丢弃未启动的排队任务 ${id}：${record.recoverNote}`)
    }
    for (const id of plan.orphan) {
      const record = asyncState.jobs[id]
      if (!record) continue
      record.status = 'ORPHAN'
      record.endedAt = record.endedAt || new Date().toISOString()
      record.delivery = record.delivery === 'sent' ? 'sent' : 'skipped'
      record.deliveryError = 'DSH 重启时这个任务还在跑，进程已经没了'
    }
    for (const id of plan.running) {
      const record = asyncState.jobs[id]
      if (!record) continue
      // 诚实标签：进程仍在跑（pid N）——别因为没 endedAt 就说它死了、跳过结果。
      record.status = 'RUNNING'
      record.delivery = record.delivery === 'sent' ? 'sent' : 'pending'
      record.recoverNote = record.pid
        ? `DSH 重启时进程仍在跑（pid ${record.pid}）`
        : 'DSH 重启时进程仍在跑'
    }
    let delivered = 0
    for (const id of plan.deliver) {
      const record = asyncState.jobs[id]
      if (!record || !record.report) continue
      const job = {
        id: record.id,
        hand: record.hand,
        tool: record.tool,
        sessionId: record.sessionId,
        prompt: record.prompt,
        delivery: 'pending',
      }
      try {
        // 走同一条重试通道：启动时投不进去也别直接判死，继续退避重试。
        const ok = await deliverAsyncWithRetry(ctx, job, record, record.report)
        if (ok) delivered += 1
      } catch (error) {
        record.delivery = 'failed'
        record.deliveryError = String(error?.message ?? error).slice(0, 400)
      }
    }
    saveAsyncState()
    return { delivered, orphans: plan.orphan.length, running: plan.running.length, discardedQueued: (plan.queued || []).length }
  }

  // 启动后等 agents 服务就绪，再补投上一次没投出去的回传。
  // 只投「已经跑完、有正文、没投过」的，绝不重投已经投过的。
  ctx.effect(() => {
    const timer = setTimeout(() => {
      recoverAsyncJobs().catch(() => {
        // 补投失败不影响插件本体
      })
    }, 4000)
    return () => clearTimeout(timer)
  }, 'dsh-hands: async recovery')

  function runningList() {
    const now = Date.now()
    return panelDispatchState().running
      .map((entry) =>
        clean({
          ...entry,
          status: 'RUNNING',
          ok: false,
          ms: Math.max(0, now - Date.parse(entry.startedAt)),
          output: String(entry.output || '').slice(-20000),
          outputAt: entry.outputAt,
        }),
      )
      .sort((a, b) => String(b.startedAt).localeCompare(String(a.startedAt)))
  }

  function queuedList() {
    return panelDispatchState().queued
      .map((entry) =>
        clean({
          ...entry,
          status: 'QUEUED',
          ok: false,
          running: false,
          queued: true,
          queuePosition: Math.max(0, Number(entry.queuePosition) || 0),
          queueLimit: Math.max(0, Number(entry.queueLimit) || 0),
          output: '',
        }),
      )
      .sort((a, b) => Number(a.queuePosition) - Number(b.queuePosition) || String(a.startedAt).localeCompare(String(b.startedAt)))
  }

  function historyList(limit = 80) {
    const count = Math.max(1, Math.min(LOG_KEEP, Number(limit) || 80))
    return panelDispatchState().jobs.slice(0, count).map(stripOutput)
  }

  function snapshot(limit = 80) {
    const now = Date.now()
    return {
      checkedAt: new Date(now).toISOString(),
      revision: runningRevision,
      historyRevision,
      running: runningList(),
      queued: queuedList(),
      entries: historyList(limit),
    }
  }

  function fullEntry(id) {
    const panel = panelDispatchState()
    const live = panel.running.find((entry) => String(entry.id || '') === String(id || ''))
    if (live) {
      return clean({
        ...live,
        status: 'RUNNING',
        ok: false,
        ms: Math.max(0, Date.now() - Date.parse(live.startedAt)),
        output: String(live.output || '').slice(-20000),
      })
    }
    const entry = panel.jobs.find((job) => String(job.id || '') === String(id || ''))
    return entry ? clean({ ...entry, output: readJobText(entry) }) : null
  }

  // ── v2 面板的组装函数（不碰 req/res，/agents、/sessions、/stream 共用）────────
  function agentsPayload() {
    const checkedAt = new Date().toISOString()
    const panel = panelDispatchState()
    const runningByHand = Object.create(null)
    const queuedByHand = Object.create(null)
    for (const entry of panel.running) {
      const hand = String(entry.hand || '')
      runningByHand[hand] = (runningByHand[hand] || 0) + 1
    }
    for (const entry of panel.queued || []) {
      const hand = String(entry.hand || '')
      queuedByHand[hand] = (queuedByHand[hand] || 0) + 1
    }
    const lastAtByHand = Object.create(null)
    for (const job of panel.jobs) {
      const hand = String(job.hand || '')
      const at = String(job.at || job.startedAt || '')
      if (at && (!lastAtByHand[hand] || at > lastAtByHand[hand])) lastAtByHand[hand] = at
    }
    const agents = Object.entries(HANDS).map(([hand, handDef]) =>
      clean({
        hand,
        label: handDef.label,
        running: runningByHand[hand] || 0,
        queued: queuedByHand[hand] || 0,
        today: todayCount(hand),
        sessions: listSessions(hand).filter((row) => row.archived !== true).length,
        lastAt: lastAtByHand[hand] || '',
        // ok / version 走 /health；这里保持旧 /agents 的字段形态，前端不用判空
        ok: false,
        bin: handDef.bin(),
        version: '',
      }),
    )
    return { checkedAt, revision: agentsRevision, agents }
  }

  function sessionsForHand(hand, opts = {}) {
    const wanted = String(hand || '')
    // 原样包一层 listSessions()，不动它已有的字段
    return { hand: wanted, sessions: listSessions(wanted, opts) }
  }

  function sessionsRevisionOf(hand) {
    return handRevisions.get(String(hand || '')) || 0
  }

  function turnsRevisionOf(key) {
    return keyRevisions.get(String(key || '')) || 0
  }

  // 各家 exit code / 自报状态不一致，统一折算成「成没成」。
  // CANCELLED 是单独一类：不算成功，也别被下面的 code !== 0 兜底改写成 ERROR。
  const FAILED_STATUS = ['ERROR', 'FAILED', 'UNPARSED']
  function outcome(result, reported) {
    if (result?.cancelled) return { status: 'CANCELLED', ok: false }
    if (result.timedOut) return { status: 'TIMEOUT', ok: false }
    let status = String(reported || (result.code === 0 ? 'OK' : 'ERROR')).toUpperCase()
    if (status === 'CANCELLED') return { status, ok: false }
    if (result.code !== 0 && !FAILED_STATUS.includes(status)) status = 'ERROR'
    const failed = FAILED_STATUS.includes(status)
    return { status, ok: result.code === 0 && !failed }
  }

  // ── ACP 分支（第 6 步）：config.acpHands 点名的手下先走 ACP，失败再回退 CLI ──────
  //
  // usage 各家形状不一：标准 ACP 是 { used, size, cost: { amount } }，
  // opencode 实测把 used/size/cost 平铺在 update 上（runner 已摊平）；取不到就给 null，
  // 面板成本栏留空可以接受，别为了凑数字瞎猜。
  function acpUsageOf(usage) {
    if (!usage || typeof usage !== 'object') return { tokens: null, cost: null }
    let tokens = null
    if (Number.isFinite(usage.used)) tokens = usage.used
    else if (Number.isFinite(usage.totalTokens)) tokens = usage.totalTokens
    else if (Number.isFinite(usage.inputTokens) || Number.isFinite(usage.outputTokens)) {
      tokens = (Number(usage.inputTokens) || 0) + (Number(usage.outputTokens) || 0)
    }
    const raw = usage.cost && typeof usage.cost === 'object' ? usage.cost.amount : usage.cost
    const cost = Number.isFinite(raw) ? raw : Number.isFinite(usage.totalCostUsd) ? usage.totalCostUsd : null
    return { tokens, cost }
  }

  // 回退只记一行日志：phase 不写 start/end，也没有 id，mergedJobs 会直接跳过它，
  // 不污染会话/轮次聚合。
  function noteAcpFallback(hand, runId, error) {
    appendRecord(
      clean({
        v: 2,
        phase: 'acp-fallback',
        at: new Date().toISOString(),
        hand: String(hand || ''),
        runId: String(runId || ''),
        error: String(error || 'acp failed'),
      }),
    )
  }

  // 走一次 ACP。拿不到可用结果（动态 import 失败 / 抛异常 / ok=false）就返回 null，
  // 由调用方回退一次 CLI —— ACP 挂了不能把工具本身弄失败。
  // 权限按 write 折：write=false 一律拒（和 CLI 只读语义对齐），true 才自动放行。
  // 注意：ACP 的进程句柄留在 runner 内部，本轮没接进 RUNNING_PROCS，/cancel 只对 CLI 生效。
  // ── 权限请求回流：ACP 问「能不能跑这个工具」时挂起，等面板答复 ──────────────
  // 有写权限时把请求挂进队列，默认 60 秒没人点就 reject（fail-closed），绝不自动放行。
  const pendingPermissions = new Map()
  let permissionSeq = 0

  function askPermission(hand, params) {
    return new Promise((resolve) => {
      const id = `perm-${Date.now().toString(36)}-${++permissionSeq}`
      const toolCall = params?.toolCall || {}
      let detail = ''
      try {
        detail = JSON.stringify(toolCall.rawInput || toolCall.input || {}).slice(0, 300)
      } catch {
        detail = ''
      }
      const entry = {
        id,
        hand: String(hand || ''),
        title: String(toolCall.title || toolCall.name || params?.toolName || 'tool'),
        kind: String(toolCall.kind || ''),
        detail,
        createdAt: Date.now(),
        resolve: null,
        timer: null,
      }
      const timeoutMs = Math.max(5000, Number(config.permissionTimeoutMs) || 60000)
      entry.timer = setTimeout(() => {
        pendingPermissions.delete(id)
        resolve('reject')
      }, timeoutMs)
      entry.timer.unref?.()
      entry.resolve = (decision) => {
        pendingPermissions.delete(id)
        clearTimeout(entry.timer)
        resolve(decision === 'allow' ? 'allow' : 'reject')
      }
      pendingPermissions.set(id, entry)
    })
  }

  // ── ACP 常驻会话（可选，config.acpPersist）──────────────────────────────
  // 同一个 hand + cwd + 会话 id 复用同一个子进程；关掉时仍走一次一进程。
  const acpPool = config.acpPersist
    ? createAcpSessionPool({ idleMs: Math.max(60_000, Number(config.acpIdleMs) || 600_000) })
    : null

  ctx.effect(() => {
    if (!acpPool) return () => {}
    const timer = setInterval(() => {
      try {
        acpPool.sweep()
      } catch {
        // 清理失败不影响插件
      }
    }, 60_000)
    timer.unref?.()
    return () => {
      clearInterval(timer)
      acpPool.closeAll()
    }
  }, 'dsh-hands: acp session pool')

  async function runAcpTurn(hand, { run, prompt, cwd, model, timeoutSec, sessionId, write }) {
    // 要写文件时逐次问面板；只读直接拒（不弹授权）
    const permission = write ? (params) => askPermission(hand, params) : 'reject'

    // 常驻会话：复用进程，live 更新通过 slot.holder 转到当轮 run
    if (acpPool) {
      const workdir = path.resolve(cwd || process.cwd())
      const key = `${hand}|${workdir}|${sessionId || 'new'}`
      try {
        const slot = await acpPool.acquire(key, async (current) => {
          const { createAcpSession } = await import('./acp/runner.mjs')
          return createAcpSession({
            agent: hand,
            cwd: workdir,
            permission,
            onUpdate: (update) => current.holder.current?.feedEvent?.(update),
          })
        })
        slot.holder.current = run
        const started = Date.now()
        const value = await slot.handle.prompt(prompt, {
          model: model || undefined,
          timeoutMs: (Number(timeoutSec) || defaultTimeout) * 1000,
        })
        acpPool.touch(key)
        const result = {
          ok: true,
          text: String(value?.text || ''),
          stopReason: value?.stopReason ?? null,
          sessionId: slot.handle.sessionId,
          usage: value?.usage ?? null,
          ms: Date.now() - started,
          resumed: true,
        }
        return run.cancelled ? { ...result, ok: false, cancelled: true, error: 'cancelled' } : result
      } catch (error) {
        acpPool.release(key)
        if (run.cancelled) return { ok: false, cancelled: true, error: 'cancelled' }
        noteAcpFallback(hand, run.id, error?.message ?? error)
        return null
      }
    }

    try {
      const { runAcpTask } = await import('./acp/runner.mjs')
      const result = await runAcpTask({
        agent: hand,
        cwd,
        prompt,
        model: model || undefined,
        sessionId: sessionId || undefined,
        timeoutMs: (Number(timeoutSec) || defaultTimeout) * 1000,
        permission,
        onUpdate: (update) => run.feedEvent?.(update),
      })
      if (run.cancelled) return { ...result, ok: false, cancelled: true, error: 'cancelled' }
      if (result?.ok) return result
      noteAcpFallback(hand, run.id, result?.error || 'acp failed')
      return null
    } catch (error) {
      if (run.cancelled) return { ok: false, cancelled: true, error: 'cancelled' }
      noteAcpFallback(hand, run.id, error?.message ?? error)
      return null
    }
  }

  // ACP 没有 exit code，用 ok 折算成 outcome() 认的形状；超时按错误文本认。
  function acpOutcome(acp, cancelled = false) {
    return outcome({
      code: acp?.ok ? 0 : 1,
      timedOut: /timeout/i.test(String(acp?.error || '')),
      cancelled: acp?.cancelled || cancelled,
    })
  }

  // 宿主重启后先把上次的孤儿 start 收尸，再算今天的次数。
  reconcileLog()
  seedToday(readJobs())

  ctx.effect(
    () =>
      ctx.webServer.register({
        kind: 'prefix',
        path: '/dsh-hands',
        handler: async (req, res) => {
          const send = (status, body) => {
            if (res.destroyed || res.writableEnded || res.headersSent) return
            res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
            res.end(JSON.stringify(body))
          }
          try {
            const u = new URL(req.url, 'http://localhost')
            if (u.pathname === '/dsh-hands/log') {
              const n = Number(u.searchParams.get('n') || '80')
              return send(200, snapshot(n))
            }
            if (u.pathname === '/dsh-hands/job') {
              const id = String(u.searchParams.get('id') || '')
              const entry = id ? fullEntry(id) : null
              return send(entry ? 200 : 404, entry ? { entry } : { error: 'not found' })
            }
            // 异步派活的观测口：内存里正在跑的 + 落盘状态里最近的。
            // 排查「投没投出去 / 是不是孤儿」就看这里，不用去翻日志。
            if (u.pathname === '/dsh-hands/async') {
              const limit = Math.max(1, Math.min(200, Number(u.searchParams.get('n') || '50')))
              const live = [...ASYNC_JOBS.values()]
                .filter((job) => !job.endedAt || job.delivery === 'retrying' || asyncDeliveryTimers.has(job.id))
                .sort((a, b) => asyncJobStartedMs(b.startedAt) - asyncJobStartedMs(a.startedAt))
                .map((job) =>
                clean({
                  id: job.id,
                  hand: job.hand,
                  tool: job.tool,
                  status: job.status,
                  sessionId: job.sessionId,
                  session: job.session || '',
                  conversationId: job.conversationId || '',
                  cwd: job.cwd || '',
                  sessionLockKey: job.sessionLockKey || '',
                  queued: job.status === 'QUEUED',
                  queuePosition: Number(job.queuePosition) || 0,
                  queueLimit: Number(job.queueLimit) || 0,
                  startedAt: job.startedAt,
                  ms: job.ms,
                  delivery: job.delivery,
                  deliveryError: job.deliveryError,
                }),
              )
              const persisted = Object.values(asyncState.jobs || {})
                .sort((a, b) => asyncJobStartedMs(b.startedAt) - asyncJobStartedMs(a.startedAt))
                .slice(0, limit)
                .map((record) =>
                  clean({
                    id: record.id,
                    hand: record.hand,
                    tool: record.tool,
                    status: record.status,
                    sessionId: record.sessionId,
                    session: record.session || '',
                    conversationId: record.conversationId || '',
                    cwd: record.cwd || '',
                    sessionLockKey: record.sessionLockKey || '',
                    queued: String(record.status || '').toUpperCase() === 'QUEUED' && !record.endedAt,
                    queuePosition: Number(record.queuePosition) || 0,
                    queueLimit: Number(record.queueLimit) || 0,
                    startedAt: record.startedAt,
                    endedAt: record.endedAt,
                    ms: record.ms,
                    delivery: record.delivery,
                    deliveryError: record.deliveryError,
                    deliveredAt: record.deliveredAt,
                    deliveryAttempts: record.deliveryAttempts,
                    nextRetryAt: record.nextRetryAt,
                    hasReport: !!record.report,
                  }),
                )
              return send(200, {
                live,
                persisted,
                counts: { live: live.length, persisted: persisted.length, queued: live.filter((job) => job.status === 'QUEUED').length },
                // 队列水位：全局并发 + 每个目标会话的等待上限/数量。
                queue: { ...asyncQueueStats(), session: sessionQueue.stats() },
              })
            }
            // 权限请求回流：面板轮询挂起中的授权，POST 回 allow/reject
            if (u.pathname === '/dsh-hands/permissions') {
              const list = [...pendingPermissions.values()].map((entry) => ({
                id: entry.id,
                hand: entry.hand,
                title: entry.title,
                kind: entry.kind,
                detail: entry.detail,
                createdAt: entry.createdAt,
              }))
              return send(200, { permissions: list })
            }
            if (u.pathname === '/dsh-hands/permission') {
              if (req.method !== 'POST') return fail(405, 'POST only')
              try {
                const body = parseBody(await readBody(req))
                const id = String(body.id || '')
                const entry = pendingPermissions.get(id)
                if (!entry) return fail(404, 'not found')
                const decision = body.decision === 'allow' ? 'allow' : 'reject'
                entry.resolve(decision)
                return send(200, { ok: true, id, decision })
              } catch (e) {
                return fail(500, e)
              }
            }

            // 面板内直接派活：复用 rerunInBackground 的后台跑法
            if (u.pathname === '/dsh-hands/dispatch') {
              if (req.method !== 'POST') return fail(405, 'POST only')
              try {
                const body = parseBody(await readBody(req))
                const hand = String(body.hand || '').toLowerCase()
                const prompt = String(body.prompt || '')
                if (!HANDS[hand]) return fail(400, `unknown hand: ${hand || '(empty)'}`)
                if (!prompt.trim()) return fail(400, 'prompt is required')
                const run = rerunInBackground(
                  {
                    hand,
                    tool: `${hand}_run`,
                    write: body.write === true,
                    session: String(body.session || ''),
                    conversationId: String(body.conversationId || ''),
                    cwd: String(body.cwd || ''),
                    model: String(body.model || ''),
                  },
                  prompt,
                )
                if (!run) return fail(400, 'dispatch failed')
                return send(200, {
                  ok: true,
                  id: run.id,
                  hand,
                  cwd: run.entry.cwd,
                  sessionKey: run.entry.sessionKey,
                })
              } catch (e) {
                return fail(500, e)
              }
            }

            // 打开某个会话的工作目录：只接受已知 cwd（防网页被诱导去开任意路径）
            if (u.pathname === '/dsh-hands/open-folder') {
              if (req.method !== 'POST') return fail(405, 'POST only')
              try {
                const body = parseBody(await readBody(req))
                const knownCwds = []
                for (const hand of ['agy', 'codex', 'claude', 'opencode']) {
                  for (const row of listSessions(hand)) {
                    if (row && row.cwd) knownCwds.push(row.cwd)
                  }
                }
                const target = resolveOpenFolder(knownCwds, body.path)
                if (!target) return fail(403, 'unknown folder')
                if (!fs.existsSync(target)) return fail(404, 'folder not found')
                const child = spawn('explorer.exe', [target], { detached: true, stdio: 'ignore' })
                child.unref()
                return send(200, { ok: true, path: target })
              } catch (e) {
                return fail(500, e)
              }
            }

            if (u.pathname === '/dsh-hands/stream') {
              if (res.destroyed || res.writableEnded) return
              res.writeHead(200, {
                'content-type': 'text/event-stream; charset=utf-8',
                'cache-control': 'no-cache, no-transform',
                connection: 'keep-alive',
                'x-accel-buffering': 'no',
              })
              res.write('retry: 1000' + NL + NL)
              let closed = false
              const timers = []
              const cleanup = () => {
                closed = true
                for (const timer of timers) clearInterval(timer)
                try {
                  res.end()
                } catch {
                  /* 已经断了 */
                }
              }
              req.on('close', cleanup)
              res.on('close', cleanup)

              const writeRaw = (chunk) => {
                if (closed || res.destroyed || res.writableEnded) return
                try {
                  res.write(chunk)
                } catch {
                  closed = true
                }
              }

              const ping = setInterval(() => {
                if (!closed && !res.destroyed && !res.writableEnded) {
                  try {
                    res.write(': ping' + NL + NL)
                  } catch {
                    closed = true
                  }
                }
              }, 15000)
              timers.push(ping)

              // ── 旧版：完全没带 key/hand 时事件名、id 格式、250ms/15s 节拍一律照旧 ──
              if (!u.searchParams.has('key') && !u.searchParams.has('hand')) {
                let lastRunning = -1
                let lastHistory = -1
                const writeEvent = (name, data) => {
                  writeRaw(
                    `id: ${data.revision ?? 0}-${data.historyRevision ?? 0}${NL}` +
                      `event: ${name}${NL}` +
                      `data: ${JSON.stringify(data)}${NL}${NL}`,
                  )
                }
                const initial = snapshot(80)
                lastRunning = initial.revision
                lastHistory = initial.historyRevision
                writeEvent('snapshot', initial)
                const timer = setInterval(() => {
                  if (closed || res.destroyed || res.writableEnded) return
                  // 历史只在真的新增/收尾时重发；输出更新只发正在跑的那几条。
                  if (historyRevision !== lastHistory) {
                    const data = snapshot(80)
                    lastRunning = data.revision
                    lastHistory = data.historyRevision
                    writeEvent('snapshot', data)
                    return
                  }
                  if (runningRevision !== lastRunning) {
                    lastRunning = runningRevision
                    writeEvent('running', {
                      checkedAt: new Date().toISOString(),
                      revision: runningRevision,
                      running: runningList(),
                    })
                  }
                }, 250)
                timers.push(timer)
                return
              }

              // ── v2：带 key 时只订阅这一条会话，事件拆成 agents / sessions / turns / live ──
              const key = String(u.searchParams.get('key') || '')
              const hand = key.includes('/')
                ? key.slice(0, key.indexOf('/'))
                : String(u.searchParams.get('hand') || '')
              const validHand = Object.hasOwn(HANDS, hand)
              // key 可能在建连时还不存在；sessions 先按合法 hand 推，后续 revision 变化再重查 key。
              let known =
                !!key &&
                validHand &&
                sessionsForHand(hand).sessions.some((row) => row.key === key || row.sessionKey === key)

              // id: 只在有 revision 的事件上写；live 没有 revision，沿用上一个 id。
              const writeV2 = (event, data, revision) => {
                const idLine = Number.isFinite(revision) ? `id: ${revision}${NL}` : ''
                writeRaw(idLine + `event: ${event}${NL}` + `data: ${JSON.stringify(data)}${NL}${NL}`)
              }

              let lastAgentsRev = -1
              let lastSessionsRev = -1
              let lastTurnsRev = -1
              let agentsFingerprint = ''
              let sessionsFingerprint = ''
              let turnsFingerprint = ''
              const sentLengths = new Map()
              const sentBlocks = new Map() // id -> 分块签名，变了才推
              const settled = new Set()
              let historyTargetId = ''

              const sendAgents = (force = false) => {
                const revision = agentsRevision
                lastAgentsRev = revision
                const payload = agentsPayload()
                const fingerprint = JSON.stringify(payload.agents)
                if (!force && fingerprint === agentsFingerprint) return
                agentsFingerprint = fingerprint
                writeV2('agents', { revision, agents: payload.agents }, revision)
              }

              const sendSessions = (force = false) => {
                if (!validHand) return
                const revision = sessionsRevisionOf(hand)
                lastSessionsRev = revision
                const payload = sessionsForHand(hand)
                // running 行的 ms 每次都会变，不能因此 250ms 推一次；状态/轮次变化才推。
                const fingerprint = JSON.stringify(payload.sessions.map((row) => row.running ? { ...row, ms: 0 } : row))
                if (!force && fingerprint === sessionsFingerprint) return
                sessionsFingerprint = fingerprint
                writeV2('sessions', { revision, hand, sessions: payload.sessions }, revision)
              }

              const sendTurns = (force = false) => {
                if (!known) return
                const revision = turnsRevisionOf(key)
                lastTurnsRev = revision
                const panel = panelDispatchState()
                const turns = turnsFor(panel.jobs, panel.running, key, { limit: 50 })
                // running 行的 ms 是实时值；指纹里归一，避免每 250ms 重复发同一状态。
                const fingerprint = JSON.stringify(turns.map((turn) => turn.running ? { ...turn, ms: 0 } : turn))
                if (!force && fingerprint === turnsFingerprint) return
                turnsFingerprint = fingerprint
                // 有新轮次/收尾了，live 要重新挑一次目标
                historyTargetId = ''
                writeV2('turns', { revision, key, turns }, revision)
              }

              // live 只跟这一条 key：在跑的那一轮优先，没有就最近一轮。
              // 历史轮读一次全文发完就 settle，别每 250ms 重复读盘。
              const liveTarget = () => {
                const panel = panelDispatchState()
                let best = null
                for (const entry of panel.running) {
                  if (!turnMatches(entry, key)) continue
                  if (!best || String(entry.startedAt || '') > String(best.startedAt || '')) best = entry
                }
                if (best) {
                  historyTargetId = ''
                  return { id: String(best.id || ''), running: true, entry: best }
                }
                const job = panel.jobs.find((item) => turnMatches(item, key))
                if (!job) return null
                historyTargetId = String(job.id || '')
                return { id: historyTargetId, running: false, entry: job }
              }

              const sendLive = () => {
                // 已经发完的历史轮不用再读盘；除非又有新的一轮在跑
                if (historyTargetId && settled.has(historyTargetId)) {
                  let anyRunning = false
                  for (const entry of panelDispatchState().running) {
                    if (turnMatches(entry, key)) {
                      anyRunning = true
                      break
                    }
                  }
                  if (!anyRunning) return
                }
                const target = liveTarget()
                if (!target || !target.id) return
                const id = target.id
                if (!target.running && settled.has(id)) return
                const text = target.running ? String(target.entry.output || '') : readJobText(target.entry)
                const totalLength = Number(target.entry.outputLength) || text.length
                const delta = computeLiveDeltaByLength(text, sentLengths.get(id) || 0, totalLength)
                // 语义分块：只在真的变了才带；老客户端看到多余字段会忽略。
                // 分块变了但正文没变（比如只多了一条工具记录）也要推一帧。
                const rawBlocks = Array.isArray(target.entry.blocks) ? target.entry.blocks : []
                const blocksSig = blocksSignature(rawBlocks)
                const blocksChanged = sentBlocks.get(id) !== blocksSig
                if (!delta.changed && !blocksChanged) {
                  if (!target.running) settled.add(id)
                  return
                }
                sentLengths.set(id, delta.next)
                if (blocksChanged) sentBlocks.set(id, blocksSig)
                const outputAt = target.running
                  ? Number(target.entry.outputAt) || Date.now()
                  : Date.parse(target.entry.at || target.entry.startedAt) || Date.now()
                writeV2('live', {
                  key,
                  id,
                  delta: delta.changed ? delta.delta : '',
                  from: delta.from ?? delta.next - delta.delta.length,
                  next: delta.next,
                  outputAt,
                  idleMs: Math.max(0, Date.now() - outputAt),
                  ...(blocksChanged && rawBlocks.length ? { blocks: rawBlocks } : {}),
                })
                if (!target.running && delta.next >= totalLength) settled.add(id)
              }

              sendAgents(true)
              if (validHand) sendSessions(true)
              if (known) {
                sendTurns(true)
                sendLive()
              }

              const timer = setInterval(() => {
                if (closed || res.destroyed || res.writableEnded) return
                if (agentsRevision !== lastAgentsRev) sendAgents()
                if (!validHand) return
                if (!known) {
                  known = sessionsForHand(hand).sessions.some((row) => row.key === key || row.sessionKey === key)
                  if (known) {
                    sendSessions(true)
                    sendTurns(true)
                    sendLive()
                    return
                  }
                }
                // 恢复任务可能由重启前的旧进程直接写 end（新进程的 revision 不会 bump）；
                // 每轮都算指纹，变化才发，保证侧栏行与 turn 的 RUNNING → OK/INTERRUPTED 及时更新。
                sendSessions()
                if (!known) return
                sendTurns()
                sendLive()
              }, 250)
              timers.push(timer)
              return
            }
            if (u.pathname === '/dsh-hands/ping') {
              return send(200, { ok: true, plugin: 'dsh-hands' })
            }

            // ── v2 只读聚合接口（第 1 步）：上面的旧 /log /job /ping /stream 一律不动 ──
            // 新接口失败统一回 {ok:false,error} + 合适状态码，不能把宿主弄崩。
            const fail = (status, error) =>
              send(status, { ok: false, error: String(error?.message ?? error) })

            if (u.pathname === '/dsh-hands/agents') {
              try {
                const { checkedAt, agents } = agentsPayload()
                return send(200, { checkedAt, agents })
              } catch (e) {
                return fail(500, e)
              }
            }

            // /health：四家并行探，30s 缓存，并发共享同一次探测；失败也回 200。
            if (u.pathname === '/dsh-hands/health') {
              try {
                return send(200, await healthCache())
              } catch (e) {
                return send(200, {
                  checkedAt: new Date().toISOString(),
                  agents: {},
                  error: String(e?.message ?? e),
                })
              }
            }

            if (u.pathname === '/dsh-hands/sessions') {
              try {
                return send(200, sessionsForHand(String(u.searchParams.get('hand') || ''), { archived: u.searchParams.get('archived') === '1' }))
              } catch (e) {
                return fail(500, e)
              }
            }

            if (u.pathname === '/dsh-hands/turns') {
              try {
                const key = String(u.searchParams.get('key') || '')
                if (!key) return fail(400, 'key is required')
                const before = String(u.searchParams.get('before') || '')
                const limit = String(u.searchParams.get('limit') || '50')
                const panel = panelDispatchState()
                const turns = turnsFor(panel.jobs, panel.running, key, { before, limit })
                return send(200, { key, turns })
              } catch (e) {
                return fail(500, e)
              }
            }

            if (u.pathname === '/dsh-hands/turn') {
              try {
                const id = String(u.searchParams.get('id') || '')
                const entry = id ? fullEntry(id) : null
                if (!entry) return fail(404, 'not found')
                // 带 from 只回正文增量；next / eof 一律服务端算好，前端别自己拼。
                // id 校验和 jobFile 的路径穿越都沿用 fullEntry / readJobText。
                if (u.searchParams.has('from')) {
                  const rawFrom = Number(u.searchParams.get('from'))
                  const requestedFrom = Number.isFinite(rawFrom) ? Math.max(0, Math.trunc(rawFrom)) : 0
                  const text = readJobText(entry)
                  const totalLength = Number(entry.outputLength) || text.length
                  const delta = computeLiveDeltaByLength(text, requestedFrom, totalLength)
                  const from = delta.from
                  // 第一页或游标已落进滑窗时带语义分块；entry.blocks 优先。
                  const hasNativeBlocks = Array.isArray(entry.blocks) && entry.blocks.length
                  const blocks = hasNativeBlocks
                    ? entry.blocks
                    : from <= Math.max(0, totalLength - text.length)
                      ? deriveBlocksFromText(text)
                      : undefined
                  const blocksDerived = !hasNativeBlocks && !!blocks
                  return send(200, {
                    id,
                    from,
                    next: delta.next,
                    eof: delta.next >= totalLength,
                    delta,
                    ...(blocks ? { blocks, blocksDerived } : {}),
                  })
                }
                return send(200, { turn: entry })
              } catch (e) {
                return fail(500, e)
              }
            }

            if (u.pathname === '/dsh-hands/archive-session') {
              if (req.method !== 'POST') return fail(405, 'POST only')
              try {
                const body = parseBody(await readBody(req))
                const key = String(body.key || '').trim()
                if (!key) return fail(400, 'key is required')
                const archived = body.archived !== false
                const keys = readArchive()
                const next = archived ? [...keys.filter((k) => k !== key), key] : keys.filter((k) => k !== key)
                writeArchive(next)
                const hand = String(body.hand || '')
                if (hand) handRevisions.set(hand, (handRevisions.get(hand) || 0) + 1)
                return send(200, { ok: true, key, archived, count: next.length })
              } catch (error) {
                return fail(400, String(error?.message ?? error))
              }
            }
            if (u.pathname === '/dsh-hands/cancel') {
              if (req.method !== 'POST') return fail(405, 'POST only')
              try {
                const body = parseBody(await readBody(req))
                const id = String(body.id || '')
                if (!id) return fail(400, 'id is required')
                const proc = RUNNING_PROCS.get(id)
                if (!proc || proc.run?.finished) {
                  // 排队中、还没起进程的任务：从队列里摘掉，promise 以 cancelled 收尾，
                  // 由 settleCancelledQueuedJob 写 CANCELLED 回传。
                  if (sessionQueue.cancel(id) || asyncQueue.cancel(id)) {
                    return send(200, { ok: true, id, cancelled: 'queued', killed: false })
                  }
                  // ACP 或已出队但还没有子进程句柄：标记取消，让 perform 收尾时如实报 CANCELLED。
                  const job = ASYNC_JOBS.get(id)
                  const run = RUNNING.get(id)
                  if ((job && !job.endedAt) || (run && !run.finished)) {
                    if (job) job.cancelled = true
                    if (run && !run.finished) {
                      run.cancelled = true
                      finishDispatch(run, {
                        status: 'CANCELLED',
                        ok: false,
                        ms: Number.isFinite(run.startedMs) ? Date.now() - run.startedMs : undefined,
                        error: 'cancelled',
                        excerpt: 'cancelled',
                      })
                    }
                    return send(200, { ok: true, id, cancelled: 'running', killed: false })
                  }
                  // 幂等：跑完的、取消过的、不存在的 id 都按「没在跑」回，别谎报成功
                  return send(404, {
                    ok: false,
                    error: 'not running',
                    id,
                    hint: 'already finished or unknown id',
                  })
                }
                const pid = proc.child?.pid
                // 先收尾再杀：工具那条 await 回来时会看到 run.finished，不会写出第二条 end
                if (proc.run) {
                  proc.run.cancelled = true
                  finishDispatch(proc.run, {
                    status: 'CANCELLED',
                    ok: false,
                    ms: Number.isFinite(proc.startedAt) ? Date.now() - proc.startedAt : undefined,
                    error: 'cancelled',
                    excerpt: 'cancelled',
                  })
                }
                RUNNING_PROCS.delete(id)
                // 只杀自己起的 pid 的进程树；taskkill /T /F 因为 CLI 常留孙进程。
                const treeKilled = pid ? await killProcessTree(pid) : false
                return send(200, { ok: true, id, killed: !!pid, pid: pid || null, treeKilled })
              } catch (e) {
                return fail(500, e)
              }
            }

            if (u.pathname === '/dsh-hands/rerun') {
              if (req.method !== 'POST') return fail(405, 'POST only')
              try {
                const body = parseBody(await readBody(req))
                const id = String(body.id || '')
                if (!id) return fail(400, 'id is required')
                const job = mergedJobs().find((item) => String(item.id || '') === id)
                if (!job) return fail(404, 'not found')
                const prompt =
                  body.prompt === undefined || body.prompt === null
                    ? String(job.prompt || '')
                    : String(body.prompt)
                if (!prompt.trim()) return fail(400, 'prompt is required')
                // 只起进程、不 await：HTTP 先回新 id，活跑后台
                const run = rerunInBackground(job, prompt)
                if (!run) return fail(400, `unknown hand: ${job.hand || ''}`)
                return send(200, {
                  ok: true,
                  id: run.id,
                  hand: String(job.hand || ''),
                  sessionKey: run.entry.sessionKey,
                })
              } catch (e) {
                return fail(500, e)
              }
            }

            return send(404, { error: 'unknown path' })
          } catch (e) {
            return send(500, { error: String(e?.message ?? e) })
          }
        },
      }),
    'dsh-hands: dispatch log api',
  )

  ctx.tools.register({
    name: 'agy_run',
    description:
      'Run one non-interactive turn of agy (the Antigravity CLI agent) on this machine and return its final answer. ' +
      'agy is a separate coding agent: it can read and write files in the working directory, run shell commands, and generate images. ' +
      'Use it to delegate heavy multi-file work, whole-project review, or code generation, then verify its claims yourself. ' +
      'Pass conversationId (or continueLast) to keep talking in the same agy conversation.',
    parameters: {
      type: 'object',
      properties: {
        prompt: {
          type: 'string',
          description: 'What agy should do. Write it as a complete brief: goal, constraints, and what to report back.',
        },
        cwd: {
          type: 'string',
          description: 'Working directory agy operates in. Omit to inherit the current session directory.',
        },
        conversationId: {
          type: 'string',
          description: 'Resume a previous agy conversation by id (returned by an earlier agy_run call).',
        },
        session: {
          type: 'string',
          description:
            'A stable name for this line of work, e.g. "fatal-lock 修 bug". The plugin keeps a name -> conversationId ' +
            'index, so the same name always resumes the same agy conversation; the first call with a new name starts one. ' +
            'Prefer this over raw conversationId for anything you will come back to.',
        },
        continueLast: {
          type: 'boolean',
          description: 'Continue the most recent agy conversation instead of starting a new one.',
        },
        model: { type: 'string', description: 'Model id for this run, e.g. "claude-sonnet-4.6". Omit for the default.' },
        provider: {
          type: 'string',
          description:
            'Third-party agy provider name from ~/.dsh/hands-providers.json (e.g. "znbcode"). ' +
            'Omit or pass "official" for the default model.',
        },
        effort: {
          type: 'string',
          enum: ['low', 'medium', 'high', 'xhigh', 'max'],
          description: 'Reasoning effort. Higher is slower and more thorough.',
        },
        mode: {
          type: 'string',
          enum: ['accept-edits', 'auto', 'plan'],
          description: 'Execution mode: accept-edits writes files, auto also runs commands, plan only plans.',
        },
        agent: { type: 'string', description: 'Agent preset name, from agy_agents.' },
        addDirs: {
          type: 'array',
          items: { type: 'string' },
          description: 'Extra directories to add to the workspace.',
        },
        async: {
          type: 'boolean',
          description:
            'true = 派完立刻返回 jobId；同一目标会话已有任务在跑时返回 QUEUED 和排队位置，跑完把结果投回本会话；默认 false 阻塞到它跑完。',
        },
        timeoutSec: {
          type: 'number',
          description: 'Hard timeout in seconds. The process tree is killed when it expires.',
        },
      },
      required: ['prompt'],
      additionalProperties: false,
    },
    output: {
      schema: {
        type: 'object',
        properties: {
          status: { type: 'string' },
          response: { type: 'string' },
          jobId: { type: 'string' },
          sessionId: { type: 'string' },
          note: { type: 'string' },
          queued: { type: 'boolean' },
          queuePosition: { type: 'number' },
          queueLimit: { type: 'number' },
          queue: { type: 'object' },
        },
      },
      render: (_args, value) => asText(value),
    },
    async execute(args, exec) {
      const prompt = String(args?.prompt ?? '')
      if (!prompt.trim()) throw new Error('prompt is required')
      // 第三方供应商：缺 key 等问题在跑活前抛清晰错误，别等跑完才报
      const providerCtx = agyProviderContext(args?.provider)
      const runCwd = resolveRunCwd(args, exec)
      const label = typeof args?.session === 'string' ? args.session.trim() : ''
      // 入队前完成守卫/票据核销；真正的会话 id 在 perform 里重读最新索引。
      const plannedSession = resolveSession(
        loadIndex(), label, runCwd, args, 'agy', sessionIdFromExec(exec), readArchive(),
      )
      const ticketExpiresAt = plannedSession.ticketExpiresAt

      // runId：异步派活时由外层预分配，保证 jobId 和日志 id 是同一个
      const perform = async (runId = '') => {
      const argv = ['-p', prompt, '--output-format', 'stream-json']

      // 三种定位会话的方式，优先级：conversationId > session 名字 > continueLast
      const index = loadIndex()
      // 统一走守卫：agy_run 以前自己查 index、没走 resolveSession，同目录守卫在它身上失效了
      const resume = resolveSession(
        index, label, runCwd, args, 'agy', sessionIdFromExec(exec), readArchive(),
        { ticketApproved: Number.isFinite(ticketExpiresAt), consumeTicket: false },
      )
      assertSessionTicketWindow(ticketExpiresAt)
      const resumeId = resume.id || (args?.conversationId ? String(args.conversationId) : '')
      if (resumeId) argv.push('--conversation', resumeId)
      else if (args?.continueLast) argv.push('--continue')
      if (args?.model) argv.push('--model', String(args.model))
      if (args?.effort) argv.push('--effort', String(args.effort))
      if (args?.mode) argv.push('--mode', String(args.mode))
      if (args?.agent) argv.push('--agent', String(args.agent))
      for (const dir of Array.isArray(args?.addDirs) ? args.addDirs : []) {
        if (dir) argv.push('--add-dir', String(dir))
      }
      if (skipPermissions) argv.push('--dangerously-skip-permissions')
      // 第三方供应商：传 --settings 指到独立 settings.json（官方路径不传，不变）
      if (providerCtx.settingsFile) argv.push('--settings', providerCtx.settingsFile)

      // 异步任务默认不限时：跑长活被 15 分钟砍掉过一次（fatal-lock），
      // 要限时就在调用时显式传 timeoutSec。
      const timeoutSec =
        args?.async === true ? Number(args?.timeoutSec) || 0 : Number(args?.timeoutSec) || defaultTimeout
      const run = startDispatch({
        id: runId || undefined,
        hand: 'agy',
        tool: 'agy_run',
        prompt,
        write: skipPermissions,
        session: label,
        conversationId: resumeId,
        cwd: runCwd,
        model: args?.model || '',
      })
      const result = await runProcess(bin, argv, {
        cwd: runCwd,
        timeoutSec,
        env: providerCtx.env,
        onChunk: run.push,
        onSpawn: (child) => trackProc(run.id, child, run),
      })
      result.cancelled = !!run.cancelled
      const parsed = collectAgy(result.stdout)
      const verdict = outcome(
        result,
        parsed?.status ?? (result.code === 0 ? (parsed ? 'SUCCESS' : 'UNPARSED') : 'ERROR'),
      )
      finishDispatch(run, {
        status: verdict.status,
        ok: verdict.ok,
        ms: result.ms,
        exitCode: result.code,
        excerpt: String(parsed?.response ?? result.stdout ?? ''),
        error: result.cancelled ? 'cancelled' : result.timedOut ? 'timeout' : result.code === 0 ? '' : String(result.stderr || ''),
        conversationId: parsed?.conversation_id || resumeId,
        tokens: parsed?.usage,
      })

      if (!parsed) {
        return {
          status: verdict.status,
          response: String(run.entry.output || result.stdout || '').slice(0, 20000),
          stderr: String(result.stderr ?? '').slice(0, 4000),
          exitCode: result.code,
          cancelled: !!result.cancelled,
          elapsedSec: Number((result.ms / 1000).toFixed(1)),
        }
      }

      const out = {
        status: verdict.status,
        response: String(parsed.response ?? ''),
        conversationId: parsed.conversation_id,
        numTurns: parsed.num_turns,
        usage: parsed.usage,
        durationSec: parsed.duration_seconds,
        exitCode: result.code,
      }
      // 丢掉 undefined：工具返回值必须是无损 JSON
      for (const key of Object.keys(out)) {
        if (out[key] === undefined) delete out[key]
      }
      const err = String(result.stderr ?? '').trim()
      if (err) out.stderr = err.slice(0, 2000)

      // 接不上旧会话时给个明确提示，别让人以为是自己写错了
      if (resumeId && !verdict.ok && !result.cancelled && !String(out.response ?? '').trim()) {
        out.hint = `会话 ${resumeId} 可能已被删除或失效：去掉 session / conversationId 再跑一次就会新开一个。`
      }

      // 记名字索引：下次用同一个 session 就能接上这次
      if (label && out.conversationId) {
        const idx = loadIndex()
        idx[label] = {
          id: String(out.conversationId),
          cwd: runCwd,
          updated: new Date().toISOString(),
        }
        saveIndex(idx)
        out.session = label
      }
      // /cancel 杀掉进程后只会得到一个失败码；回传要如实写 CANCELLED
      if (run.cancelled) {
        out.status = 'CANCELLED'
        out.cancelled = true
      }
      return out
      }

      // 异步：立刻返回 jobId，跑完把结果投回调用方会话
      if (args?.async === true) {
        // perform 还没跑，先预分配 id，日志里的 run id 和 jobId 保持一致
        const jobId = crypto.randomUUID()
        const job = {
          id: jobId,
          dispatchId: jobId,
          hand: 'agy',
          tool: 'agy_run',
          sessionId: sessionIdFromExec(exec),
          session: String(args?.session || '').trim(),
          conversationId: plannedSession.id || String(args?.conversationId || ''),
          sessionKey: sessionKeyOf('agy', args?.session, Date.now(), plannedSession.id || args?.conversationId || jobId),
          cwd: runCwd,
          model: String(args?.model || ''),
          prompt,
          startedAt: Date.now(),
          delivery: 'pending',
        }
        const placement = startAsyncJob(ctx, job, () => perform(jobId), (value) => ({
          status: value.status,
          ms: (Number(value.durationSec) || 0) * 1000,
          exitCode: value.exitCode,
          excerpt: value.response,
          cost: null,
          error: value.status === 'SUCCESS' || value.status === 'OK' || value.status === 'CANCELLED' ? '' : String(value.response || '').slice(0, 400),
          jobFile: path.join(JOBS_DIR, `${job.id}.txt`),
        }))
        return clean({
          status: placement.status,
          jobId: job.id,
          hand: 'agy',
          sessionId: job.sessionId,
          queued: placement.status === 'QUEUED',
          queuePosition: placement.queuePosition,
          queueLimit: placement.queueLimit,
          note: asyncDispatchNote(placement.status, placement.queuePosition),
          queue: { ...asyncQueueStats(), session: sessionQueue.stats() },
        })
      }

      return perform()
    },
  })

  ctx.tools.register({
    name: 'agy_session',
    description:
      'Manage one agy conversation. action "info" shows it; "label" attaches a name to an existing conversationId; ' +
      '"rename" moves a saved name to a new one; "delete" removes it (the session db, its brain workspace and its ' +
      'annotations move into the agy trash folder, so it is reversible until purge:true). ' +
      'Identify the session by `conversationId` or by a saved `session` name.',
    parameters: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['info', 'label', 'rename', 'delete'] },
        conversationId: { type: 'string', description: 'Exact conversation id.' },
        session: { type: 'string', description: 'Saved name of the conversation.' },
        newLabel: { type: 'string', description: 'For "label" and "rename": the name to attach.' },
        purge: {
          type: 'boolean',
          description: 'With "delete": also permanently remove the trash copy. Default false (reversible).',
        },
      },
      required: ['action'],
      additionalProperties: false,
    },
    output: {
      schema: { type: 'object', properties: { ok: { type: 'boolean' }, action: { type: 'string' } } },
      render: (_args, value) => asText(value),
    },
    async execute(args) {
      const action = String(args?.action ?? '')
      const index = loadIndex()
      const label = String(args?.session ?? '').trim()
      const id = String(args?.conversationId ?? (label && index[label]?.id ? index[label].id : '')).trim()
      if (!id) throw new Error('pass conversationId or a session name that is already in the index')

      const rows = listKnownSessions()
      const row = rows.find((r) => r.conversationId === id) ?? { conversationId: id }

      if (action === 'info') {
        return { ok: true, action, session: rows.find((r) => r.conversationId === id) ?? { conversationId: id } }
      }

      if (action === 'label') {
        const name = String(args?.newLabel ?? '').trim()
        if (!name) throw new Error('newLabel is required for action "label"')
        index[name] = { id, cwd: index[label]?.cwd ?? null, updated: new Date().toISOString() }
        if (label && label !== name) delete index[label]
        saveIndex(index)
        return { ok: true, action, conversationId: id, session: name }
      }

      if (action === 'rename') {
        const name = String(args?.newLabel ?? '').trim()
        if (!label) throw new Error('session (the old name) is required for action "rename"')
        if (!name) throw new Error('newLabel is required for action "rename"')
        index[name] = { ...index[label], id, updated: new Date().toISOString() }
        delete index[label]
        saveIndex(index)
        return { ok: true, action, conversationId: id, from: label, to: name }
      }

      if (action === 'delete') {
        if (!isSafeAgyConversationId(id)) {
          throw new Error('conversationId contains unsafe path characters')
        }
        const paths = sessionPaths(id)
        const moved = []
        for (const [kind, source] of Object.entries(paths)) {
          const target = moveIntoTrash(source, id, kind)
          if (target) moved.push({ kind, from: source, to: target })
        }

        // 抹掉 agy 自己的元数据缓存里这一条
        const meta = readJson(META_FILE, null)
        if (meta?.conversations && meta.conversations[id]) {
          delete meta.conversations[id]
          writeJson(META_FILE, meta)
        }
        // 抹掉「每个目录上次用哪个会话」里指向它的映射
        const last = readJson(LAST_FILE, null)
        if (last && typeof last === 'object') {
          let dirty = false
          for (const [cwd, cid] of Object.entries(last)) {
            if (cid === id) {
              delete last[cwd]
              dirty = true
            }
          }
          if (dirty) writeJson(LAST_FILE, last)
        }
        // 抹掉我自己的名字索引
        let droppedLabels = []
        for (const [name, entry] of Object.entries(index)) {
          if (entry?.id === id) {
            delete index[name]
            droppedLabels.push(name)
          }
        }
        saveIndex(index)

        let purged = false
        if (args?.purge) {
          try {
            fs.rmSync(path.join(trashDir(), id), { recursive: true, force: true })
            purged = true
          } catch {
            purged = false
          }
        }

        return clean({
          ok: true,
          action,
          conversationId: id,
          title: row.title || undefined,
          movedFiles: moved.length,
          movedTo: moved.length ? path.join(trashDir(), id) : undefined,
          droppedLabels: droppedLabels.length ? droppedLabels : undefined,
          purged,
          note: purged ? 'trash copy removed as well' : 'reversible: files are in the agy trash folder',
        })
      }

      throw new Error(`unknown action: ${action}`)
    },
  })

  ctx.tools.register({
    name: 'agy_sessions',
    description:
      'List agy conversations known on this machine: conversation id, the label you saved it under, title, preview, ' +
      'when it last changed, and which workspace directories it was used in. Filter with `query` (matches title, ' +
      'preview, label or workspace path) to find the one a job belongs to before resuming it.',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Case-insensitive substring matched against label, title, preview and workspace path.',
        },
        limit: { type: 'number', description: 'How many rows to return, default 20.' },
      },
      additionalProperties: false,
    },
    output: {
      schema: { type: 'object', properties: { rows: { type: 'array' } } },
      render: (_args, value) => asText(value),
    },
    async execute(args) {
      const q = String(args?.query ?? '').toLowerCase().trim()
      const limit = Math.min(Math.max(Number(args?.limit) || 20, 1), 100)
      let rows = listKnownSessions()
      if (q) {
        rows = rows.filter((r) =>
          [r.label, r.title, r.preview, r.conversationId, ...(r.workspaces ?? []), r.lastCwd]
            .filter(Boolean)
            .some((field) => String(field).toLowerCase().includes(q)),
        )
      }
      return { total: rows.length, rows: rows.slice(0, limit) }
    },
  })

  ctx.tools.register({
    name: 'agy_agents',
    description: 'List the agents agy can run (their names are what agy_run takes as `agent`).',
    parameters: { type: 'object', properties: {}, additionalProperties: false },
    output: {
      schema: { type: 'object', properties: { text: { type: 'string' } } },
      render: (_args, value) => asText(value),
    },
    async execute() {
      const result = await runProcess(bin, ['agents'], { timeoutSec: 60 })
      return {
        status: result.code === 0 ? 'OK' : 'ERROR',
        text: String(result.stdout ?? '').slice(0, 8000) || String(result.stderr ?? '').slice(0, 2000),
      }
    },
  })

  ctx.tools.register({
    name: 'agy_models',
    description: 'List the models agy can run (their ids are what agy_run takes as `model`).',
    parameters: { type: 'object', properties: {}, additionalProperties: false },
    output: {
      schema: { type: 'object', properties: { text: { type: 'string' } } },
      render: (_args, value) => asText(value),
    },
    async execute() {
      const result = await runProcess(bin, ['models'], { timeoutSec: 60 })
      return {
        status: result.code === 0 ? 'OK' : 'ERROR',
        text: String(result.stdout ?? '').slice(0, 8000) || String(result.stderr ?? '').slice(0, 2000),
      }
    },
  })

  // ── codex（OpenAI Codex CLI）：写代码这个手下 ────────────────────────────

  // 会话索引：名字 -> { id, cwd, updated }，和 agy 那套一个思路
  const CODEX_INDEX = path.join(os.homedir(), '.dsh', 'codex-sessions.json')

  function loadCodexIndex() {
    return readJson(CODEX_INDEX, {}) || {}
  }

  // codex 会把 "session id: <uuid>" 打在输出开头，拿来续会话
  function pickSessionId(raw) {
    const m = String(raw || '').match(/session id:\s*([0-9a-fA-F-]{16,})/)
    return m ? m[1] : null
  }

  ctx.tools.register({
    name: 'codex_run',
    description:
      'Run one non-interactive turn of codex (the OpenAI Codex CLI) and return its final answer. ' +
      'codex is the coding hand: it reads and writes files in the working directory and runs shell commands. ' +
      'Use it for implementation work, refactors and test writing. Its output is not trustworthy by itself — ' +
      'rerun the tests yourself and check `git status` afterwards. ' +
      'Pass `session` (a stable name) to keep talking in the same codex conversation across calls.',
    parameters: {
      type: 'object',
      properties: {
        prompt: {
          type: 'string',
          description:
            'What codex should do. Write a complete brief: goal, exact interfaces, which files must not be touched, ' +
            'and how it should prove the work (e.g. "run node --test scripts/x.test.mjs").',
        },
        cwd: { type: 'string', description: 'Working directory. Omit to inherit the current session directory.' },
        session: {
          type: 'string',
          description:
            'A stable name for this line of work. The same name always resumes the same codex conversation; ' +
            'the first call with a new name starts one. Omit for a throwaway one-shot run.',
        },
        resumeLast: {
          type: 'boolean',
          description: 'Resume the most recent codex session instead of starting a new one.',
        },
        sandbox: {
          type: 'string',
          enum: ['read-only', 'workspace-write', 'danger-full-access'],
          description: 'Permission level. Default read-only; use workspace-write for implementation work.',
        },
        model: { type: 'string', description: 'Model id override, e.g. "gpt-6.1-sol". Omit to use ~/.codex/config.toml.' },
        async: {
          type: 'boolean',
          description:
            'true = 派完立刻返回 jobId；同一目标会话已有任务在跑时返回 QUEUED 和排队位置，跑完把结果投回本会话；默认 false 阻塞到它跑完。',
        },
        timeoutSec: { type: 'number', description: 'Hard timeout in seconds (default 900); async jobs default to unlimited.' },
        sessionMode: {
          type: 'string',
          enum: ['auto', 'resume', 'new'],
          description:
            "auto=有就续没有就建（默认）；resume=只续已有，不存在会报错；new=只新建，重名或近似名会报错（新建需票据：issue_new_session_ticket）。",
        },
        allowNewSession: {
          type: 'boolean',
          description:
            '已废弃：新建会话要用 issue_new_session_ticket 发票据；传了也不再放行。',
        },
      },
      required: ['prompt'],
      additionalProperties: false,
    },
    output: {
      schema: {
        type: 'object',
        properties: {
          status: { type: 'string' },
          response: { type: 'string' },
          sessionId: { type: 'string' },
          resumed: { type: 'boolean' },
          jobId: { type: 'string' },
          note: { type: 'string' },
          queued: { type: 'boolean' },
          queuePosition: { type: 'number' },
          queueLimit: { type: 'number' },
          queue: { type: 'object' },
        },
      },
      render: (_args, value) => asText(value),
    },
    async execute(args, exec) {
      const prompt = String(args?.prompt ?? '')
      if (!prompt.trim()) throw new Error('prompt is required')

      const name = args?.session ? String(args.session) : ''
      const workdir = resolveRunCwd(args, exec)
      const plannedSession = resolveSession(
        loadCodexIndex(), name, workdir, args, 'codex', sessionIdFromExec(exec), readArchive(),
      )
      const ticketExpiresAt = plannedSession.ticketExpiresAt

      // runId：异步派活时由外层预分配，保证 jobId 和日志 id 是同一个
      const perform = async (runId = '') => {
      const index = loadCodexIndex()
      const sandbox = String(args?.sandbox || 'read-only')
      const resume = resolveSession(
        index, name, workdir, args, 'codex', sessionIdFromExec(exec), readArchive(),
        { ticketApproved: Number.isFinite(ticketExpiresAt), consumeTicket: false },
      )
      assertSessionTicketWindow(ticketExpiresAt)
      const known = resume.id
      const sessionReset = resume.reset

      let argv
      let resumed = false
      // 注意：resume 会丢掉建会话时的沙箱，默认回到 read-only。
      // 必须每次用 -c sandbox_mode=... 显式带上，否则续会话就写不了文件。
      const sandboxArg = `sandbox_mode="${sandbox}"`
      if (known) {
        // 续同一个会话：codex exec resume <id> <prompt>
        argv = ['exec', 'resume', '--json', '--skip-git-repo-check', '-c', sandboxArg, known]
        if (args?.model) argv.push('-m', String(args.model))
        argv.push(prompt)
        resumed = true
      } else if (args?.resumeLast) {
        argv = ['exec', 'resume', '--json', '--skip-git-repo-check', '-c', sandboxArg, '--last']
        if (args?.model) argv.push('-m', String(args.model))
        argv.push(prompt)
        resumed = true
      } else {
        argv = ['exec', '--json', '--skip-git-repo-check', '-s', sandbox]
        if (args?.model) argv.push('-m', String(args.model))
        argv.push(prompt)
      }

      const run = startDispatch({
        id: runId || undefined,
        hand: 'codex',
        tool: 'codex_run',
        prompt,
        write: sandbox === 'workspace-write' || sandbox === 'danger-full-access',
        session: name,
        conversationId: known || '',
        cwd: workdir,
        model: args?.model || '',
      })
      const result = await runProcess(codexBin, argv, {
        cwd: workdir,
        timeoutSec: effTimeout(args),
        onChunk: run.push,
        onSpawn: (child) => trackProc(run.id, child, run),
      })
      result.cancelled = !!run.cancelled
      const raw = String(result.stdout ?? '')
      const err = String(result.stderr ?? '')
      const collected = collectCodex(raw)
      let answer = collected.answer
      // 极端情况下它没按 --json 输出（例如启动失败），退回旧的纯文本抠法。
      if (!collected.sawJson) {
        const cut = raw.lastIndexOf('tokens used')
        if (cut >= 0) answer = raw.slice(cut).replace(/tokens used\s*\n\s*[\d,]+/i, '').trim()
        if (!answer) {
          const blocks = raw.split(/\n\s*\n/).map((x) => x.trim()).filter(Boolean)
          answer = blocks.length ? blocks[blocks.length - 1] : ''
        }
      }
      if (!answer) answer = String(run.entry.output || '').slice(-4000)
      const tokens = collected.tokens
      const sid = collected.sessionId || pickSessionId(raw) || pickSessionId(err) || (resumed ? known : null)

      if (name && sid) {
        recordSessionName('codex', name, sid, workdir)
        updateSessionIndex(CODEX_INDEX, name, { id: sid, cwd: workdir, updated: new Date().toISOString() })
      }

      const verdict = outcome(result, collected.failed ? 'ERROR' : undefined)
      finishDispatch(run, {
        status: verdict.status,
        ok: verdict.ok,
        ms: result.ms,
        exitCode: result.code,
        excerpt: answer || err.slice(-1200) || raw.slice(-1200),
        error: result.cancelled ? 'cancelled' : result.timedOut ? 'timeout' : result.code === 0 ? '' : err,
        conversationId: sid,
        tokens,
      })

      return clean({
        // /cancel 杀掉进程后只会得到一个失败码；回传要如实写 CANCELLED
        status: verdict.status,
        response: answer || err.slice(-4000) || raw.slice(-4000),
        sessionId: sid || '',
        resumed,
        cancelled: !!run.cancelled,
        exitCode: result.code,
        tokens: tokens ?? null,
        ms: result.ms,
      })
      }

      // 异步：立刻返回 jobId，跑完把结果投回调用方会话
      if (args?.async === true) {
        // perform 还没跑，先预分配 id，日志里的 run id 和 jobId 保持一致
        const jobId = crypto.randomUUID()
        const job = {
          id: jobId,
          dispatchId: jobId,
          hand: 'codex',
          tool: 'codex_run',
          sessionId: sessionIdFromExec(exec),
          session: String(args?.session || '').trim(),
          conversationId: plannedSession.id || String(args?.conversationId || ''),
          sessionKey: sessionKeyOf('codex', args?.session, Date.now(), plannedSession.id || args?.conversationId || jobId),
          cwd: workdir,
          model: String(args?.model || ''),
          prompt,
          startedAt: Date.now(),
          delivery: 'pending',
        }
        const placement = startAsyncJob(ctx, job, () => perform(jobId), (value) => ({
          status: value.status,
          ms: value.ms,
          exitCode: value.exitCode,
          excerpt: value.response,
          cost: null,
          error: value.status === 'OK' || value.status === 'CANCELLED' ? '' : String(value.response || '').slice(0, 400),
          jobFile: path.join(JOBS_DIR, `${job.id}.txt`),
        }))
        return clean({
          status: placement.status,
          jobId: job.id,
          hand: 'codex',
          sessionId: job.sessionId,
          queued: placement.status === 'QUEUED',
          queuePosition: placement.queuePosition,
          queueLimit: placement.queueLimit,
          note: asyncDispatchNote(placement.status, placement.queuePosition),
          queue: { ...asyncQueueStats(), session: sessionQueue.stats() },
        })
      }

      return perform()
    },
  })

  ctx.tools.register({
    name: 'hands_status',
    description:
      'Report whether the four hands are usable right now: agy (copywriting), codex (planning), claude (architecture) ' +
      'and opencode (coding). Returns each binary path, version line, and a quick runnability probe.',
    parameters: { type: 'object', properties: {}, additionalProperties: false },
    output: {
      schema: { type: 'object', properties: { text: { type: 'string' } } },
      render: (_args, value) => asText(value),
    },
    async execute() {
      const probe = async (label, exe, args) => {
        if (!fs.existsSync(exe) && !exe.includes(path.sep)) {
          return `${label}: ${exe}（在 PATH 里，跳过存在性检查）`
        }
        if (!fs.existsSync(exe)) return `${label}: 找不到 ${exe}`
        const r = await runProcess(exe, args, { timeoutSec: 60 })
        const line = String(r.stdout || r.stderr || '').split('\n').find((x) => x.trim()) || ''
        return `${label}: ${line.trim().slice(0, 80)}`
      }
      const lines = [
        await probe('agy      文案', bin, ['--version']),
        await probe('codex    规划', codexBin, ['--version']),
        await probe('claude   架构', claudeBin, ['--version']),
        await probe('opencode 写码', opencodeBin, ['--version']),
      ]
      lines.push('四个默认都只读；要改文件必须在调用时显式要（write: true / sandbox / auto）')
      return { text: lines.join(String.fromCharCode(10)) }
    },
  })

  // ── hands_wait：等一个异步任务结束（可选超时）────────────────────────────
  // 异步派活适合「派完就干别的」；但有时就是要等这一个结果再往下走。
  // 这里轮询落盘状态（跟 settleAsyncJob 同一份 asyncState），不阻塞事件循环。
  ctx.tools.register({
    name: 'hands_wait',
    description:
      'Wait for an async hand job (dispatched with async:true) to finish, then return its final status and short report. ' +
      'Use it only when you truly need this one result before continuing; otherwise keep working and the report ' +
      'will be delivered back to the session automatically.',
    parameters: {
      type: 'object',
      properties: {
        jobId: { type: 'string', description: 'The jobId returned by an async:true dispatch.' },
        timeoutMs: {
          type: 'number',
          description: 'Max wait in milliseconds (default 600000, max 1800000). On timeout returns finished:false.',
        },
      },
      required: ['jobId'],
      additionalProperties: false,
    },
    output: {
      schema: {
        type: 'object',
        properties: {
          jobId: { type: 'string' },
          hand: { type: 'string' },
          status: { type: 'string' },
          finished: { type: 'boolean' },
          timedOut: { type: 'boolean' },
          waitedMs: { type: 'number' },
          // DSH 的 JsonSchema 校验不接受 type 数组，这里只用单类型；
          // 缺失值在 execute 里归一成 0 / 空串。
          ms: { type: 'number' },
          delivery: { type: 'string' },
          deliveryError: { type: 'string' },
          excerpt: { type: 'string' },
          queuePosition: { type: 'number' },
          queueLimit: { type: 'number' },
          queue: { type: 'object' },
        },
        required: ['jobId', 'status', 'finished', 'timedOut', 'waitedMs'],
      },
      render: (_args, value) => asText(value),
    },
    async execute(args) {
      const id = String(args?.jobId ?? '').trim()
      if (!id) throw new Error('jobId is required')
      const timeoutMs = Math.max(1000, Math.min(1_800_000, Number(args?.timeoutMs) || 600_000))
      const started = Date.now()
      let record = asyncState.jobs?.[id]
      if (!record) throw new Error(`没有这个 job：${id}`)
      while (!record.endedAt && Date.now() - started < timeoutMs) {
        await new Promise((resolve) => setTimeout(resolve, 500))
        record = asyncState.jobs?.[id] || record
      }
      const finished = !!record.endedAt
      return clean({
        jobId: id,
        hand: String(record.hand || ''),
        status: finished ? String(record.status || 'UNKNOWN') : String(record.status || 'RUNNING').toUpperCase() === 'QUEUED' ? 'QUEUED' : 'RUNNING',
        finished,
        timedOut: !finished,
        waitedMs: Date.now() - started,
        ms: Number(record.ms) || 0,
        queuePosition: Number(record.queuePosition) || 0,
        queueLimit: Number(record.queueLimit) || 0,
        delivery: String(record.delivery || ''),
        deliveryError: String(record.deliveryError || ''),
        excerpt: String(record.report || '').slice(0, 4000),
        queue: asyncQueueStats(),
      })
    },
  })

  // ── claude（Claude Code CLI）：架构规划这个手下 ───────────────────────────

  const CLAUDE_INDEX = path.join(os.homedir(), '.dsh', 'claude-sessions.json')

  ctx.tools.register({
    name: 'claude_run',
    description:
      'Run one non-interactive turn of Claude Code (the `claude` CLI) and return its answer. ' +
      'Use it for architecture-level planning and design review: it reads the repo and reasons about structure. ' +
      'Pass `session` (a stable name) to keep talking in the same conversation. ' +
      'Its claims are not verified — check anything it asserts about the code before acting on it.',
    parameters: {
      type: 'object',
      properties: {
        prompt: { type: 'string', description: 'The complete brief: goal, what to read, what to report.' },
        cwd: { type: 'string', description: 'Working directory. Omit to inherit the current session directory.' },
        session: {
          type: 'string',
          description:
            'A stable name for this line of work. The same name resumes the same conversation; ' +
            'the first call with a new name starts one. Omit for a throwaway run.',
        },
        model: { type: 'string', description: 'Model id override, e.g. "claude-opus-4-6". Omit to use ~/.claude/settings.json.' },
        permissionMode: {
          type: 'string',
          enum: ['plan', 'acceptEdits', 'auto'],
          description: 'plan = read-only reasoning (default); acceptEdits lets it edit files; auto also runs commands.',
        },
        async: {
          type: 'boolean',
          description:
            'true = 派完立刻返回 jobId；同一目标会话已有任务在跑时返回 QUEUED 和排队位置，跑完把结果投回本会话；默认 false 阻塞到它跑完。',
        },
        timeoutSec: { type: 'number', description: 'Hard timeout in seconds (default 900); async jobs default to unlimited.' },
        sessionMode: {
          type: 'string',
          enum: ['auto', 'resume', 'new'],
          description:
            "auto=有就续没有就建（默认）；resume=只续已有，不存在会报错；new=只新建，重名或近似名会报错（新建需票据：issue_new_session_ticket）。",
        },
        allowNewSession: {
          type: 'boolean',
          description:
            '已废弃：新建会话要用 issue_new_session_ticket 发票据；传了也不再放行。',
        },
      },
      required: ['prompt'],
      additionalProperties: false,
    },
    output: {
      schema: {
        type: 'object',
        properties: {
          status: { type: 'string' },
          response: { type: 'string' },
          sessionId: { type: 'string' },
          resumed: { type: 'boolean' },
          jobId: { type: 'string' },
          note: { type: 'string' },
          queued: { type: 'boolean' },
          queuePosition: { type: 'number' },
          queueLimit: { type: 'number' },
          queue: { type: 'object' },
        },
      },
      render: (_args, value) => asText(value),
    },
    async execute(args, exec) {
      const prompt = String(args?.prompt ?? '')
      if (!prompt.trim()) throw new Error('prompt is required')

      const index = readJson(CLAUDE_INDEX, {}) || {}
      const name = args?.session ? String(args.session) : ''
      const runCwd = resolveRunCwd(args, exec)
      const plannedSession = resolveSession(index, name, runCwd, args, 'claude', sessionIdFromExec(exec), readArchive())
      const ticketExpiresAt = plannedSession.ticketExpiresAt
      let known = ''
      let sessionReset = false

      const dispatchFields = {
        hand: 'claude',
        tool: 'claude_run',
        prompt,
        write: args?.permissionMode === 'acceptEdits' || args?.permissionMode === 'auto',
        session: name,
        cwd: runCwd,
        model: args?.model || '',
      }
      let run = null
      let forcedDispatchId = ''

      // 收尾：解析 + 落记录。同步和异步两条路共用，行为必须一致。
      const settle = (result) => {
        result.cancelled = !!run.cancelled
        const raw = String(result.stdout ?? '')
        const err = String(result.stderr ?? '')
        const parsed = collectClaude(raw)

        const sid = parsed?.session_id || known || ''
        if (name && sid) {
          recordSessionName('claude', name, sid, runCwd)
          updateSessionIndex(CLAUDE_INDEX, name, { id: sid, cwd: runCwd, updated: new Date().toISOString() })
        }

        const usage = parsed?.usage || {}
        const answer = parsed
          ? String(parsed.result ?? '')
          : String(run.entry.output || '').slice(-4000) || err.slice(-4000) || raw.slice(-4000)
        const verdict = outcome(result, parsed?.is_error ? 'ERROR' : undefined)
        finishDispatch(run, {
          status: verdict.status,
          ok: verdict.ok,
          ms: result.ms,
          exitCode: result.code,
          excerpt: answer || err.slice(-1200) || raw.slice(-1200),
          error: result.cancelled ? 'cancelled' : result.timedOut ? 'timeout' : result.code === 0 ? '' : err,
          conversationId: sid,
          tokens: usage,
          cost: parsed?.total_cost_usd,
        })
        return clean({
          status: verdict.status,
          response: answer,
          sessionId: sid,
          resumed: !!known,
          ...(sessionReset ? { sessionReset: true } : {}),
          cost: parsed?.total_cost_usd ?? null,
          cacheRead: usage.cache_read_input_tokens ?? null,
          exitCode: result.code,
          ms: result.ms,
        })
      }

      const spawn = (argv) =>
        runProcess(claudeBin, argv, {
          cwd: resolveRunCwd(args, exec),
          timeoutSec: effTimeout(args),
          onChunk: run.push,
          onSpawn: (child) => trackProc(run.id, child, run),
        })

      const perform = async () => {
        const latest = readJson(CLAUDE_INDEX, {}) || {}
        const resume = resolveSession(
          latest, name, runCwd, args, 'claude', sessionIdFromExec(exec), readArchive(),
          { ticketApproved: Number.isFinite(ticketExpiresAt), consumeTicket: false },
        )
        assertSessionTicketWindow(ticketExpiresAt)
        known = resume.id || ''
        sessionReset = resume.reset
        const argv = [
          '-p',
          prompt,
          '--output-format',
          'stream-json',
          '--verbose',
          '--include-partial-messages',
        ]
        if (args?.model) argv.push('--model', String(args.model))
        if (args?.permissionMode) argv.push('--permission-mode', String(args.permissionMode))
        if (known) argv.push('--resume', known)
        run = startDispatch({ ...dispatchFields, conversationId: known, id: forcedDispatchId || undefined })
        return settle(await spawn(argv))
      }

      // 异步：立刻返回 jobId，跑完把结果投回调用方会话
      if (args?.async === true) {
        const jobId = crypto.randomUUID()
        forcedDispatchId = jobId
        const job = {
          id: jobId,
          dispatchId: jobId,
          hand: 'claude',
          tool: 'claude_run',
          sessionId: sessionIdFromExec(exec),
          session: name,
          conversationId: plannedSession.id || '',
          sessionKey: sessionKeyOf('claude', name, Date.now(), plannedSession.id || jobId),
          cwd: runCwd,
          model: String(args?.model || ''),
          prompt,
          startedAt: Date.now(),
          delivery: 'pending',
        }
        const placement = startAsyncJob(ctx, job, perform, (value) => ({
          status: run.cancelled ? 'CANCELLED' : value.status,
          ms: value.ms,
          exitCode: value.exitCode,
          excerpt: value.response,
          cost: value.cost,
          error: run.cancelled || value.status === 'OK' ? '' : String(value.response || '').slice(0, 400),
          jobFile: path.join(JOBS_DIR, `${job.id}.txt`),
        }))
        return clean({
          status: placement.status,
          jobId: job.id,
          hand: 'claude',
          sessionId: job.sessionId,
          queued: placement.status === 'QUEUED',
          queuePosition: placement.queuePosition,
          queueLimit: placement.queueLimit,
          note: asyncDispatchNote(placement.status, placement.queuePosition),
          queue: { ...asyncQueueStats(), session: sessionQueue.stats() },
        })
      }

      return perform()
    },
  })

  // ── opencode：主力写代码这个手下 ─────────────────────────────────────────

  const OPENCODE_INDEX = path.join(os.homedir(), '.dsh', 'opencode-sessions.json')

  ctx.tools.register({
    name: 'opencode_run',
    description:
      'Run one non-interactive turn of opencode (the opencode CLI agent) and return its answer. ' +
      'This is the main coding hand: it reads and writes files and runs commands in the working directory. ' +
      'Pass `session` (a stable name) to keep talking in the same session. ' +
      'Its output is not trustworthy by itself — rerun the tests yourself and check `git status` afterwards.',
    parameters: {
      type: 'object',
      properties: {
        prompt: {
          type: 'string',
          description:
            'What opencode should do. A complete brief: goal, exact interfaces, files that must not be touched, ' +
            'and how it should prove the work.',
        },
        cwd: { type: 'string', description: 'Working directory. Omit to inherit the current session directory.' },
        session: {
          type: 'string',
          description:
            'A stable name for this line of work. The same name always resumes the same opencode session.',
        },
        model: { type: 'string', description: 'Model as provider/model[#variant], e.g. "deepseek/deepseek-chat".' },
        auto: {
          type: 'boolean',
          description: 'Auto-approve permissions that are not explicitly denied. Required for it to actually write files.',
        },
        async: {
          type: 'boolean',
          description:
            'true = 派完立刻返回 jobId；同一目标会话已有任务在跑时返回 QUEUED 和排队位置，跑完把结果投回本会话；默认 false 阻塞到它跑完。',
        },
        timeoutSec: { type: 'number', description: 'Hard timeout in seconds (default 900); async jobs default to unlimited.' },
        sessionMode: {
          type: 'string',
          enum: ['auto', 'resume', 'new'],
          description:
            "auto=有就续没有就建（默认）；resume=只续已有，不存在会报错；new=只新建，重名或近似名会报错（新建需票据：issue_new_session_ticket）。",
        },
        allowNewSession: {
          type: 'boolean',
          description:
            '已废弃：新建会话要用 issue_new_session_ticket 发票据；传了也不再放行。',
        },
      },
      required: ['prompt'],
      additionalProperties: false,
    },
    output: {
      schema: {
        type: 'object',
        properties: {
          status: { type: 'string' },
          response: { type: 'string' },
          sessionId: { type: 'string' },
          resumed: { type: 'boolean' },
          jobId: { type: 'string' },
          note: { type: 'string' },
          queued: { type: 'boolean' },
          queuePosition: { type: 'number' },
          queueLimit: { type: 'number' },
          queue: { type: 'object' },
        },
      },
      render: (_args, value) => asText(value),
    },
    async execute(args, exec) {
      const prompt = String(args?.prompt ?? '')
      if (!prompt.trim()) throw new Error('prompt is required')

      const index = readJson(OPENCODE_INDEX, {}) || {}
      const name = args?.session ? String(args.session) : ''
      const runCwd = resolveRunCwd(args, exec)
      const plannedSession = resolveSession(index, name, runCwd, args, 'opencode', sessionIdFromExec(exec), readArchive())
      const ticketExpiresAt = plannedSession.ticketExpiresAt
      let known = ''
      let sessionReset = false
      const model = args?.model ? String(args.model) : ''
      const timeoutSec = effTimeout(args)

      const dispatchFields = {
        hand: 'opencode',
        tool: 'opencode_run',
        prompt,
        write: !!args?.auto,
        session: name,
        cwd: runCwd,
        model,
      }
      let run = null
      let forcedDispatchId = ''

      const perform = async () => {
      const latest = readJson(OPENCODE_INDEX, {}) || {}
      const resume = resolveSession(
        latest, name, runCwd, args, 'opencode', sessionIdFromExec(exec), readArchive(),
        { ticketApproved: Number.isFinite(ticketExpiresAt), consumeTicket: false },
      )
      assertSessionTicketWindow(ticketExpiresAt)
      known = resume.id || ''
      sessionReset = resume.reset
      if (!run) run = startDispatch({ ...dispatchFields, conversationId: known, id: forcedDispatchId || undefined })
      // 开关命中就先走 ACP；拿不到结果（异常 / ok=false）runAcpTurn 已记日志并返回 null，
      // 下面的 CLI 分支就是那次回退，行为与以前完全一致。
      const acp = useAcp('opencode')
        ? await runAcpTurn('opencode', {
            run,
            prompt,
            cwd: runCwd,
            model,
            timeoutSec,
            sessionId: known || '',
            write: !!args?.auto,
          })
        : null

      let result = null
      let raw = ''
      let err = ''
      let sid = ''
      let answer = ''
      let verdict = null
      let tokens = null
      let cost = null
      let stopReason = ''

      if (acp) {
        sid = String(acp.sessionId || known || '')
        answer = String(acp.text || '').trim() || String(run.entry.output || '').slice(-3000)
        verdict = acpOutcome(acp, run.cancelled)
        const usage = acpUsageOf(acp.usage)
        tokens = usage.tokens
        cost = usage.cost
        stopReason = String(acp.stopReason || '')
      } else {
        const argv = ['run', '--format', 'json']
        if (model) argv.push('--model', model)
        if (known) argv.push('--session', known)
        if (args?.auto) argv.push('--auto')
        argv.push(prompt)
        result = await runProcess(opencodeBin, argv, {
          cwd: runCwd,
          timeoutSec,
          onChunk: run.push,
          onSpawn: (child) => trackProc(run.id, child, run),
        })
        result.cancelled = !!run.cancelled
        // opencode 出的是 JSONL 事件流
        raw = String(result.stdout ?? '')
        err = String(result.stderr ?? '')
        const collected = collectOpencode(raw)
        sid = collected.sessionId || known || ''
        answer =
          collected.answer ||
          String(run.entry.output || '').slice(-3000) ||
          err.slice(-3000) ||
          raw.slice(-3000)
        verdict = outcome(result)
        tokens = collected.tokens
        cost = collected.cost
      }

      if (run.cancelled) verdict = { status: 'CANCELLED', ok: false }
      if (name && sid) {
        recordSessionName('opencode', name, sid, runCwd)
        updateSessionIndex(OPENCODE_INDEX, name, { id: sid, cwd: runCwd, updated: new Date().toISOString() })
      }

      finishDispatch(run, {
        status: verdict.status,
        ok: verdict.ok,
        ms: acp ? acp.ms : result.ms,
        exitCode: acp ? undefined : result.code,
        excerpt: answer,
        error: run.cancelled
          ? 'cancelled'
          : acp
            ? String(acp.error || '')
            : result.timedOut
              ? 'timeout'
              : result.code === 0
                ? ''
                : err,
        conversationId: sid,
        tokens,
        cost,
        stopReason,
        runner: acp ? 'acp' : 'cli',
      })

      return clean({
        status: verdict.status,
        response: answer,
        sessionId: sid,
        resumed: acp ? !!acp.resumed : !!known,
        cost,
        tokens: tokens || null,
        exitCode: acp ? undefined : result.code,
        ms: acp ? acp.ms : result.ms,
      })
      }

      // 异步：立刻返回 jobId，跑完把结果投回调用方会话
      if (args?.async === true) {
        const jobId = crypto.randomUUID()
        forcedDispatchId = jobId
        const job = {
          id: jobId,
          dispatchId: jobId,
          hand: 'opencode',
          tool: 'opencode_run',
          sessionId: sessionIdFromExec(exec),
          session: name,
          conversationId: plannedSession.id || '',
          sessionKey: sessionKeyOf('opencode', name, Date.now(), plannedSession.id || jobId),
          cwd: runCwd,
          model,
          prompt,
          startedAt: Date.now(),
          delivery: 'pending',
        }
        const placement = startAsyncJob(ctx, job, perform, (value) => ({
          status: run.cancelled ? 'CANCELLED' : value.status,
          ms: value.ms,
          exitCode: value.exitCode,
          excerpt: value.response,
          cost: value.cost,
          error: run.cancelled || value.status === 'OK' ? '' : String(value.response || '').slice(0, 400),
          jobFile: path.join(JOBS_DIR, `${job.id}.txt`),
        }))
        return clean({
          status: placement.status,
          jobId: job.id,
          hand: 'opencode',
          sessionId: job.sessionId,
          queued: placement.status === 'QUEUED',
          queuePosition: placement.queuePosition,
          queueLimit: placement.queueLimit,
          note: asyncDispatchNote(placement.status, placement.queuePosition),
          queue: { ...asyncQueueStats(), session: sessionQueue.stats() },
        })
      }

      return perform()
    },
  })

  // ── 统一调度入口：一个工具管四个手下 ─────────────────────────────────────
  //
  // 为什么要有它：四个手下的参数不一样（agy 用 mode、codex 用 sandbox、
  // claude 用 permissionMode、opencode 用 auto），每次调用都要先想"这个手下
  // 那个字段叫什么"。所以再开一个入口，只管回答两件事：派给谁、要不要让它改文件。
  //
  // 下面四个 hands_* 的细节参数还在，需要精调时用那些。

  const HANDS = {
    agy: {
      label: 'agy（文案）',
      bin: () => bin,
      build: (prompt, opts, known) => {
        const argv = ['-p', prompt, '--output-format', 'stream-json']
        if (known) argv.push('--conversation', known)
        if (opts.write) argv.push('--dangerously-skip-permissions')
        if (opts.providerCtx?.settingsFile) argv.push('--settings', opts.providerCtx.settingsFile)
        return argv
      },
      index: () => path.join(os.homedir(), '.dsh', 'agy-sessions.json'),
      // stream-json 的 result/init 里带 conversation_id；老版本的缓存按 cwd 兜底
      pick: (raw, cwd) => {
        const collected = collectAgy(raw)
        if (collected?.conversation_id) return collected.conversation_id
        try {
          const f = path.join(os.homedir(), '.gemini', 'antigravity-cli', 'cache', 'last_conversations.json')
          const map = JSON.parse(fs.readFileSync(f, 'utf8'))
          return map[cwd] || null
        } catch {
          return null
        }
      },
    },
    codex: {
      label: 'codex（规划/评审）',
      bin: () => codexBin,
      build: (prompt, opts, known) => {
        const sb = opts.write ? 'workspace-write' : 'read-only'
        if (known) {
          const argv = ['exec', 'resume', '--json', '--skip-git-repo-check', '-c', `sandbox_mode="${sb}"`, known]
          argv.push(prompt)
          return argv
        }
        const argv = ['exec', '--json', '--skip-git-repo-check', '-s', sb]
        argv.push(prompt)
        return argv
      },
      index: () => path.join(os.homedir(), '.dsh', 'codex-sessions.json'),
      pick: (raw) =>
        collectCodex(raw).sessionId ||
        (String(raw).match(/session id:\s*([0-9a-f-]{16,})/) || [])[1] ||
        null,
    },
    claude: {
      label: 'claude（架构规划）',
      bin: () => claudeBin,
      build: (prompt, opts, known) => {
        const argv = ['-p', prompt, '--output-format', 'stream-json', '--verbose',
          '--include-partial-messages', '--permission-mode', opts.write ? 'acceptEdits' : 'plan']
        if (known) argv.push('--resume', known)
        return argv
      },
      index: () => path.join(os.homedir(), '.dsh', 'claude-sessions.json'),
      pick: (raw) => collectClaude(raw)?.session_id || null,
    },
    opencode: {
      label: 'opencode（写代码）',
      bin: () => opencodeBin,
      build: (prompt, opts, known) => {
        const argv = ['run', '--format', 'json']
        if (known) argv.push('--session', known)
        if (opts.write) argv.push('--auto')
        argv.push(prompt)
        return argv
      },
      index: () => path.join(os.homedir(), '.dsh', 'opencode-sessions.json'),
      pick: (raw) => collectOpencode(raw).sessionId || null,
    },
  }

  // 从各家五花八门的输出里抠出「答复正文」
  function extractAnswer(to, raw) {
    const text = String(raw || '')
    if (to === 'agy') {
      const answer = collectAgy(text)?.response
      if (answer) return String(answer)
    }
    if (to === 'claude') {
      const answer = collectClaude(text)?.result
      if (answer) return String(answer)
    }
    if (to === 'opencode') {
      const answer = collectOpencode(text).answer
      if (answer) return answer
    }
    if (to === 'codex') {
      const collected = collectCodex(text)
      if (collected.answer) return collected.answer
      const cut = text.lastIndexOf('tokens used')
      if (cut >= 0) {
        const tail = text.slice(cut).replace(/tokens used\s*\n\s*[\d,]+/i, '').trim()
        if (tail) return tail
      }
    }
    const blocks = text.split(/\n\s*\n/).map((x) => x.trim()).filter(Boolean)
    return blocks.length ? blocks[blocks.length - 1] : ''
  }

  function reportedStatus(to, raw) {
    if (to === 'agy') return collectAgy(String(raw || ''))?.status
    if (to === 'claude') return collectClaude(String(raw || ''))?.is_error ? 'ERROR' : undefined
    if (to === 'codex') return collectCodex(String(raw || '')).failed ? 'ERROR' : undefined
    return undefined
  }

  // 统一入口也把用量落进日志；这几个字段工具本来就解析过，只是以前没往外传。
  function usageOf(to, raw) {
    const text = String(raw || '')
    if (to === 'agy') return { tokens: collectAgy(text)?.usage }
    if (to === 'claude') {
      const parsed = collectClaude(text)
      return { tokens: parsed?.usage, cost: parsed?.total_cost_usd }
    }
    if (to === 'codex') return { tokens: collectCodex(text).tokens }
    if (to === 'opencode') {
      const parsed = collectOpencode(text)
      return { tokens: parsed.tokens, cost: parsed.cost }
    }
    return {}
  }

  // ── rerun：从一条历史记录重放 ─────────────────────────────────────────────
  //
  // prompt 默认沿用原记录，body.prompt 给了就替换；hand/session/cwd/write/model
  // 全照抄。argv 复用 HANDS[hand].build()（各 *_run 的细节参数没落日志，重建不了）。
  function withModel(handKey, argv, model) {
    const value = String(model || '')
    if (!value) return argv
    const flag = handKey === 'codex' ? '-m' : '--model'
    if (argv.includes(flag)) return argv
    // codex / opencode 的 prompt 固定在末尾，别把参数塞到它后面
    if (handKey === 'codex' || handKey === 'opencode') {
      return [...argv.slice(0, -1), flag, value, argv[argv.length - 1]]
    }
    return [...argv, flag, value]
  }

  function rerunInBackground(job, prompt) {
    const handKey = String(job?.hand || '')
    const handDef = HANDS[handKey]
    if (!handDef) return null

    const name = String(job.session || '')
    const runCwd = job.cwd ? path.resolve(String(job.cwd)) : process.cwd()
    let known = String(job.conversationId || '')
    if (!known && name) {
      const index = readJson(handDef.index(), {}) || {}
      // 走守卫：有 session 名就按 auto 语义续已有会话（同目录不匹配 → reset，开新的）
      const resume = resolveSession(index, name, runCwd, { sessionMode: 'auto' }, handKey, '', readArchive())
      if (resume.id) known = resume.id
    }
    const write = !!job.write
    const model = String(job.model || '')
    const argv = withModel(handKey, handDef.build(prompt, { write, model }, known || null), model)

    const run = startDispatch({
      hand: handKey,
      tool: String(job.tool || 'hands_run'),
      prompt,
      write,
      session: name,
      conversationId: known,
      cwd: runCwd,
      model,
    })

    // 后台跑：调用方已经拿到新 id，这里任何失败都只能落进日志，不能往外抛。
    void (async () => {
      let result
      try {
        result = await runProcess(handDef.bin(), argv, {
          cwd: runCwd,
          timeoutSec: defaultTimeout,
          onChunk: run.push,
          onSpawn: (child) => trackProc(run.id, child, run),
        })
      } catch (error) {
        result = { code: -1, stdout: '', stderr: String(error?.message ?? error), ms: 0, timedOut: false }
      }
      if (run.finished) return // 中途被 /cancel 收尾过了
      try {
        const raw = String(result.stdout ?? '')
        const err = String(result.stderr ?? '')
        const sid = handDef.pick(raw, runCwd) || handDef.pick(err, runCwd) || known || ''
        if (name && sid && sid !== known) {
          const index = readJson(handDef.index(), {}) || {}
          index[name] = { id: sid, cwd: job.cwd || '', updated: new Date().toISOString() }
          writeJson(handDef.index(), index)
        }
        const answer =
          extractAnswer(handKey, raw) ||
          String(run.entry.output || '').slice(-3000) ||
          err.slice(-3000) ||
          raw.slice(-3000)
        const verdict = outcome(result, reportedStatus(handKey, raw))
        const usage = usageOf(handKey, raw)
        finishDispatch(run, {
          status: verdict.status,
          ok: verdict.ok,
          ms: result.ms,
          exitCode: result.code,
          excerpt: answer,
          error: result.timedOut ? 'timeout' : result.code === 0 ? '' : err,
          conversationId: sid,
          tokens: usage.tokens,
          cost: usage.cost,
        })
      } catch (error) {
        finishDispatch(run, { status: 'ERROR', ok: false, error: String(error?.message ?? error) })
      }
    })()

    return run
  }

  // ── 新建会话票据工具：issue_new_session_ticket ────────────────────────────
  // 按 claude 评审的设计：同目录已有会话时，新建/换名建会话需要 ticket（resolveSession 在建会话前校验）。
  ctx.tools.register({
    name: 'issue_new_session_ticket',
    description:
      'Issue a one-time ticket that allows opening a NEW session in a directory where other sessions already exist ' +
      '(the same-directory guard: sessionMode "new" / "auto" creating a new session is rejected otherwise). ' +
      'The ticket binds the hand + directory + exact session name + the requesting session; valid 10 minutes, ' +
      'single-use. Same directory: at most one ticket per 10 minutes. Returns the ticket plus the directory\'s ' +
      'existing sessions (name / last active / running) — check that list before opening a new session.',
    parameters: {
      type: 'object',
      properties: {
        hand: { type: 'string', description: 'Hand name: opencode / codex / claude / agy. ("to" is accepted as an alias.)' },
        to: { type: 'string', description: 'Alias of hand (hands_run style).' },
        cwd: { type: 'string', description: 'Directory where the other sessions live. Omit to use this session directory.' },
        name: { type: 'string', description: 'The exact session name the new session should take.' },
        reason: { type: 'string', description: 'Why you need a new session (goes to the ledger).' },
      },
      required: ['name'],
      additionalProperties: false,
    },
    output: {
      schema: {
        type: 'object',
        properties: {
          ticket: { type: 'string' },
          hand: { type: 'string' },
          cwd: { type: 'string' },
          name: { type: 'string' },
          reason: { type: 'string' },
          sessions: {
            type: 'array',
            items: { type: 'object', properties: { name: { type: 'string' }, at: { type: 'string' }, running: { type: 'boolean' } } },
          },
          hint: { type: 'string' },
        },
      },
      render: (_args, value) => asText(value),
    },
    async execute(args, exec) {
      const hand = String(args?.hand || args?.to || '').trim()
      if (!HANDS[hand]) throw new Error(`to 只能是 ${Object.keys(HANDS).join(' / ')}`)
      const handDef = HANDS[hand]
      return issueSessionTicket(
        {
          ...args,
          hand,
          index: readJson(handDef.index(), {}) || {},
          archivedKeys: readArchive(),
          requesterSessionId: sessionIdFromExec(exec),
        },
        {},
      )
    },
  })

  ctx.tools.register({
    name: 'hands_run',
    description:
      'Dispatch one turn to any of the four hands by name. `to`: agy (copywriting) / codex (planning, review) / ' +
      'claude (architecture planning) / opencode (writing code). The only switch you need besides `to` and `prompt`: ' +
      '`write` — false (default) means read-only reasoning, true lets it modify files. ' +
      'Pass `session` to keep a name → conversation, exactly like the per-hand tools.',
    parameters: {
      type: 'object',
      properties: {
        to: { type: 'string', enum: ['agy', 'codex', 'claude', 'opencode'], description: 'Which hand.' },
        prompt: { type: 'string', description: 'The complete brief.' },
        cwd: { type: 'string', description: 'Working directory. Omit to inherit the current session directory.' },
        session: { type: 'string', description: 'Stable name for this line of work; the same name resumes the same conversation.' },
        write: { type: 'boolean', description: 'Allow file edits. Default false (read-only).' },
        model: { type: 'string', description: 'Model override where supported (codex / claude).' },
        provider: {
          type: 'string',
          description:
            'agy only: third-party provider name from ~/.dsh/hands-providers.json (e.g. "znbcode"). ' +
            'Other hands ignore it. Omit for the default model.',
        },
        async: {
          type: 'boolean',
          description:
            'true = 派完立刻返回 jobId；同一目标会话已有任务在跑时返回 QUEUED 和排队位置，跑完把结果投回本会话；默认 false 阻塞到它跑完。',
        },
        timeoutSec: { type: 'number', description: 'Hard timeout in seconds (default 900); async jobs default to unlimited.' },
        sessionMode: {
          type: 'string',
          enum: ['auto', 'resume', 'new'],
          description:
            "auto=有就续没有就建（默认）；resume=只续已有，不存在会报错；new=只新建，重名或近似名会报错（新建需票据：issue_new_session_ticket）。",
        },
        allowNewSession: {
          type: 'boolean',
          description:
            '已废弃：新建会话要用 issue_new_session_ticket 发票据；传了也不再放行。',
        },
      },
      required: ['to', 'prompt'],
      additionalProperties: false,
    },
    output: {
      schema: {
        type: 'object',
        properties: {
          status: { type: 'string' },
          hand: { type: 'string' },
          response: { type: 'string' },
          sessionId: { type: 'string' },
          resumed: { type: 'boolean' },
          jobId: { type: 'string' },
          note: { type: 'string' },
          queued: { type: 'boolean' },
          queuePosition: { type: 'number' },
          queueLimit: { type: 'number' },
          queue: { type: 'object' },
        },
      },
      render: (_args, value) => asText(value),
    },
    async execute(args, ctx) {
      const to = String(args?.to || '')
      const hand = HANDS[to]
      if (!hand) throw new Error(`to 只能是 ${Object.keys(HANDS).join(' / ')}`)
      const prompt = String(args?.prompt ?? '')
      if (!prompt.trim()) throw new Error('prompt is required')

      const idxFile = hand.index()
      const index = readJson(idxFile, {}) || {}
      const name = args?.session ? String(args.session) : ''
      const runCwd = resolveRunCwd(args, ctx)
      const plannedSession = resolveSession(index, name, runCwd, args, to, sessionIdFromExec(ctx), readArchive())
      const ticketExpiresAt = plannedSession.ticketExpiresAt
      let known = ''
      let sessionReset = false

      const opts = { write: !!args?.write, model: args?.model || '', provider: args?.provider || '' }
      // 第三方供应商：只对 agy 生效；缺 key 等问题在这里抛清晰错误，跑活前停下
      const providerCtx = to === 'agy' ? agyProviderContext(opts.provider) : null
      if (providerCtx) opts.providerCtx = providerCtx
      const timeoutSec = effTimeout(args)
      const dispatchFields = {
        hand: to,
        tool: 'hands_run',
        prompt,
        write: opts.write,
        session: name,
        cwd: runCwd,
        model: opts.model,
      }
      let run = null
      let forcedDispatchId = ''

      const perform = async () => {
      const latest = readJson(idxFile, {}) || {}
      const resume = resolveSession(
        latest, name, runCwd, args, to, sessionIdFromExec(ctx), readArchive(),
        { ticketApproved: Number.isFinite(ticketExpiresAt), consumeTicket: false },
      )
      assertSessionTicketWindow(ticketExpiresAt)
      known = resume.id || ''
      sessionReset = resume.reset
      if (!run) run = startDispatch({ ...dispatchFields, conversationId: known, id: forcedDispatchId || undefined })
      // config.acpHands 点名的手下先走 ACP；没命中 / 失败回退 CLI，argv 仍按老配方 build。
      const acp = useAcp(to)
        ? await runAcpTurn(to, {
            run,
            prompt,
            cwd: runCwd,
            model: opts.model,
            timeoutSec,
            sessionId: known || '',
            write: opts.write,
          })
        : null

      let result = null
      let raw = ''
      let err = ''
      let sid = ''
      let answer = ''
      let status = ''
      let verdict = null
      let tokens = null
      let cost = null
      let stopReason = ''

      if (acp) {
        sid = String(acp.sessionId || known || '')
        answer = String(acp.text || '').trim() || String(run.entry.output || '').slice(-3000)
        verdict = acpOutcome(acp, run.cancelled)
        status = verdict.status
        const usage = acpUsageOf(acp.usage)
        tokens = usage.tokens
        cost = usage.cost
        stopReason = String(acp.stopReason || '')
      } else {
        const argv = hand.build(prompt, opts, known)
        result = await runProcess(hand.bin(), argv, {
          cwd: runCwd,
          timeoutSec,
          env: providerCtx?.env,
          onChunk: run.push,
          onSpawn: (child) => trackProc(run.id, child, run),
        })
        result.cancelled = !!run.cancelled
        raw = String(result.stdout ?? '')
        err = String(result.stderr ?? '')
        sid = hand.pick(raw, runCwd) || hand.pick(err, runCwd) || known || ''
        answer =
          extractAnswer(to, raw) ||
          String(run.entry.output || '').slice(-3000) ||
          err.slice(-3000) ||
          raw.slice(-3000)
        verdict = outcome(result, reportedStatus(to, raw))
        status = verdict.status
        const usage = usageOf(to, raw)
        tokens = usage.tokens
        cost = usage.cost
      }

      if (run.cancelled) {
        verdict = { status: 'CANCELLED', ok: false }
        status = 'CANCELLED'
      }
      if (name && sid && sid !== known) {
        recordSessionName(to, name, sid, runCwd)
        updateSessionIndex(idxFile, name, { id: sid, cwd: runCwd, updated: new Date().toISOString() })
      }

      finishDispatch(run, {
        status: verdict.status,
        ok: verdict.ok,
        ms: acp ? acp.ms : result.ms,
        exitCode: acp ? undefined : result.code,
        excerpt: answer,
        error: run.cancelled
          ? 'cancelled'
          : acp
            ? String(acp.error || '')
            : result.timedOut
              ? 'timeout'
              : result.code === 0
                ? ''
                : err,
        conversationId: sid,
        tokens,
        cost,
        stopReason,
        runner: acp ? 'acp' : 'cli',
      })
      return clean({
        status,
        hand: hand.label,
        response: answer,
        sessionId: sid,
        resumed: acp ? !!acp.resumed : !!known,
        exitCode: acp ? undefined : result.code,
        ms: acp ? acp.ms : result.ms,
        tokens,
        cost,
      })
      }

      // 异步：立刻返回 jobId，跑完把结果投回调用方会话。
      // （async 这个参数之前只写在 schema 里、execute 里没有分支，2026-11-21 20:37 爸爸抓出来的。）
      if (args?.async === true && ctx) {
        const jobId = crypto.randomUUID()
        forcedDispatchId = jobId
        const job = {
          id: jobId,
          dispatchId: jobId,
          hand: to,
          tool: 'hands_run',
          // 投递要靠「调用方 DSH 会话 id」，不是手下自己的会话 id。
          sessionId:
            sessionIdFromExec(ctx) ||
            String(ctx?.session?.id || ctx?.sessionId || ctx?.agent?.session?.id || ''),
          session: name,
          conversationId: plannedSession.id || '',
          sessionKey: sessionKeyOf(to, name, Date.now(), plannedSession.id || jobId),
          cwd: runCwd,
          model: opts.model,
          prompt,
          startedAt: Date.now(),
          delivery: 'pending',
          debugCtx: (() => {
            try {
              if (!ctx) return null;
              const agent = ctx.agent || ctx.caller || ctx.agentRef || null;
              return {
                keys: Object.keys(ctx).slice(0, 30),
                agentKeys: agent ? Object.keys(agent).slice(0, 30) : null,
                sessionKeys: agent && agent.session ? Object.keys(agent.session).slice(0, 20) : null,
                sessionId: agent && agent.session ? (agent.session.id || agent.session.sessionId || '') : '',
              };
            } catch {
              return null;
            }
          })(),
        }
        const placement = startAsyncJob(ctx, job, perform, (value) => ({
          status: run.cancelled ? 'CANCELLED' : value.status,
          ms: Number(value.ms) || 0,
          exitCode: value.exitCode ?? null,
          excerpt: value.response,
          cost: value.cost ?? null,
          error:
            run.cancelled || value.status === 'OK' || value.status === 'SUCCESS' || value.status === 'CANCELLED'
              ? ''
              : String(value.response || '').slice(0, 400),
          jobFile: path.join(JOBS_DIR, `${job.id}.txt`),
        }))
        return clean({
          status: placement.status,
          jobId: job.id,
          hand: to,
          sessionId: job.sessionId,
          queued: placement.status === 'QUEUED',
          queuePosition: placement.queuePosition,
          queueLimit: placement.queueLimit,
          note: asyncDispatchNote(placement.status, placement.queuePosition),
          queue: { ...asyncQueueStats(), session: sessionQueue.stats() },
        })
      }

      return await perform()
    },
  })
}
