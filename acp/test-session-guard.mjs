// 会话守卫回归测试：node acp/test-session-guard.mjs
// 1) sameCwd：空不算同目录（守卫失效 bug）；相同算；大小写/分隔符归一后算
// 2) 被拒时返回会话清单：new 被同目录守卫拒 + auto 换名新建被拒，错误里列出
//    同目录所有会话（名字、最后活跃时间、是否运行中）
// 3) sameDirSessionsText：名字 / 活跃时间 / 运行中-未运行；空 cwd 不列；自己不列
// 4) resume 路径：同目录带条目 → 正常返回 id

import assert from 'node:assert/strict'
import { isArchivedSessionEntry, resolveSession, sameCwd, sameDirSessionsText } from '../index.js'

const INDEX = {
  sessA: { id: 'a1', cwd: '/work/a', updated: '2026-11-20T10:00:00Z' },
  sessB: { id: 'b1', cwd: '/work/a/', updated: '2026-11-21T12:30:00Z' },
  other: { id: 'o1', cwd: '/other/b', updated: '2026-11-22T09:00:00Z' },
  noCwd: { id: 'n1', cwd: '', updated: '2026-11-22T09:00:00Z' },
}

// ── 1) sameCwd ──────────────────────────────────────────────────────
{
  assert.equal(sameCwd('', ''), false, '两个都空也不算同目录')
  assert.equal(sameCwd('', '/work/a'), false)
  assert.equal(sameCwd('/work/a', ''), false)
  assert.equal(sameCwd('/work/a', '/work/a'), true)
  assert.equal(sameCwd('/work/a', '/work/a/'), true, '结尾斜线归一后算')
  assert.equal(sameCwd('c:\\Work\\A', 'C:/work/a/'), true, '大小写/分隔符归一后算')
  console.log('1) sameCwd ok')
}

// ── 2) 被拒时返回会话清单 ────────────────────────────────────────────
{
  // new 模式被同目录守卫拒绝 → 清单里列出同目录的所有会话（名字 + 最后活跃时间）
  assert.throws(
    () => resolveSession(INDEX, `guard-test-new-${Date.now()}`, '/work/a', { sessionMode: 'new' }, 'opencode'),
    (err) =>
      err.message.includes('目录') &&
      err.message.includes('sessA') &&
      err.message.includes('sessB') &&
      err.message.includes('2026-11-20T10:00:00Z') &&
      err.message.includes('未运行'),
  )
  // auto 模式换名新建被拒绝 → 同样列出
  assert.throws(
    () => resolveSession(INDEX, `guard-test-auto-${Date.now()}`, '/work/a', { sessionMode: 'auto' }, 'opencode'),
    (err) => err.message.includes('sessA') && err.message.includes('sessB'),
  )
  console.log('2) 被拒时返回会话清单 ok')
}

// ── 3) sameDirSessionsText：名字 / 最后活跃时间 / 是否运行中 ─────────────
{
  const text = sameDirSessionsText(INDEX, 'newname', '/work/a')
  assert.ok(text.includes('sessA') && text.includes('sessB'), '列出同目录会话名')
  assert.ok(text.includes('活跃 2026-11-20T10:00:00Z'), '带最后活跃时间')
  assert.ok(text.includes('未运行'), '默认标未运行')
  assert.ok(!text.includes('other'), '别的目录不列')
  assert.ok(!text.includes('noCwd'), '空 cwd 的不列（同一性里空不算）')
  const text2 = sameDirSessionsText(INDEX, 'newname', '/work/a', ['sessA'])
  assert.ok(text2.includes('sessA') && text2.includes('运行中'), 'runningNames 标运行中')
  assert.ok(text2.includes('sessB') && text2.includes('未运行'), '另一个仍未运行')
  assert.ok(!sameDirSessionsText(INDEX, 'sessA', '/work/a').includes('sessA'), '自己不列')
  assert.equal(sameDirSessionsText(INDEX, 'x', '/nowhere'), '', '无同目录 → 空')
  console.log('3) sameDirSessionsText ok')
}

// ── 4) resume 路径：有条目且同目录 → 正常返回 id ─────────────────────
{
  assert.deepEqual(
    resolveSession(INDEX, 'sessA', '/work/a', { sessionMode: 'resume' }, 'opencode'),
    { id: 'a1', reset: false },
  )
  console.log('4) resume 路径 ok')
}

// ── 5) 归档会话不算正常会话：同目录守卫/清单一律排除 ────────────────────
{
  const archivedKeys = ['opencode/sid:a1', 'opencode/sessB']
  assert.equal(isArchivedSessionEntry('opencode', 'sessA', INDEX.sessA, archivedKeys), true, 'sid 归档键认得')
  assert.equal(isArchivedSessionEntry('opencode', 'sessB', INDEX.sessB, archivedKeys), true, '名字归档键认得')
  assert.equal(isArchivedSessionEntry('opencode', 'other', INDEX.other, archivedKeys), false, '别的目录不误伤')
  assert.equal(
    sameDirSessionsText(INDEX, 'newname', '/work/a', undefined, archivedKeys, 'opencode'),
    '',
    '同目录只剩归档会话 → 清单为空',
  )
  assert.deepEqual(
    resolveSession(
      INDEX,
      `archived-only-${Date.now()}`,
      '/work/a',
      { sessionMode: 'new' },
      'opencode',
      '',
      archivedKeys,
    ),
    { id: null, reset: false },
    '目录里只有归档会话 → new 免票直接放行',
  )
  assert.throws(
    () =>
      resolveSession(
        INDEX,
        `still-active-${Date.now()}`,
        '/work/a',
        { sessionMode: 'new' },
        'opencode',
        '',
        ['opencode/sid:a1'], // 只归档 sessA，sessB 仍在
      ),
    /issue_new_session_ticket/,
    '还有未归档会话 → 仍然要票',
  )
  console.log('5) 归档会话不算正常会话 ok')
}

console.log('session guard ok')
