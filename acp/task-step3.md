# 任务：dsh-hands 面板 v2 第 3 步（/health + /stream v2 事件）

先读：

- `C:\Users\Administrator\Documents\deepseek-harness\default-workspace\notes\hands-panel-plan-v2.md` 第 2 节第 6/7 条、第 2 节末尾「/stream?key= 事件」和第 5 节第 3 步
- `D:\Program\projects\dsh-hands\index.js`：已有 `/dsh-hands/stream`（无 key 时全局 snapshot + running 增量，250ms、15s ping）、`checkEnv`（只探 agy）、`touchRunning/touchHistory/runningRevision/historyRevision`、`createLiveView`、`RUNNING`。

## 1. `/health`

- 路径 `GET /dsh-hands/health`，返回 `{checkedAt, agents:{agy:{bin,exists,runnable,version}, codex:{...}, claude:{...}, opencode:{...}}}`。
- 四家**并行**探（`Promise.allSettled`），每家最多 20 秒：
  - `exists`: `fs.existsSync(bin)`
  - `runnable`: 跑 `bin --version`（codex/opencode/agy/claude 都支持 `--version`；失败再试 `--help`），`spawn` + 5 秒超时，取退出码
  - `version`: 从 stdout/stderr 第一行里截一段（≤80 字符）
- 结果缓存 30 秒（`{at, value}`），并发请求共享同一个 in-flight Promise（别同时起四份探测）。
- 失败也要回 200，字段 `exists:false`/`runnable:false`/`error`。

## 2. `/stream` v2

保持**旧行为不变**：请求没带 `key` 参数时，行为、事件名、格式跟现在一模一样（`snapshot`/`running` + ping），旧 client.js 不受影响。

带 `?key=<sessionKey>` 时，改为发这四种事件（`id:` 用 revision）：

- `event: agents` — `{revision, agents:[{hand,running,today,sessions,lastAt}]}`，只有 agents 维度的 revision 变化才发（复用 /agents 的组装逻辑，抽成 `agentsPayload()`）
- `event: sessions` — `{revision, hand, sessions:[...]}`，只发该 key 所属 hand 的会话；`sessionsForHand(hand)` 复用 `/sessions` 的组装
- `event: turns` — `{revision, key, turns:[...]}`，复用 `turnsFor(...)`，只有头（不带 output）
- `event: live` — `{key, id, delta, next, outputAt, idleMs}`：只推该 key 下**在跑**那一轮（或最近一轮）的正文增量；用每 id 的 `sentLength` 记账，只发 `text.slice(sentLength)`，`next = sentLength + delta.length`；没有新增就不发。
- revision 拆三份：`agentsRevision` / `sessionsRevision(key)` / `turnsRevision(key)`；现有 `runningRevision/historyRevision` 保留给旧无 key 分支用。
- 250ms 节拍、15s `: ping`、连接关闭清理，遵循现有实现。
- key 不存在时也要能正常建连，先发一帧 `agents`，后续只发 agents 变化。

## 3. 纯函数（给测试用）

- `computeLiveDelta(text, sentLength)` → `{delta, next, changed}`，`sentLength` 越界要夹到 `[0, text.length]`。
- 抽 `agentsPayload()` / `sessionsForHand(hand)` 时不要依赖 req/res。

## 约束

- **只改 `index.js`**，不动 client.js / stream.js / package.json。
- 旧 `/log` `/job` `/ping` `/agents` `/sessions` `/turns` `/turn` `/cancel` `/rerun` 行为不变。
- 不能把宿主弄崩：探测进程失败、bin 不存在、流断开都要安全收口。

## 自证

1. `node --check index.js`。
2. `acp/test-live-delta.mjs`：测试 `computeLiveDelta` 的边界（空串、越界 sentLength、增量两次不重复、`next` 正确）；`node acp/test-live-delta.mjs` 打印 ok。
3. `acp/test-health.mjs`（可选但推荐）：起一个本地 http 服务不现实的话，就只测缓存/并发合并的纯逻辑（把 `withHealthCache(fn)` 抽成可测函数）。
4. 回报：改了哪些函数、新事件名、测试输出。
