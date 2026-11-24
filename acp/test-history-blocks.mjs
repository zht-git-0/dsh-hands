// 历史轮次 blocks 补渲染的纯函数测试：node acp/test-history-blocks.mjs
// 老轮次（log 里没有 blocks）：/dsh-hands/turn?from=0 改用 deriveBlocksFromText(readJobText(entry))
// 解析原始文本里的工具行 + 正文 —— 这里验证各家工具行格式都能解析出 tool 块，
// 文本行能合并成 text 块。

import assert from 'node:assert/strict'
import { deriveBlocksFromText } from '../index.js'

// ── 1) opencode/claude 格式：`→ name: detail` / `→ name` ──────────────────
{
  const text = [
    '先探索一下仓库。',
    '→ read: D:\\proj\\a.txt',
    'Read file D:\\proj\\a.txt, lines 1-5',
    '→ write: D:\\proj\\b.txt',
    '写好了',
    '',
    '结论：完成。',
  ].join('\n')
  const blocks = deriveBlocksFromText(text)
  const tools = blocks.filter((b) => b.kind === 'tool')
  assert.equal(tools.length, 2)
  assert.equal(tools[0].name, 'read')
  assert.equal(tools[0].detail, 'D:\\proj\\a.txt')
  assert.equal(tools[1].name, 'write')
  assert.equal(tools[1].detail, 'D:\\proj\\b.txt')
  assert.ok(blocks.every((b) => b.kind === 'text' || b.kind === 'tool'), '只有 text/tool 两种块')
  const textBlocks = blocks.filter((b) => b.kind === 'text')
  assert.ok(textBlocks.some((b) => b.text.includes('先探索一下仓库。')), '前置正文在')
  assert.ok(textBlocks.some((b) => b.text.includes('读出来一行')) || textBlocks.some((b) => b.text.includes('Read file D:\\proj\\a.txt')))
  assert.ok(textBlocks.some((b) => b.text.includes('结论：完成。')), '后置正文在')
  console.log('1) opencode `→ name: detail` 格式 ok')
}

// ── 2) `→ name`（无 detail）与 `[tool] name`（agy） ─────────────────────
{
  const blocks = deriveBlocksFromText('先看。\n→ WebSearch\n[tool] read\n读出来')
  const tools = blocks.filter((b) => b.kind === 'tool')
  assert.equal(tools[0].name, 'WebSearch', '`→ name` 无 detail')
  assert.equal(tools[0].detail, '')
  assert.equal(tools[1].name, 'read', '`[tool] name`')
  console.log('2) `→ name` / `[tool] name` 格式 ok')
}

// ── 3) codex 格式：`$ command` / `✎ path` ───────────────────────────────
{
  const blocks = deriveBlocksFromText('$ Get-ChildItem -File acp | Sort-Object Length\n✎ acp/index.js\n通过。')
  const tools = blocks.filter((b) => b.kind === 'tool')
  assert.equal(tools[0].name, 'Get-ChildItem -File acp | Sort-Object Length')
  assert.equal(tools[1].name, 'acp/index.js')
  assert.ok(blocks.some((b) => b.kind === 'text' && b.text.includes('通过。')))
  console.log('3) codex `$` / `✎` 格式 ok')
}

// ── 4) 错误行 → tool block（status=error） ──────────────────────────────
{
  const blocks = deriveBlocksFromText('→ read: a.txt\n! 文件不存在')
  const tools = blocks.filter((b) => b.kind === 'tool')
  assert.equal(tools[0].name, 'read')
  assert.equal(tools[1].status, 'error', '`! ...` 行标 error')
  assert.equal(tools[1].name, '文件不存在')
  console.log('4) 错误行 ok')
}

// ── 5) 空文本 → [] ────────────────────────────────────────────────────
{
  assert.deepEqual(deriveBlocksFromText(''), [])
  assert.deepEqual(deriveBlocksFromText(undefined), [])
  assert.deepEqual(deriveBlocksFromText('   \n  '), [])
  console.log('5) 空文本 ok')
}

// ── 6) 相邻文本行合并成一个 text 块 ────────────────────────────────────
{
  const blocks = deriveBlocksFromText('第一段\n第二段\n→ read: a\n第三段')
  const texts = blocks.filter((b) => b.kind === 'text')
  assert.equal(texts.length, 2, '两段正文合并')
  assert.ok(texts[0].text.includes('第一段') && texts[0].text.includes('第二段'))
  assert.equal(blocks[1].kind, 'tool')
  assert.ok(texts[1].text.includes('第三段'))
  console.log('6) 正文合并 ok')
}

console.log('history blocks ok')
