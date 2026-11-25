// 新建会话票据（ticket）测试：node acp/test-session-tickets.mjs
// 1) issueSessionTicket 返回 ticket + 该目录会话清单（名字/最后活跃/是否运行中）+ 提示「先看清单，能 resume 就别新开」
// 2) 正常发票→new 通过；auto 换名新建通过；票据只能核销一次
// 3) 无票被拒（new + 目录已有会话 → 拒，含清单 + 票据提示）
// 4) 过期被拒（validate with now=+TTL → !ok）
// 5) 跨 cwd 挪用被拒（ticket(cwdA) 用于 cwdB）
// 6) 同名字不同 cwd 不串（ticket(nameX, cwdA) 在 cwdA 用 ok / 在 cwdB 用拒）
// 7) allowNewSession 被忽略（new + others + allowNewSession:true → 拒，含「改用 issue_new_session_ticket」）
// 8) 10 分钟限频（同 cwd 连续 issue 两次 → 第二次抛）
// 9) 账本落盘（issued/redeemed 记录；账本不含票据本体）

import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  assertSessionTicketWindow,
  consumeSessionTicket,
  issueSessionTicket,
  readSessionTicketLedger,
  resolveSession,
  SESSION_TICKET_TTL_MS,
  validateSessionTicket,
} from '../index.js'

function tmpLedger() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'session-tickets-'))
  return path.join(dir, 'hands-session-tickets.json')
}

const INDEX = {
  sessA: { id: 'a1', cwd: 'D:/docs', updated: '2026-11-20T10:00:00Z' },
  sessB: { id: 'b1', cwd: 'D:/docs/', updated: '2026-11-21T12:30:00Z' },
}
const INDEX2 = {
  sessC: { id: 'c1', cwd: 'D:/libs', updated: '2026-11-22T09:00:00Z' },
}

// ── 1) issueSessionTicket 返回 ticket + 清单 + 提示 ────────────────────────
{
  const file = tmpLedger()
  const result = issueSessionTicket(
    { hand: 'opencode', cwd: 'D:/docs', name: 'new-job-1', reason: '测试', index: INDEX },
    { file },
  )
  assert.ok(result.ticket, '返回一次性随机串')
  assert.equal(result.hand, 'opencode')
  assert.equal(result.cwd, 'D:/docs')
  assert.equal(result.name, 'new-job-1')
  assert.equal(result.hint, '先看清单，能 resume 就别新开')
  assert.ok(
    result.sessions.some((s) => s.name === 'sessA' && typeof s.at === 'string' && typeof s.running === 'boolean'),
    '返回该目录会话清单（名字/最后活跃/是否运行中）',
  )
  fs.rmSync(path.dirname(file), { recursive: true, force: true })
  console.log('1) issueSessionTicket 返回 ticket+清单 ok')
}

// ── 2) 正常发票→new 通过；auto 换名新建通过；票据只能核销一次 ─────────────
{
  const file = tmpLedger()
  const name = `new-job-2-${Date.now()}`
  const { ticket } = issueSessionTicket({ hand: 'opencode', cwd: 'D:/docs', name, index: INDEX }, { file })
  const planned = resolveSession(INDEX, name, 'D:/docs', { sessionMode: 'new', ticket }, 'opencode', '')
  assert.equal(planned.id, null, '正常发票→new 通过')
  assert.equal(planned.reset, false)
  assert.ok(planned.ticketExpiresAt > Date.now(), '返回票据授权截止时间，供排队期间检查')
  assert.doesNotThrow(() => assertSessionTicketWindow(planned.ticketExpiresAt))
  assert.throws(() => assertSessionTicketWindow(planned.ticketExpiresAt, planned.ticketExpiresAt + 1), /排队期间新建会话票据已过期/)
  assert.equal(validateSessionTicket(ticket, 'opencode', 'D:/docs', name, '').ok, false, '票据核销一次：再校验就失效')

  const name2 = `auto-job-${Date.now()}`
  const { ticket: ticket2 } = issueSessionTicket(
    { hand: 'opencode', cwd: 'D:/libs', name: name2, index: INDEX2 },
    { file },
  )
  const plannedAuto = resolveSession(INDEX2, name2, 'D:/libs', { sessionMode: 'auto', ticket: ticket2 }, 'opencode', '')
  assert.equal(plannedAuto.id, null, '换名 auto 建会话通过（目录有其他会话，票据放行）')
  assert.equal(plannedAuto.reset, false)
  assert.ok(plannedAuto.ticketExpiresAt > Date.now())
  fs.rmSync(path.dirname(file), { recursive: true, force: true })
  console.log('2) 正常发票→new 通过 / auto 换名新建通过 / 核销一次 ok')
}

// ── 3) 无票被拒：new + 目录已有会话 → 拒，含清单 + 票据提示 ───────────────
{
  const file = tmpLedger()
  const name = `no-ticket-${Date.now()}`
  assert.throws(
    () => resolveSession(INDEX, name, 'D:/docs', { sessionMode: 'new' }, 'opencode', ''),
    (err) =>
      err.message.includes('issue_new_session_ticket') &&
      err.message.includes('sessA') &&
      err.message.includes('sessB'),
    '无票被拒并列出清单 + 票据提示',
  )
  fs.rmSync(path.dirname(file), { recursive: true, force: true })
  console.log('3) 无票被拒 ok')
}

// ── 4) 过期被拒 ────────────────────────────────────────────────────────────
{
  const file = tmpLedger()
  const name = `expired-${Date.now()}`
  const { ticket } = issueSessionTicket({ hand: 'opencode', cwd: 'D:/docs', name, index: INDEX }, { file })
  assert.equal(validateSessionTicket(ticket, 'opencode', 'D:/docs', name, '').ok, true, '票据首次校验通过')
  const later = { now: Date.now() + SESSION_TICKET_TTL_MS + 1000 }
  assert.equal(
    validateSessionTicket(ticket, 'opencode', 'D:/docs', name, '', later).ok,
    false,
    '超过 10 分钟过期 → 拒',
  )
  fs.rmSync(path.dirname(file), { recursive: true, force: true })
  console.log('4) 过期被拒 ok')
}

// ── 5) 跨 cwd 挪用被拒 ─────────────────────────────────────────────────────
{
  const file = tmpLedger()
  const name = `cross-${Date.now()}`
  const { ticket } = issueSessionTicket({ hand: 'opencode', cwd: 'D:/docs', name, index: INDEX }, { file })
  const moved = validateSessionTicket(ticket, 'opencode', 'E:/other', name, '')
  assert.equal(moved.ok, false, 'ticket 绑定 cwd，跨目录挪用被拒')
  assert.ok(moved.why.includes('D:/docs'), '拒信息提到票据绑定的目录')
  fs.rmSync(path.dirname(file), { recursive: true, force: true })
  console.log('5) 跨 cwd 挪用被拒 ok')
}

// ── 6) 同名字不同 cwd 不串 ─────────────────────────────────────────────────
{
  const file = tmpLedger()
  const name = `name-${Date.now()}`
  const { ticket } = issueSessionTicket({ hand: 'opencode', cwd: 'D:/docs', name, index: INDEX }, { file })
  assert.equal(validateSessionTicket(ticket, 'opencode', 'D:/docs', name, '').ok, true, '绑定 cwd 内用票据 ok')
  assert.equal(validateSessionTicket(ticket, 'opencode', 'D:/docs2', name, '').ok, false, '同名字不同 cwd 不串')
  fs.rmSync(path.dirname(file), { recursive: true, force: true })
  console.log('6) 同名字不同 cwd 不串 ok')
}

// ── 7) allowNewSession 被忽略 ─────────────────────────────────────────────
{
  const name = `depr-${Date.now()}`
  assert.throws(
    () => resolveSession(INDEX, name, 'D:/docs', { sessionMode: 'new', allowNewSession: true }, 'opencode', ''),
    (err) => err.message.includes('issue_new_session_ticket') && err.message.includes('allowNewSession 已废弃'),
    '传 allowNewSession 也没用：提示改用票据',
  )
  console.log('7) allowNewSession 被忽略 ok')
}

// ── 7b) 发票据返回的目录清单也排除归档会话 ────────────────────────────────
{
  const file = tmpLedger()
  const issued = issueSessionTicket(
    {
      hand: 'opencode',
      cwd: 'D:/docs',
      name: `ticket-list-${Date.now()}`,
      index: INDEX,
      archivedKeys: ['opencode/sid:a1', 'opencode/sessB'],
    },
    { file },
  )
  assert.deepEqual(issued.sessions, [], '目录里只有归档会话 → 发票据清单为空')
  fs.rmSync(path.dirname(file), { recursive: true, force: true })
  console.log('7b) 票据清单排除归档 ok')
}

// ── 8) 10 分钟限频：同一 cwd 连续 issue 两次，第二次抛 ───────────────────
{
  const file = tmpLedger()
  issueSessionTicket({ hand: 'opencode', cwd: 'D:/docs', name: `freq-a-${Date.now()}`, index: INDEX }, { file })
  assert.throws(
    () => issueSessionTicket({ hand: 'opencode', cwd: 'D:/docs', name: `freq-b-${Date.now()}`, index: INDEX }, { file }),
    /10 分钟/,
    '同一 cwd 10 分钟内第二张票据直接拒',
  )
  fs.rmSync(path.dirname(file), { recursive: true, force: true })
  console.log('8) 10 分钟限频 ok')
}

// ── 9) 账本落盘：issued/redeemed 记录；账本不存票据本体 ──────────────────
{
  const file = tmpLedger()
  const name = `ledger-${Date.now()}`
  const issued = issueSessionTicket(
    { hand: 'opencode', cwd: 'D:/docs', name, reason: '账本测试', requesterSessionId: 'sess-caller', index: INDEX },
    { file },
  )
  const ledger = readSessionTicketLedger(file)
  assert.equal(ledger.issued.length, 1, '发放记录进账本')
  assert.deepEqual(ledger.issued[0], {
    at: ledger.issued[0].at,
    event: 'issued',
    hand: 'opencode',
    cwd: 'D:/docs',
    name,
    reason: '账本测试',
    requesterSessionId: 'sess-caller',
  })
  const raw = fs.readFileSync(file, 'utf8')
  assert.ok(!raw.includes(issued.ticket), '账本只存账本，不存票据本体')
  const info = validateSessionTicket(issued.ticket, 'opencode', 'D:/docs', name, 'sess-caller')
  assert.equal(info.ok, true)
  consumeSessionTicket(info.record, { file })
  const ledger2 = readSessionTicketLedger(file)
  assert.equal(ledger2.redeemed.length, 1, '核销记录进账本')
  assert.equal(ledger2.redeemed[0].name, name)
  fs.rmSync(path.dirname(file), { recursive: true, force: true })
  console.log('9) 账本落盘 ok')
}

console.log('session tickets ok')
