# 开发版 / 上线版分离

> **一句话规矩**：开发版随便改；**上线版只有爸爸点头确认、并且先备份之后才能更新**。

## 两个目录

| 角色 | 目录 | 谁能改 |
|---|---|---|
| **开发版** | `D:\Program\projects\dsh-hands`（本仓库） | 随便改，改崩了不关线上事 |
| **上线版** | `D:\Program\tools\dsh-hands-release` | **只允许 `scripts/release.ps1 -Approved` 写入**，禁止手改 |

DSH profile 的 `dsh-hands` link 指向**上线版**，不指向开发版。开发版只用来写代码和测试。

## 为什么这么分

2026-11-19 00:03 那次崩，profile 的 link 直连开发目录：开发时一改文件，DSH 就会尝试热载，
把宿主带崩；而且 README 里早就写过「HMR 对 link 类型的 bundle 不生效」。

分离之后：

- 开发时怎么改都不影响正在跑的线上版
- 发布是一个显式动作，可备份、可回滚
- 崩溃和「线上代码被正在写的代码改到一半」彻底解耦

## 铁律

1. 只改开发版；**上线版禁止手改**。
2. 更新上线版必须按顺序：**开发版测试通过 → 爸爸点头 → 备份 → `release.ps1 -Approved` → toggle/重启 → 验证**。
3. 脚本没有 `-Approved` 直接拒绝执行。
4. 每次发布写 `manifest.json`（git commit、时间、每个文件的 sha256），备份保留最近 10 份。
5. 发布后必须重启 DSH 或 `set_bundle false→true` 才生效；**不要**在插件正在跑任务时热切。

## 发布流程

```powershell
# 0. 开发版里改完，测试先过
cd D:\Program\projects\dsh-hands
node --test                     # 或项目现有的测试/冒烟

# 1. 找爸爸确认（唯一开关，不能自己给自己点头）

# 2. 发布（脚本会自动备份上线版）
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\release.ps1 -Approved

# 3. 让 DSH 加载新版本（二选一）
#    a) 重启 DSH
#    b) plugin_manager set_bundle dsh-hands enabled=false → 再 true

# 4. 验证
curl http://127.0.0.1:<当前端口>/dsh-hands/health
#   右侧栏「手下任务」面板、hands_status 也各看一眼
```

## 回滚

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\release.ps1 -Rollback "D:\Program\backups\dsh-hands\release-<时间戳>"
# 然后同样 toggle / 重启 DSH
```

## 当前状态（2026-11-19）

- 上线版目录**还没建立**，profile 目前仍 link 到开发版 → 待爸爸点头后切换
- 切换步骤：`release.ps1 -Approved` 建出上线版 → 改 profile 的 link 指向 → `pnpm install` → 重启 DSH

## 发布记录

| 时间 | git commit | 版本 | 备注 |
|---|---|---|---|
| — | — | — | 上线版尚未建立 |
