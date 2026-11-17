import { spawn } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { StringDecoder } from 'node:string_decoder'
import {
  collectAgy,
  collectClaude,
  collectCodex,
  collectOpencode,
  createLiveView,
} from './stream.js'

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

// 会话 key：hand/名字；没名字的归到当天的「临时-日期」。
function sessionKeyOf(hand, session, startedMs = Date.now()) {
  const name = String(session || '').trim()
  return `${hand}/${name || `临时-${localDateKey(startedMs)}`}`
}

// 一轮 = 一次派发。把历史 job（mergedJobs 的产物）和在跑的 RUNNING entry
// 摊平成面板要的头字段；纯函数、不碰闭包，acp/test-turns.mjs 直接 import。
// 注意：只挑字段，output / jobFile 一律不往外带（太占带宽）。
export function turnsFor(jobs, running, key, opts = {}) {
  const wanted = String(key || '')
  if (!wanted) return []
  const before = opts.before ? String(opts.before) : ''
  const limit = Math.min(Math.max(1, Number(opts.limit) || 50), 500)

  // key 的算法和 listSessions 保持一致：有名会话走 hand/sid:<conversationId>。
  const keyOf = (entry) => {
    const hand = String(entry?.hand || '')
    const startedMs = Date.parse(entry?.startedAt || entry?.at) || 0
    const sessionKey = String(entry?.sessionKey || sessionKeyOf(hand, entry?.session, startedMs))
    const conversationId = String(entry?.conversationId || '')
    return conversationId ? `${hand}/sid:${conversationId}` : sessionKey
  }
  const matches = (entry) => {
    const sessionKey = String(entry?.sessionKey || '')
    const conversationId = String(entry?.conversationId || '')
    return (
      keyOf(entry) === wanted ||
      (sessionKey && sessionKey === wanted) ||
      (conversationId && wanted.endsWith(`sid:${conversationId}`))
    )
  }

  const now = Date.now()
  const seen = new Set()
  const rows = []
  const source = [
    ...(Array.isArray(jobs) ? jobs : []).map((job) => [job, false]),
    ...(Array.isArray(running) ? running : []).map((item) => [item, true]),
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
    })
  }
  rows.sort((a, b) => String(b.startedAt).localeCompare(String(a.startedAt)))
  return rows.slice(0, limit)
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

// 跑一次 agy。不经过 shell，参数数组直接交给 spawn，中文和空格都不会被拆坏。
function runProcess(bin, args, { cwd, timeoutSec = 900, input, onChunk } = {}) {
  return new Promise((resolve) => {
    const started = Date.now()
    let child
    try {
      // stdin 必须显式给个已关闭的管道：codex 在非 TTY 下会等 stdin EOF，
      // 继承父进程的 stdin 会一直挂着（踩过，表现为「Reading additional input from stdin...」然后超时）
      // Windows 上 .cmd 不能直接 spawn（会报 ENOENT），必须走 shell；
      // 走 shell 时参数要自己加引号，否则带空格的 prompt 会被拆开。
      const needsShell = process.platform === 'win32' && /\.(cmd|bat)$/i.test(bin)
      const spawnArgs = needsShell
        ? args.map((a) => (/[\s"&|<>^]/.test(a) ? `"${String(a).replace(/"/g, '""')}"` : a))
        : args
      child = spawn(bin, spawnArgs, {
        cwd: cwd || undefined,
        windowsHide: true,
        env: process.env,
        stdio: ['pipe', 'pipe', 'pipe'],
        shell: needsShell,
      })
      if (input) child.stdin.end(input)
      else child.stdin.end()
    } catch (error) {
      resolve({ code: -1, stdout: '', stderr: String(error?.message ?? error), ms: 0, timedOut: false })
      return
    }
    let stdout = ''
    let stderr = ''
    let timedOut = false
    // 子进程的 chunk 可能从多字节字符中间切开；直接 toString('utf8') 会把中文变成 �??
    const outDecoder = new StringDecoder('utf8')
    const errDecoder = new StringDecoder('utf8')
    let decodersFlushed = false
    const flushDecoders = () => {
      if (decodersFlushed) return
      decodersFlushed = true
      const outTail = outDecoder.end()
      const errTail = errDecoder.end()
      if (outTail) {
        stdout += outTail
        try {
          onChunk?.(outTail, 'stdout')
        } catch {
          /* 实时视图失败不能影响手下干活 */
        }
      }
      if (errTail) {
        stderr += errTail
        try {
          onChunk?.(errTail, 'stderr')
        } catch {
          /* 同上 */
        }
      }
    }
    const timer = setTimeout(() => {
      timedOut = true
      try {
        if (process.platform === 'win32' && child.pid) {
          spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { windowsHide: true })
        } else {
          child.kill('SIGKILL')
        }
      } catch {
        /* 尽力而为 */
      }
    }, Math.max(5, timeoutSec) * 1000)

    child.stdout?.on('data', (chunk) => {
      const text = outDecoder.write(chunk)
      stdout += text
      try {
        onChunk?.(text, 'stdout')
      } catch {
        /* 实时视图失败不能影响手下干活 */
      }
    })
    child.stderr?.on('data', (chunk) => {
      const text = errDecoder.write(chunk)
      stderr += text
      try {
        onChunk?.(text, 'stderr')
      } catch {
        /* 同上 */
      }
    })
    child.on('error', (error) => {
      clearTimeout(timer)
      flushDecoders()
      resolve({ code: -1, stdout, stderr: `${stderr}${error?.message ?? error}`, ms: Date.now() - started, timedOut })
    })
    child.on('close', (code) => {
      clearTimeout(timer)
      flushDecoders()
      resolve({ code, stdout, stderr, ms: Date.now() - started, timedOut })
    })
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

export function apply(ctx, config = {}) {
  const bin = config.agyBin || config.bin || DEFAULT_BIN
  const codexBin = config.codexBin || DEFAULT_CODEX_BIN
  const claudeBin = config.claudeBin || DEFAULT_CLAUDE_BIN
  const opencodeBin = config.opencodeBin || DEFAULT_OPENCODE_BIN
  const defaultTimeout = Number(config.timeoutSec) || 900
  const skipPermissions = config.skipPermissions !== false

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
  // 启动时只有 start 没有 end 的活补成 INTERRUPTED（宿主重启把内存里的 RUNNING 丢了）。
  // 日志只留元信息 + excerpt + jobFile；完整输出按 id 写进 hands-jobs/<id>.txt。
  // 流式片段仍然只在内存里滚（createLiveView），不落盘。
  const LOG_FILE = path.join(os.homedir(), '.dsh', 'hands-log.jsonl')
  const JOBS_DIR = path.join(os.homedir(), '.dsh', 'hands-jobs')
  const LOG_KEEP = 1000
  const JOB_MAX_BYTES = 1024 * 1024
  const NL = String.fromCharCode(10)
  let runningRevision = 0
  let historyRevision = 0
  let today = { date: localDateKey(), byHand: Object.create(null), byKey: Object.create(null) }

  function touchRunning() {
    runningRevision += 1
  }

  function touchHistory() {
    historyRevision += 1
    runningRevision += 1
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

  // 把 start / end / 旧的单行记录合并成「一次派发」。旧日志没有 phase，原样兼容。
  function mergedJobs(records = readRecords()) {
    const starts = new Map()
    const jobs = new Map()
    for (const record of records) {
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

  function readJobs() {
    return mergedJobs().sort((a, b) =>
      String(b.at || b.startedAt || '').localeCompare(String(a.at || a.startedAt || '')),
    )
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

  // 宿主重启后的收尸：有 start、没 end 的记录一律补成 INTERRUPTED。
  function reconcileLog() {
    const records = readRecords()
    const starts = new Map()
    const ended = new Set()
    for (const record of records) {
      if (!record?.id) continue
      if (record.phase === 'start') starts.set(String(record.id), record)
      else if (record.phase === 'end') ended.add(String(record.id))
    }
    const now = Date.now()
    for (const [id, start] of starts) {
      if (ended.has(id)) continue
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
      const key = String(job.sessionKey || sessionKeyOf(hand, job.session, startedMs))
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

  function listSessions(handFilter = '') {
    ensureToday()
    const rows = new Map()
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
          notStarted: false,
        }
        rows.set(key, row)
      }
      return row
    }

    const absorb = (record, running) => {
      const hand = String(record.hand || '')
      if (handFilter && hand !== handFilter) return
      const startedMs = Date.parse(record.startedAt || record.at) || Date.now()
      const sessionKey = String(record.sessionKey || sessionKeyOf(hand, record.session, startedMs))
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
        if (record.session) row.name = String(record.session)
      }
    }

    for (const job of readJobs()) absorb(job, false)
    for (const entry of RUNNING.values()) absorb(entry, true)

    for (const [hand, file] of sessionIndexFiles()) {
      if (handFilter && hand !== handFilter) continue
      const index = readJson(file, {})
      if (!index || typeof index !== 'object') continue
      for (const [name, value] of Object.entries(index)) {
        const id = value && typeof value === 'object' ? String(value.id || '') : ''
        const key = id ? `${hand}/sid:${id}` : `${hand}/${name}`
        const row = rows.get(key)
        if (!row) {
          const created = ensureRow(key, hand)
          created.name = String(name)
          created.sessionKey = `${hand}/${name}`
          created.conversationId = id
          created.status = 'NOT_STARTED'
          created.notStarted = true
          created.lastAt = String(value?.updated || '')
          created.cwd = String(value?.cwd || '')
          continue
        }
        // 索引比最后一条派发新（通常是刚改过名字）时，以索引里的名字为准。
        const updated = String(value?.updated || '')
        if (updated && (!row.lastAt || updated > row.lastAt)) {
          row.name = String(name)
          row.sessionKey = `${hand}/${name}`
        }
        if (!row.conversationId && id) row.conversationId = id
        if (!row.cwd) row.cwd = String(value?.cwd || '')
      }
    }

    return [...rows.values()].sort((a, b) => String(b.lastAt || '').localeCompare(String(a.lastAt || '')))
  }

  // 历史记录不把整段输出塞进每次快照：默认只带摘录，点开某一行时再单独取。
  function stripOutput(entry) {
    if (!entry || typeof entry !== 'object') return entry
    const { output, ...rest } = entry
    if (!rest.excerpt && output) rest.excerpt = String(output).slice(-600)
    return rest
  }

  const RUNNING = new Map()
  let runSeq = 0

  function startDispatch(fields = {}) {
    const id = `${Date.now().toString(36)}-${(++runSeq).toString(36)}`
    const startedMs = Date.now()
    const startedAt = new Date(startedMs).toISOString()
    const session = String(fields.session || '')
    const sessionKey = sessionKeyOf(fields.hand, session, startedMs)
    const entry = {
      id,
      startedAt,
      hand: String(fields.hand || ''),
      tool: String(fields.tool || ''),
      prompt: String(fields.prompt || '').slice(0, 4000),
      write: !!fields.write,
      session,
      sessionKey,
      conversationId: String(fields.conversationId || ''),
      cwd: String(fields.cwd || ''),
      model: String(fields.model || ''),
      output: '',
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
    touchRunning()
    return {
      id,
      startedMs,
      entry,
      push(chunk, source) {
        live.feed(chunk, source)
        entry.output = live.render()
        entry.outputAt = Date.now()
        touchRunning()
      },
      flush() {
        live.flush()
        entry.output = live.render()
      },
    }
  }

  // 把一次派发收尾：从运行中移除，元信息进日志，全文进 hands-jobs。
  function finishDispatch(run, fields = {}) {
    if (!run) return
    run.flush?.()
    const output = String(run.entry.output || '')
    const endMs = Date.now()
    const startedMs = Number.isFinite(run.startedMs) ? run.startedMs : endMs
    const status = String(fields.status || (fields.ok ? 'OK' : 'ERROR')).toUpperCase()
    const jobFile = saveJobText(run.id, output)
    const sessionKey =
      run.entry.sessionKey || sessionKeyOf(run.entry.hand, run.entry.session, startedMs)
    RUNNING.delete(run.id)
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
        jobFile: jobFile || undefined,
        tokens: fields.tokens,
        cost: fields.cost,
        error: fields.error ? String(fields.error).slice(0, 1200) : undefined,
      }),
    )
    touchHistory()
  }

  function runningList() {
    const now = Date.now()
    return [...RUNNING.values()]
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

  function historyList(limit = 80) {
    const count = Math.max(1, Math.min(LOG_KEEP, Number(limit) || 80))
    return readJobs().slice(0, count).map(stripOutput)
  }

  function snapshot(limit = 80) {
    const now = Date.now()
    return {
      checkedAt: new Date(now).toISOString(),
      revision: runningRevision,
      historyRevision,
      running: runningList(),
      entries: historyList(limit),
    }
  }

  function fullEntry(id) {
    const live = RUNNING.get(id)
    if (live) {
      return clean({
        ...live,
        status: 'RUNNING',
        ok: false,
        ms: Math.max(0, Date.now() - Date.parse(live.startedAt)),
        output: String(live.output || '').slice(-20000),
      })
    }
    const entry = readJobs().find((job) => job.id === id)
    return entry ? clean({ ...entry, output: readJobText(entry) }) : null
  }

  // 各家 exit code / 自报状态不一致，统一折算成「成没成」。
  function outcome(result, reported) {
    if (result.timedOut) return { status: 'TIMEOUT', ok: false }
    let status = String(reported || (result.code === 0 ? 'OK' : 'ERROR')).toUpperCase()
    if (result.code !== 0 && !['ERROR', 'FAILED', 'UNPARSED'].includes(status)) status = 'ERROR'
    const failed = status === 'ERROR' || status === 'FAILED' || status === 'UNPARSED'
    return { status, ok: result.code === 0 && !failed }
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
              let lastRunning = -1
              let lastHistory = -1
              const writeEvent = (name, data) => {
                if (closed || res.destroyed || res.writableEnded) return
                try {
                  res.write(
                    `id: ${data.revision ?? 0}-${data.historyRevision ?? 0}${NL}` +
                      `event: ${name}${NL}` +
                      `data: ${JSON.stringify(data)}${NL}${NL}`,
                  )
                } catch {
                  closed = true
                }
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
              const ping = setInterval(() => {
                if (!closed && !res.destroyed && !res.writableEnded) {
                  try {
                    res.write(': ping' + NL + NL)
                  } catch {
                    closed = true
                  }
                }
              }, 15000)
              const cleanup = () => {
                closed = true
                clearInterval(timer)
                clearInterval(ping)
                try {
                  res.end()
                } catch {
                  /* 已经断了 */
                }
              }
              req.on('close', cleanup)
              res.on('close', cleanup)
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
                const checkedAt = new Date().toISOString()
                const runningByHand = Object.create(null)
                for (const entry of RUNNING.values()) {
                  const h = String(entry.hand || '')
                  runningByHand[h] = (runningByHand[h] || 0) + 1
                }
                const lastAtByHand = Object.create(null)
                for (const job of mergedJobs()) {
                  const h = String(job.hand || '')
                  const at = String(job.at || job.startedAt || '')
                  if (at && (!lastAtByHand[h] || at > lastAtByHand[h])) lastAtByHand[h] = at
                }
                const agents = Object.entries(HANDS).map(([hand, handDef]) =>
                  clean({
                    hand,
                    label: handDef.label,
                    running: runningByHand[hand] || 0,
                    today: todayCount(hand),
                    sessions: listSessions(hand).length,
                    lastAt: lastAtByHand[hand] || '',
                    // ok / version 第 3 步 health 再接；字段先留着，前端不用判空
                    ok: false,
                    bin: handDef.bin(),
                    version: '',
                  }),
                )
                return send(200, { checkedAt, agents })
              } catch (e) {
                return fail(500, e)
              }
            }

            if (u.pathname === '/dsh-hands/sessions') {
              try {
                const hand = String(u.searchParams.get('hand') || '')
                // 原样包一层 listSessions()，不动它已有的字段
                return send(200, { hand, sessions: listSessions(hand) })
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
                const turns = turnsFor(mergedJobs(), [...RUNNING.values()], key, { before, limit })
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
                  const from = Math.max(0, Number(u.searchParams.get('from')) || 0)
                  const text = readJobText(entry)
                  const delta = text.slice(from)
                  const next = from + delta.length
                  return send(200, { id, from, next, eof: next >= text.length, delta })
                }
                return send(200, { turn: entry })
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
        timeoutSec: {
          type: 'number',
          description: 'Hard timeout in seconds. The process tree is killed when it expires.',
        },
      },
      required: ['prompt'],
      additionalProperties: false,
    },
    output: {
      schema: { type: 'object', properties: { status: { type: 'string' }, response: { type: 'string' } } },
      render: (_args, value) => asText(value),
    },
    async execute(args) {
      const prompt = String(args?.prompt ?? '')
      if (!prompt.trim()) throw new Error('prompt is required')

      const argv = ['-p', prompt, '--output-format', 'stream-json']

      // 三种定位会话的方式，优先级：conversationId > session 名字 > continueLast
      const index = loadIndex()
      const label = typeof args?.session === 'string' ? args.session.trim() : ''
      const byLabel = label && index[label]?.id ? String(index[label].id) : ''
      const resumeId = args?.conversationId ? String(args.conversationId) : byLabel
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

      const timeoutSec = Number(args?.timeoutSec) || defaultTimeout
      const run = startDispatch({
        hand: 'agy',
        tool: 'agy_run',
        prompt,
        write: skipPermissions,
        session: label,
        conversationId: resumeId,
        cwd: args?.cwd || '',
        model: args?.model || '',
      })
      const result = await runProcess(bin, argv, { cwd: args?.cwd, timeoutSec, onChunk: run.push })
      const parsed = collectAgy(result.stdout)
      const verdict = outcome(result, parsed?.status ?? (result.code === 0 ? 'SUCCESS' : 'ERROR'))
      finishDispatch(run, {
        status: verdict.status,
        ok: verdict.ok,
        ms: result.ms,
        exitCode: result.code,
        excerpt: String(parsed?.response ?? result.stdout ?? ''),
        error: result.timedOut ? 'timeout' : result.code === 0 ? '' : String(result.stderr || ''),
        conversationId: parsed?.conversation_id || resumeId,
        tokens: parsed?.usage,
      })

      if (!parsed) {
        return {
          status: result.timedOut ? 'TIMEOUT' : result.code === 0 ? 'UNPARSED' : 'ERROR',
          response: String(run.entry.output || result.stdout || '').slice(0, 20000),
          stderr: String(result.stderr ?? '').slice(0, 4000),
          exitCode: result.code,
          elapsedSec: Number((result.ms / 1000).toFixed(1)),
        }
      }

      const out = {
        status: result.timedOut ? 'TIMEOUT' : (parsed.status ?? (result.code === 0 ? 'SUCCESS' : 'ERROR')),
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
      if (resumeId && out.status !== 'SUCCESS' && !String(out.response ?? '').trim()) {
        out.hint = `会话 ${resumeId} 可能已被删除或失效：去掉 session / conversationId 再跑一次就会新开一个。`
      }

      // 记名字索引：下次用同一个 session 就能接上这次
      if (label && out.conversationId) {
        const idx = loadIndex()
        idx[label] = {
          id: String(out.conversationId),
          cwd: args?.cwd ?? null,
          updated: new Date().toISOString(),
        }
        saveIndex(idx)
        out.session = label
      }
      return out
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

  function saveCodexIndex(index) {
    writeJson(CODEX_INDEX, index)
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
        timeoutSec: { type: 'number', description: 'Hard timeout in seconds (default 900).' },
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
        },
      },
      render: (_args, value) => asText(value),
    },
    async execute(args) {
      const prompt = String(args?.prompt ?? '')
      if (!prompt.trim()) throw new Error('prompt is required')

      const index = loadCodexIndex()
      const name = args?.session ? String(args.session) : ''
      const known = name && index[name] ? index[name].id : null

      const sandbox = String(args?.sandbox || 'read-only')
      const workdir = args?.cwd ? path.resolve(String(args.cwd)) : process.cwd()

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
        timeoutSec: Number(args?.timeoutSec) || defaultTimeout,
        onChunk: run.push,
      })
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
        index[name] = { id: sid, cwd: workdir, updated: new Date().toISOString() }
        saveCodexIndex(index)
      }

      const verdict = outcome(result, collected.failed ? 'ERROR' : undefined)
      finishDispatch(run, {
        status: verdict.status,
        ok: verdict.ok,
        ms: result.ms,
        exitCode: result.code,
        excerpt: answer || err.slice(-1200) || raw.slice(-1200),
        error: result.timedOut ? 'timeout' : result.code === 0 ? '' : err,
        conversationId: sid,
        tokens,
      })

      return clean({
        status: result.timedOut ? 'TIMEOUT' : collected.failed || result.code !== 0 ? 'ERROR' : 'OK',
        response: answer || err.slice(-4000) || raw.slice(-4000),
        sessionId: sid || '',
        resumed,
        exitCode: result.code,
        tokens: tokens ?? null,
        ms: result.ms,
      })
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
        timeoutSec: { type: 'number', description: 'Hard timeout in seconds (default 900).' },
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
        },
      },
      render: (_args, value) => asText(value),
    },
    async execute(args) {
      const prompt = String(args?.prompt ?? '')
      if (!prompt.trim()) throw new Error('prompt is required')

      const index = readJson(CLAUDE_INDEX, {}) || {}
      const name = args?.session ? String(args.session) : ''
      const known = name && index[name] ? index[name].id : null

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

      const run = startDispatch({
        hand: 'claude',
        tool: 'claude_run',
        prompt,
        write: args?.permissionMode === 'acceptEdits' || args?.permissionMode === 'auto',
        session: name,
        conversationId: known || '',
        cwd: args?.cwd ? path.resolve(String(args.cwd)) : process.cwd(),
        model: args?.model || '',
      })
      const result = await runProcess(claudeBin, argv, {
        cwd: args?.cwd ? path.resolve(String(args.cwd)) : process.cwd(),
        timeoutSec: Number(args?.timeoutSec) || defaultTimeout,
        onChunk: run.push,
      })

      const raw = String(result.stdout ?? '')
      const err = String(result.stderr ?? '')
      const parsed = collectClaude(raw)

      const sid = parsed?.session_id || known || ''
      if (name && sid) {
        index[name] = { id: sid, cwd: args?.cwd || '', updated: new Date().toISOString() }
        writeJson(CLAUDE_INDEX, index)
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
        error: result.timedOut ? 'timeout' : result.code === 0 ? '' : err,
        conversationId: sid,
        tokens: usage,
        cost: parsed?.total_cost_usd,
      })
      return clean({
        status: result.timedOut ? 'TIMEOUT' : result.code === 0 ? 'OK' : 'ERROR',
        response: answer,
        sessionId: sid,
        resumed: !!known,
        cost: parsed?.total_cost_usd ?? null,
        cacheRead: usage.cache_read_input_tokens ?? null,
        exitCode: result.code,
        ms: result.ms,
      })
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
        timeoutSec: { type: 'number', description: 'Hard timeout in seconds (default 900).' },
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
        },
      },
      render: (_args, value) => asText(value),
    },
    async execute(args) {
      const prompt = String(args?.prompt ?? '')
      if (!prompt.trim()) throw new Error('prompt is required')

      const index = readJson(OPENCODE_INDEX, {}) || {}
      const name = args?.session ? String(args.session) : ''
      const known = name && index[name] ? index[name].id : null

      const argv = ['run', '--format', 'json']
      if (args?.model) argv.push('--model', String(args.model))
      if (known) argv.push('--session', known)
      if (args?.auto) argv.push('--auto')
      argv.push(prompt)

      const run = startDispatch({
        hand: 'opencode',
        tool: 'opencode_run',
        prompt,
        write: !!args?.auto,
        session: name,
        conversationId: known || '',
        cwd: args?.cwd ? path.resolve(String(args.cwd)) : process.cwd(),
        model: args?.model || '',
      })
      const result = await runProcess(opencodeBin, argv, {
        cwd: args?.cwd ? path.resolve(String(args.cwd)) : process.cwd(),
        timeoutSec: Number(args?.timeoutSec) || defaultTimeout,
        onChunk: run.push,
      })

      // opencode 出的是 JSONL 事件流
      const raw = String(result.stdout ?? '')
      const err = String(result.stderr ?? '')
      const collected = collectOpencode(raw)
      const sid = collected.sessionId || known || ''

      if (name && sid) {
        index[name] = { id: sid, cwd: args?.cwd || '', updated: new Date().toISOString() }
        writeJson(OPENCODE_INDEX, index)
      }

      const answer =
        collected.answer ||
        String(run.entry.output || '').slice(-3000) ||
        err.slice(-3000) ||
        raw.slice(-3000)
      const verdict = outcome(result)
      finishDispatch(run, {
        status: verdict.status,
        ok: verdict.ok,
        ms: result.ms,
        exitCode: result.code,
        excerpt: answer,
        error: result.timedOut ? 'timeout' : result.code === 0 ? '' : err,
        conversationId: sid,
        tokens: collected.tokens,
        cost: collected.cost,
      })

      return clean({
        status: result.timedOut ? 'TIMEOUT' : result.code === 0 ? 'OK' : 'ERROR',
        response: answer,
        sessionId: sid,
        resumed: !!known,
        cost: collected.cost,
        tokens: collected.tokens || null,
        exitCode: result.code,
        ms: result.ms,
      })
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
        timeoutSec: { type: 'number', description: 'Hard timeout in seconds (default 900).' },
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
        },
      },
      render: (_args, value) => asText(value),
    },
    async execute(args) {
      const to = String(args?.to || '')
      const hand = HANDS[to]
      if (!hand) throw new Error(`to 只能是 ${Object.keys(HANDS).join(' / ')}`)
      const prompt = String(args?.prompt ?? '')
      if (!prompt.trim()) throw new Error('prompt is required')

      const idxFile = hand.index()
      const index = readJson(idxFile, {}) || {}
      const name = args?.session ? String(args.session) : ''
      const known = name && index[name] ? index[name].id : null

      const opts = { write: !!args?.write, model: args?.model || '' }
      const argv = hand.build(prompt, opts, known)
      const runCwd = args?.cwd ? path.resolve(String(args.cwd)) : process.cwd()
      const run = startDispatch({
        hand: to,
        tool: 'hands_run',
        prompt,
        write: opts.write,
        session: name,
        conversationId: known || '',
        cwd: runCwd,
        model: opts.model,
      })

      const result = await runProcess(hand.bin(), argv, {
        cwd: runCwd,
        timeoutSec: Number(args?.timeoutSec) || defaultTimeout,
        onChunk: run.push,
      })

      const raw = String(result.stdout ?? '')
      const err = String(result.stderr ?? '')
      const sid = hand.pick(raw, runCwd) || hand.pick(err, runCwd) || known || ''
      if (name && sid && sid !== known) {
        index[name] = { id: sid, cwd: args?.cwd || '', updated: new Date().toISOString() }
        writeJson(idxFile, index)
      }

      const answer =
        extractAnswer(to, raw) ||
        String(run.entry.output || '').slice(-3000) ||
        err.slice(-3000) ||
        raw.slice(-3000)
      const verdict = outcome(result, reportedStatus(to, raw))
      const usage = usageOf(to, raw)
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
      return clean({
        status: result.timedOut ? 'TIMEOUT' : result.code === 0 ? 'OK' : 'ERROR',
        hand: hand.label,
        response: answer,
        sessionId: sid,
        resumed: !!known,
        exitCode: result.code,
        ms: result.ms,
      })
    },
  })
}
