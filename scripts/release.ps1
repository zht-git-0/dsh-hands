# dsh-hands 发布脚本：开发版 → 上线版
#
# 用法：
#   powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\release.ps1 -Approved
#   powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\release.ps1 -Rollback "D:\Program\backups\dsh-hands\release-20261119-xxxxxx"
#
# 铁律：没有 -Approved 一律拒绝；每次发布前自动备份上线版，保留最近 10 份。
param(
  [switch]$Approved,
  [string]$Rollback = ''
)

$ErrorActionPreference = 'Stop'

$DevDir      = 'D:\Program\projects\dsh-hands'
$ReleaseDir  = 'D:\Program\tools\dsh-hands-release'
$BackupRoot  = 'D:\Program\backups\dsh-hands'
$GitExe      = 'D:\Program\tools\Git\cmd\git.exe'

$Files = @('index.js', 'client.js', 'stream.js', 'cordis.patch.yml', 'package.json', 'README.md', 'RELEASE.md', 'LICENSE', 'icon.svg')
$Dirs  = @('locale', 'acp', 'skill')

function Stamp { (Get-Date).ToString('yyyyMMdd-HHmmss') }

function Get-GitCommit {
  try { & $GitExe -C $DevDir rev-parse --short HEAD 2>$null } catch { '-' }
}

# ── 回滚模式 ────────────────────────────────────────────────────────────
if ($Rollback) {
  if (-not (Test-Path -LiteralPath $Rollback)) { throw "回滚源不存在：$Rollback" }
  if (-not $Approved) {
    throw '回滚同样需要爸爸点头：请加 -Approved 再执行。'
  }
  $stamp = Stamp
  if (Test-Path -LiteralPath $ReleaseDir) {
    Copy-Item -LiteralPath $ReleaseDir -Destination "$BackupRoot\before-rollback-$stamp" -Recurse -Force
  }
  New-Item -ItemType Directory -Force -Path $ReleaseDir | Out-Null
  Copy-Item -Path (Join-Path $Rollback '*') -Destination $ReleaseDir -Recurse -Force
  Write-Host "已回滚到：$Rollback"
  Write-Host '别忘了 toggle dsh-hands（false → true）或重启 DSH。'
  exit 0
}

# ── 发布模式 ────────────────────────────────────────────────────────────
if (-not $Approved) {
  throw '未批准：更新上线版必须先得到爸爸点头确认，再加 -Approved 重新运行。'
}

if (-not (Test-Path -LiteralPath (Join-Path $DevDir 'index.js'))) { throw "开发版目录不对：$DevDir" }

$stamp  = Stamp
$commit = Get-GitCommit

# 1. 备份现有上线版（没有就跳过）
New-Item -ItemType Directory -Force -Path $BackupRoot | Out-Null
if (Test-Path -LiteralPath $ReleaseDir) {
  $backup = Join-Path $BackupRoot "release-$stamp"
  Copy-Item -LiteralPath $ReleaseDir -Destination $backup -Recurse -Force
  Write-Host "已备份旧上线版：$backup"
} else {
  Write-Host '上线版目录不存在，本次是首次发布。'
}

# 2. 复制文件到上线版
New-Item -ItemType Directory -Force -Path $ReleaseDir | Out-Null
foreach ($f in $Files) {
  $src = Join-Path $DevDir $f
  if (Test-Path -LiteralPath $src) { Copy-Item -LiteralPath $src -Destination (Join-Path $ReleaseDir $f) -Force }
}
foreach ($d in $Dirs) {
  $src = Join-Path $DevDir $d
  if (Test-Path -LiteralPath $src) {
    $dst = Join-Path $ReleaseDir $d
    if (Test-Path -LiteralPath $dst) { Remove-Item -LiteralPath $dst -Recurse -Force }
    Copy-Item -LiteralPath $src -Destination $dst -Recurse -Force
  }
}

# 3. 写 manifest
$manifest = [ordered]@{
  publishedAt = (Get-Date).ToString('o')
  gitCommit   = $commit
  version     = ([System.IO.File]::ReadAllText((Join-Path $DevDir 'package.json'), [System.Text.Encoding]::UTF8) | ConvertFrom-Json).version
  source      = $DevDir
  files       = @{}
}
foreach ($f in $Files) {
  $p = Join-Path $ReleaseDir $f
  if (Test-Path -LiteralPath $p) { $manifest.files[$f] = (Get-FileHash -LiteralPath $p -Algorithm SHA256).Hash }
}
$jsonText = $manifest | ConvertTo-Json -Depth 4
[System.IO.File]::WriteAllText((Join-Path $ReleaseDir 'manifest.json'), $jsonText, (New-Object System.Text.UTF8Encoding($false)))
Write-Host "已发布到：$ReleaseDir（commit $commit，version $($manifest.version)）"

# 4. 只保留最近 10 份备份
Get-ChildItem -LiteralPath $BackupRoot -Directory -Filter 'release-*' -ErrorAction SilentlyContinue |
  Sort-Object Name -Descending | Select-Object -Skip 10 |
  ForEach-Object { Remove-Item -LiteralPath $_.FullName -Recurse -Force }

Write-Host ''
Write-Host '下一步（二选一）：'
Write-Host '  a) 重启 DSH'
Write-Host '  b) plugin_manager set_bundle dsh-hands enabled=false，再 enabled=true'
Write-Host '然后验证 /dsh-hands/health 和右侧栏面板。'
