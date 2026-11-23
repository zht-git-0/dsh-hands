// 多行 prompt 送达路径的回归测试：node acp/test-prompt-transport.mjs
//
// 症状（2026-11 提出）：给 opencode 派多行任务书（"两处小修："后跟编号列表）时，
// 任务书只到了冒号前那句，列表部分丢了。实测造成丢字的是 Windows 上
// .cmd/.bat 包装器走 cmd.exe 的那条路：cmd 把带换行的参数截断了（见下方 3）。
//
// 修复：runProcess 优先 spawn .cmd 包装器里真正的 .exe（winCmdExeOf），
// 参数不过 cmd 解析，多行 prompt 原样进 argv。
//
// 本文件验证：
//   1) winCmdExeOf 能从真实 opencode.cmd 解出真实 opencode.exe（在有安装的机器上）；
//   2) runProcess(probe.cmd, [..., 多行 prompt]) —— 观测脚本拿到的 argv 含完整多行 prompt（新路径）；
//   3) 复现旧路径：旧的 shell:true + 手动引号解析确实会把多行 prompt 截断（用户看到的症状）；
//   4) 非 cmd 包装器 / 解不出 exe 的包装器：winCmdExeOf 返回 ''，行为不变。

import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { runProcess, whichBin, winCmdExeOf } from '../index.js'

// 带真实换行的任务书和残底（旧路径下应到不了"3-2"这一行）
const MULTILINE = '两处小修：\n1. 改 A\n2. 改 B\n结果标准：本地跑一遍测试通过'
const MULTILINE3 = '两处小修：\n3-1. 改 X\n3-2. 改 Y\n结果标准：旧路径应截断'

function makeProbe(dir, marker) {
  // 观测脚本：node.exe 打开它，把收到的 argv 写成 JSON
  fs.writeFileSync(
    path.join(dir, 'probe.mjs'),
    `import fs from 'node:fs'\n` +
      `fs.writeFileSync(new URL('./argv.json', import.meta.url), JSON.stringify(process.argv.slice(2)))\n`,
  )
  // 包装器（模拟 opencode.cmd 的形态）：指向真实 node.exe + 观测脚本，再带上 %*
  fs.writeFileSync(
    path.join(dir, 'probe.cmd'),
    `@echo off\r\nSET dp0=%~dp0\r\n"${process.execPath}" "%dp0%probe.mjs" %*\r\n`,
  )
  const probeCmd = path.join(dir, 'probe.cmd')
  assert.ok(fs.existsSync(probeCmd), 'probe.cmd 必须真实存在')
  return { probeCmd, outFile: path.join(dir, 'argv.json') }
}

// ── 1) winCmdExeOf：能从包装器里解出真正的 .exe ────────────────────────────
{
  if (process.platform === 'win32') {
    const cmd = whichBin('opencode') || 'opencode.cmd'
    const exe = winCmdExeOf(cmd)
    assert.ok(exe, `应从真实 opencode 包装器解出 exe（cmd=${cmd}），实际得到：${exe}`)
    assert.ok(fs.existsSync(exe), `解出的 exe 必须真实存在：${exe}`)
  } else {
    assert.equal(winCmdExeOf('opencode.cmd'), '', '非 Windows 返回空')
  }

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-prompt-'))
  const { probeCmd } = makeProbe(dir, 'section1')
  const exe = winCmdExeOf(probeCmd)
  assert.ok(exe && exe.endsWith('node.exe'), `probe 包装器应解出 node.exe，实际为：${exe}`)
  assert.ok(fs.existsSync(exe), '解出的 exe 必须真实存在')
  fs.rmSync(dir, { recursive: true, force: true })
  console.log('1) winCmdExeOf ok')
}

// ── 2) 新路径：多行 prompt 通过 runProcess 原样送达（观测脚本拿到完整 argv）──
{
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-prompt-'))
  const { probeCmd, outFile } = makeProbe(dir, 'section2')
  const argv = ['run', '--format', 'json', MULTILINE]
  const result = await runProcess(probeCmd, ['probe.mjs', ...argv], { cwd: dir, timeoutSec: 20 })
  assert.equal(result.code, 0, `child 应正常退出，stderr=${result.stderr}`)
  const got = JSON.parse(fs.readFileSync(outFile, 'utf8'))
  assert.ok(got.includes(MULTILINE), '多行 prompt 必须原样到达子进程的 argv，实际收到：' + JSON.stringify(got))
  fs.rmSync(dir, { recursive: true, force: true })
  console.log('2) runProcess 多行 prompt 原样送达 ok')
}

// ── 3) 复现旧路径：旧的 shell:true + 手动引号会截断多行 prompt（用户实测的症状）──
{
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-prompt-'))
  const { probeCmd, outFile } = makeProbe(dir, 'section3')
  const args = ['probe.mjs', 'run', '--format', 'json', MULTILINE3]
  // 旧 runProcess 对 win32 .cmd 的处理：手动加引号，然后 shell: true 交给 cmd.exe
  const oldArgs = args.map((a) => (/[\s"&|<>^]/.test(a) ? `"${String(a).replace(/"/g, '""')}"` : a))
  const old = spawn(probeCmd, oldArgs, { shell: true, cwd: dir, stdio: ['ignore', 'pipe', 'pipe'] })
  await new Promise((resolve) => old.on('close', resolve))
  const got = JSON.parse(fs.readFileSync(outFile, 'utf8'))
  assert.ok(
    !got.includes(MULTILINE3),
    '复现：旧路径（shell:true）的 cmd 解析应截断多行 prompt，实际收到：' + JSON.stringify(got),
  )
  fs.rmSync(dir, { recursive: true, force: true })
  console.log('3) 复现旧路径截断 ok')
}

// ── 4) 非 cmd 包装器：winCmdExeOf 返回 ''，行为不变 ─────────────────────────
{
  assert.equal(winCmdExeOf(process.execPath), '', 'node.exe 不是包装器')
  const tmp = path.join(os.tmpdir(), 'dsh-no-exe.cmd')
  fs.writeFileSync(tmp, 'REM nothing\r\n')
  assert.equal(winCmdExeOf(tmp), '', '指向不存在 exe 的包装器应解不出')
  fs.rmSync(tmp, { force: true })
  console.log('4) 非包装器路径 ok')
}

console.log('prompt transport ok')
