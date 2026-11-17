# 任务：dsh-hands 三层面板 v2，第 1 步（后端只读聚合接口）

先读这两份：

- `C:\Users\Administrator\Documents\deepseek-harness\default-workspace\notes\hands-panel-plan-v2.md`（本次规划，重点第 2 节接口清单和第 5 节分步）
- `D:\Program\projects\dsh-hands\index.js`（现状：v2 数据层已有 `startDispatch/finishDispatch/reconcileLog/listSessions/mergedJobs/readJobText`，已有 `/dsh-hands/log`、`/dsh-hands/job`、`/dsh-hands/stream`）

## 只做第 1 步：后端只读聚合接口

在 `index.js` 里新增以下路由（沿用现有 `mroute()` 写法和 JSON 响应、`cache-control: no-store`）。**旧接口 `/log` `/job` `/ping` /`stream` 一律不动。**

1. `GET /dsh-hands/agents` → `{checkedAt, agents:[{hand,label,running,today,sessions,lastAt,ok,bin,version}]}`
   - `running` 取 RUNNING 表里该 hand 的条数；`today` 用 `todayCount(hand)`；`sessions` 用 `listSessions(hand).length`；`lastAt` 取该 hand 最近一条 job 的 at。
   - `ok`/`version` 先留空（第 3 步 health 再接），字段要在。
2. `GET /dsh-hands/sessions`（可选 `hand` 过滤）→ `{hand, sessions:[...]}`，**直接包一层 `listSessions(handFilter)`**，原样返回它已有的字段。
3. `GET /dsh-hands/turns`（`key` 必填、`before` 可选 ISO、`limit` 默认 50）→ `{key, turns:[{id,hand,tool,startedAt,at,status,ok,ms,prompt,excerpt,tokens,cost,model,write,running}]}`
   - 数据源：`mergedJobs()`（历史）+ RUNNING（在跑），按 `sessionKey` 或 `conversationId` 归到 `key`，按 `startedAt` 倒序，`before` 之前的、取 `limit` 条。
   - **不要返回 `output`/`jobFile`**，太占带宽。
   - 写成纯函数 `turnsFor(key, {before, limit})`，方便单测。
4. `GET /dsh-hands/turn?id=` → 现有 `fullEntry(id)` 原样返回（含 output）。
5. `GET /dsh-hands/turn?id=&from=N` → `{id, from, next, eof, delta}`：读 `readJobText(entry)` 后 `slice(from)`；`next = from + delta.length`；`eof = next >= text.length`。
   - 注意 id 校验和路径穿越都沿用现有 `readJobText` 的逻辑。

## 约束

- 只改 `index.js`，不动 `client.js`、`stream.js`、`package.json`。
- 新增代码放在 `// ── HTTP 路由` 区块附近，风格跟现有代码一致（中文注释、无第三方库）。
- 所有新接口失败要回 JSON `{ok:false,error}` + 合适状态码，不能把主机弄崩。

## 自证

1. `node --check index.js` 通过。
2. 为 `turnsFor()` 写一个纯函数测试 `acp/test-turns.mjs`：造几条假 job（含 RUNNING 条目、不同 sessionKey、乱序 startedAt），断言过滤/排序/limit/不返回 output；`node acp/test-turns.mjs` 打印 ok。
   - 如果 `turnsFor` 依赖 index.js 的闭包变量不方便单独 import，就把它抽成可导出的纯函数（`export function turnsFor(jobs, running, key, opts)`），index.js 里调用它，测试直接 import。
3. 回报：改了哪些函数、新增哪些路由、测试输出最后几行。

不要 commit，不要动旧接口，不要碰前端。
