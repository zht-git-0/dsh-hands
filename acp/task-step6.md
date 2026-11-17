# 任务：dsh-hands 面板 v2 第 6 步（ACP 接入：runner 去重放 + stream feedEvent + index 开关）

先读：

- `C:\Users\Administrator\Documents\deepseek-harness\default-workspace\notes\hands-panel-plan-v2.md` 第 4 节「ACP 接进来之后」和第 5 节第 6 步
- `D:\Program\projects\dsh-hands\acp\runner.mjs`（runAcpTask/createAcpSession，四家已通）
- `D:\Program\projects\dsh-hands\stream.js`（createLiveView：吃 CLI 文本，折叠 JSONL）
- `D:\Program\projects\dsh-hands\index.js`（opencode_run / hands_run 的 runProcess 调用；HANDS 定义）

## 1. `acp/runner.mjs`：replay 标记

`session/load` 会把历史重放成 `session/update`，必须让调用方能丢掉。

- `openSession` 里在 `session/load` / `session/resume` 期间给 onUpdate 的回调打标：把 `{...update, replay: true}` 传出去；恢复完成后恢复正常。
- `runAcpTask` / `createAcpSession` 的 onUpdate 语义写进注释。
- 不要改已有行为（四家冒烟 `node acp/four-agents.mjs` 仍要全通）。

## 2. `stream.js`：`feedEvent(update)`

给 `createLiveView(hand)` 的返回值加 `feedEvent(update)`：

- 内部维护 `toolCalls` map（id → title），把 ACP 的结构化更新映射成和 CLI 路径一致的「对面在说什么」：
  - `agent_message_chunk` → 追加 `update.content.text`
  - `agent_thought_chunk` → 不追加正文（可另存 `thought` 字段，供未来用）
  - `tool_call` → 追加一行 `\n[tool] <title>\n`，并记 id
  - `tool_call_update` → 若 status 变化（completed/failed）追加 `[tool] <title> done/失败`
  - `usage_update` → 存 `usage`，**不追加正文**
  - `replay: true` → 直接 return（丢弃）
- 导出纯函数 `mapAcpUpdate(update, state)`（state 为 {toolCalls}）→ `{text?, usage?, thought?}`，给单测用；`feedEvent` 只负责把 text 塞进现有 live.feed 管道。

## 3. `index.js`：开关 + opencode 走 ACP

- 配置加 `acpHands: []`（数组，默认空 = 全走 CLI，保持现状）。支持 `config.acpHands = ['opencode']` 时该家走 ACP。
- `opencode_run` 与 `hands_run(to='opencode')` 里：若命中 `acpHands`，改走 `runAcpTask({ agent:'opencode', cwd, prompt, model, sessionId, onUpdate })`：
  - `onUpdate` → `run.feedEvent?.(update)`（把 live view 的 feedEvent 接上）；
  - `conversationId` = 结果里的 `sessionId`（resume 时传已知的 conversationId）；
  - `tokens`/`cost` 从 `usage` 里按已知形状取（opencode usage: `{used,size,cost:{amount}}`），取不到就 null；
  - `status/ok/ms/error` 走现有 `outcome()`；ACP 的 `stopReason` 记进日志字段。
- CLI 路径**完全保留**；异常时回退 CLI 一次（记一行日志），不能因为 ACP 挂了让工具直接失败。
- 不要动 client.js / package.json / README（README 第 7 步）。

## 约束

- 只改 `acp/runner.mjs`、`stream.js`、`index.js`。
- 不引第三方库；ACP 的 import 用动态 `import('./acp/runner.mjs')`，避免 CLI 用户也多付启动成本。

## 自证

1. `node --check` 三个文件。
2. `node acp/four-agents.mjs` 四家仍全通。
3. 新增 `acp/test-acp-map.mjs`：用假 update 序列测 `mapAcpUpdate`（消息块/工具调用/usage/replay 丢弃/工具完成），打印 ok。
4. `node acp/test-store.mjs`、`test-bubbles`、`test-turns`、`test-health`、`test-live-delta` 回归全绿。
5. 回报：改了哪些函数、开关名、测试输出。

不要 commit。
