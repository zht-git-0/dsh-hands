# 任务：给 dsh-hands 写 ACP runner 模块

仓库根目录就是这个项目（dsh-hands，一个 DSH 插件，把 agy / codex / claude / opencode 四个 CLI 接成工具并在侧边栏展示）。现在要把它底下的「起 CLI + 解析 stdout」换成 ACP（Agent Client Protocol）客户端。

## 先读

- `acp/client.mjs`：已经有能用的最小 ACP client（AcpClient：initialize / newSession / prompt / close，处理 session/request_permission）。**不要改它**。
- `acp/client-probe.mjs`：一次性的握手探针，可参考。
- `stream.js`：现在负责把各家 CLI 的 JSONL 折成「对面在说什么」。
- `README.md`：项目说明。

## 新增文件

### 1. `acp/runner.mjs`

导出：

```js
export async function runAcpTask({
  agent,        // 'opencode' | 'agy'
  cwd,
  prompt,
  sessionId,    // 可选：传了就 resume 同一个会话
  onUpdate,     // 可选：(update) => void，收到 ACP session/update 的原始 update 对象
  timeoutMs,    // 可选，默认 30 分钟
  permission,   // 'allow' | 'reject'，默认 'allow'
  model,        // 可选：会话里要选的模型 id
}) -> {
  ok, text, stopReason, sessionId, usage, ms, error, resumed
}

export function createAcpSession({ agent, cwd, onUpdate, permission })
  -> { sessionId, prompt(text, opts), close() }
```

要求：

- 复用 `acp/client.mjs` 的 AcpClient（import），不要复制粘贴一份。
- `onUpdate` 收到所有 `session/update` 的 update 对象（包括 agent_thought_chunk、agent_message_chunk、tool_call、usage_update 等）。
- 权限请求：`permission: 'allow'` 时选 `allow_always` 优先，其次 `allow_once`；`reject` 时回 cancelled。ACP 的请求是 agent → client 的 JSON-RPC request，方法名 `session/request_permission`。
- 收集 usage：记住最后一次 `usage_update` 的 `usage` 字段，放进返回值。
- `sessionId` 传入时尝试恢复会话：ACP 有 `session/load`（loadSession=true 表示支持）和 `session/resume`；依次尝试，都失败则新建会话，并在返回值里 `resumed: false`；成功恢复则 `resumed: true`。
- 任何失败都不抛异常：捕获后返回 `{ ok: false, error: <message>, ... }`，已收到的文本尽量保留在 `text`。
- 纯 ESM，只用 node 内置模块，不引第三方库。

### 2. `acp/runner.test.mjs`

用 `node:test` + `node:assert`：

- 连 opencode 跑两轮：第一轮让对面「记住暗号：蓝鲸-42」，第二轮用同一个 session 问「只回答暗号」，断言第二轮文本包含 `蓝鲸-42`。
- 断言两轮 sessionId 一致。
- 如果 usage 里能拿到 token 数就断言 > 0；拿不到就跳过这条断言。
- 直接 `node acp/runner.test.mjs` 能跑，最后打印 ok。
- 测试要在当前目录跑（cwd 用 process.cwd()）。

## 完成标准

1. `node --check acp/runner.mjs` 和 `node --check acp/runner.test.mjs` 通过。
2. `node acp/runner.test.mjs` 真的跑通（会起 opencode acp，几秒到十几秒）。
3. 回报：改了哪些文件、测试输出最后几行。

注意：不要动 `index.js`、`client.js`、`package.json`；这轮只加 ACP 层，后面再接线。不要 commit。
