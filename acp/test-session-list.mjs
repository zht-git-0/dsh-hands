// 会话列表去重测试：node acp/test-session-list.mjs
// 复现「ai-game 开发」两行：取消轮没写 conversationId，先按 hand/name 建行；
// 索引随后带来真实 sid，又建了一行。upsertSessionIndexRow 应把别名行并进 sid 行。
import assert from 'node:assert/strict'
import { mergeSessionRows, upsertSessionIndexRow } from '../index.js'

function row(key, hand, name, extra = {}) {
  return {
    key,
    hand,
    name,
    sessionKey: `${hand}/${name}`,
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
    ...extra,
  }
}

// ── 1) 真实复现：日志别名行 + 索引 sid 行 → 合并成一行，轮次不丢 ──────────
{
  const rows = new Map()
  rows.set(
    'opencode/ai-game 开发',
    row('opencode/ai-game 开发', 'opencode', 'ai-game 开发', {
      turns: 1,
      today: 1,
      status: 'CANCELLED',
      startedAt: '2026-11-24T15:14:29.240Z',
      lastAt: '2026-11-24T15:22:16.344Z',
      cwd: 'D:/ai-game',
      notStarted: false,
    }),
  )
  const key = upsertSessionIndexRow(rows, 'opencode', 'ai-game 开发', {
    id: 'ses_df1e0944bffeoiKED45zkOIY0O',
    cwd: 'D:/ai-game',
    updated: '2026-11-24T15:22:17.020Z',
  })
  assert.equal(key, 'opencode/sid:ses_df1e0944bffeoiKED45zkOIY0O')
  assert.equal(rows.size, 1, '同名两行合并成一行')
  const merged = rows.get(key)
  assert.equal(merged.turns, 1, '日志轮次保留')
  assert.equal(merged.today, 1, '今日轮次保留')
  assert.equal(merged.status, 'CANCELLED', '最后状态保留')
  assert.equal(merged.notStarted, false, '不是 0 轮占位行')
  assert.equal(merged.conversationId, 'ses_df1e0944bffeoiKED45zkOIY0O')
  assert.equal(rows.has('opencode/ai-game 开发'), false, '别名行删掉')
  console.log('1) ai-game 别名行合并 ok')
}

// ── 2) 后续又有一轮没 sid 的日志 → 继续并进同一行，状态取最新 ────────────
{
  const rows = new Map()
  rows.set(
    'opencode/sid:s1',
    row('opencode/sid:s1', 'opencode', 'job', {
      conversationId: 's1',
      turns: 2,
      today: 1,
      status: 'OK',
      ok: true,
      startedAt: '2026-11-24T10:00:00.000Z',
      lastAt: '2026-11-24T10:05:00.000Z',
      cwd: 'D:/job',
      notStarted: false,
    }),
  )
  rows.set(
    'opencode/job',
    row('opencode/job', 'opencode', 'job', {
      turns: 1,
      today: 1,
      status: 'ERROR',
      startedAt: '2026-11-24T11:00:00.000Z',
      lastAt: '2026-11-24T11:05:00.000Z',
      cwd: 'D:/job',
      notStarted: false,
    }),
  )
  upsertSessionIndexRow(rows, 'opencode', 'job', { id: 's1', cwd: 'D:/job', updated: '2026-11-24T11:06:00.000Z' })
  assert.equal(rows.size, 1)
  const merged = rows.get('opencode/sid:s1')
  assert.equal(merged.turns, 3)
  assert.equal(merged.today, 2)
  assert.equal(merged.status, 'ERROR')
  assert.equal(merged.startedAt, '2026-11-24T10:00:00.000Z', '最早开始时间保留')
  console.log('2) 后续别名轮继续合并 ok')
}

// ── 3) 同名但不同 cwd 不误合并；mergeSessionRows 独立可测 ──────────────────
{
  const rows = new Map()
  rows.set('opencode/job', row('opencode/job', 'opencode', 'job', { turns: 1, cwd: 'D:/other', notStarted: false }))
  upsertSessionIndexRow(rows, 'opencode', 'job', { id: 's2', cwd: 'D:/target', updated: '2026-11-24T12:00:00.000Z' })
  assert.equal(rows.size, 2, '不同 cwd 的同名行不能串')
  assert.equal(rows.get('opencode/sid:s2').turns, 0)
  assert.equal(rows.get('opencode/job').turns, 1)

  const a = row('a', 'opencode', 'a', { turns: 1, lastAt: '2026-11-24T10:00:00.000Z' })
  const b = row('b', 'opencode', 'b', { turns: 2, lastAt: '2026-11-24T11:00:00.000Z', status: 'OK' })
  mergeSessionRows(a, b)
  assert.equal(a.turns, 3)
  assert.equal(a.status, 'OK')
  console.log('3) 不同 cwd 不误合并 ok')
}

console.log('session list ok')
