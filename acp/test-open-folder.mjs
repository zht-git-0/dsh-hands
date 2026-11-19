// 「打开文件夹」白名单测试：node acp/test-open-folder.mjs
// 只有已知会话的 cwd 才允许打开，其它路径（含相对路径穿越）一律拒绝。
import assert from 'node:assert/strict'
import { resolveOpenFolder } from '../index.js'

const known = [
  'D:\\Program\\projects\\dsh-hands',
  'C:/Users/Administrator/Documents/deepseek-harness/default-workspace',
]

// ── 1) 已知 cwd 放行 ───────────────────────────────────────────────────────
{
  const got = resolveOpenFolder(known, 'D:\\Program\\projects\\dsh-hands')
  assert.ok(got.toLowerCase().endsWith('dsh-hands'), '已知路径放行')
  console.log('1) 已知 cwd 放行 ok')
}

// ── 2) 未知/空/穿越一律拒绝 ────────────────────────────────────────────────
{
  assert.equal(resolveOpenFolder(known, 'D:\\Program\\projects\\other'), '', '未知路径拒绝')
  assert.equal(resolveOpenFolder(known, ''), '', '空路径拒绝')
  assert.equal(resolveOpenFolder([], 'D:\\x'), '', '没有已知 cwd 时全拒')
  assert.equal(resolveOpenFolder(known, '..\\..\\Windows\\System32'), '', '相对穿越拒绝')
  assert.equal(resolveOpenFolder(known, 'C:\\Windows'), '', '系统目录拒绝')
  console.log('2) 未知路径拒绝 ok')
}

// ── 3) Windows 上大小写不敏感、首尾空格可容忍 ──────────────────────────────
{
  assert.ok(resolveOpenFolder(known, '  D:\\Program\\projects\\dsh-hands  '), '首尾空格')
  if (process.platform === 'win32') {
    assert.ok(resolveOpenFolder(known, 'd:\\program\\PROJECTS\\dsh-HANDS'), '大小写不敏感')
  }
  console.log('3) 大小写与空格 ok')
}

// ── 4) 返回的是解析后的绝对路径 ────────────────────────────────────────────
{
  const got = resolveOpenFolder(known, 'C:/Users/Administrator/Documents/deepseek-harness/default-workspace')
  assert.ok(got.includes('default-workspace'), '返回绝对路径')
  console.log('4) 返回绝对路径 ok')
}

console.log('ok')
