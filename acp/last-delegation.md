# 2026-11-17T15:56:08.896Z opencode

I've read the key files. Before writing the runner, let me probe what opencode's ACP actually supports (loadSession / resume / models), since the resume path depends on it.Both `session/load` and `session/resume` are supported by opencode, but `session/set_model` isn't — it exposes model selection via `configOptions` instead. Let me check `session/set_config_option` as the fallback:`session/set_config_option` works. Now I have everything needed. Writing the runner:Now the test:Syntax checks pass. Running the real test (spawns opencode acp, may take a bit):All green. Let me quickly verify whether opencode emits `usage_update` at all (to confirm the `usage: null` skip is genuine, not a collection bug):Important finding: opencode's `usage_update` doesn't have a nested `usage` field — it flattens `used`/`size`/`cost` onto the update itself. Following the spec, we'll prioritize `update.usage`, but when it doesn't exist, we'll fall back to the flattened payload. This way, usage collection will actually be useful for opencode too:Both tests pass. Let me confirm I only added the two new files and didn't touch anything protected:I noticed there are existing `acp/delegate.mjs` and `acp/task-runner.md` files that I haven't checked yet — I'll skim through them to make sure my runner aligns with the existing plans:`task-runner.md` is just this same task spec, and `delegate.mjs` is a pre-existing one-shot script — no conflicts. Everything is done and verified.

## 回报

**新增文件（仅两个，未动任何已有文件，未 commit）：**

- `acp/runner.mjs` — 导出 `runAcpTask` 和 `createAcpSession`（async，需等握手完成才有 sessionId）
- `acp/runner.test.mjs` — `node:test` 真机测试

**实现要点：**

- 通过 `import { AcpClient } from "./client.mjs"` 复用，`client.mjs` 一字未动。权限策略用子类 `RunnerClient` 覆写 `_onRequest` 实现：`allow` 选 `allow_always` → `allow_once`，`reject` 回 `cancelled`；顺手补了基类没监听的 `child error` / `stdin error`，spawn 失败不会变成未捕获异常。
- resume：`loadSession=true` 时先试 `session/load`，失败再试 `session/resume`，都失败新建会话（`resumed: false`）。实测 opencode 两条路都支持，测试走的是 load。
- 模型选择：先试标准 `session/set_model`；实测 opencode 没这个方法（-32601），自动退到 `session/set_config_option`（configId=model，实测可用）。尽力而为，选不上不搅黄任务。
- usage：优先取 `usage_update.usage`；实测 opencode 把 `used/size/cost` 平铺在 update 上、没有 `usage` 字段，所以加了回退取整体 payload（不然 opencode 的 usage 永远是 null）。
- 文本/usage 收集挂在自己的 onUpdate 包装上，prompt 超时/失败时已收到的文本仍保留在 `text`；`session/load` 重放的历史不算当轮输出。

**验证：** `node --check` 两个文件都通过；`node acp/runner.test.mjs` 真机跑通（2 pass / 0 fail，约 16 秒），最后几行：

```
turn2 ok resumed=true ms=5520 text="蓝鲸-42"
usage 无 token 字段，跳过断言: {"used":6067,"size":1000000,"cost":{"amount":0,"currency":"USD"}}
✔ opencode 两轮同会话：记住暗号 → resume 后只答暗号 (11607.5183ms)
session ok id=ses_e15c78763ffe8ni2Vo7c4ZlAZb stop=end_turn text="收到"
✔ createAcpSession：开会话 → prompt → close (4447.6904ms)
ok
ℹ tests 2  ℹ pass 2  ℹ fail 0
```

第二轮跨进程 resume 后准确答出暗号、sessionId 一致；opencode 的 usage 没有 token 字段，按约定跳过该断言。`git status` 确认只新增了两个文件，`index.js` / `client.js` / `package.json` 未动。
