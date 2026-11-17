# 任务：dsh-hands 面板 v2 第 2 步（RUNNING_PROCS + /cancel + /rerun）

先读：

- `C:\Users\Administrator\Documents\deepseek-harness\default-workspace\notes\hands-panel-plan-v2.md` 第 2 节第 8/9 条、第 5 节第 2 步
- `D:\Program\projects\dsh-hands\index.js` 现状：`runProcess()` 起子进程、`startDispatch/finishDispatch` 记账、`RUNNING` 表存 entry、`HANDS[hand].build()` 拼 argv。

## 只做第 2 步：取消与重跑

1. **`RUNNING_PROCS`**：模块/apply 作用域里新开一个 `Map`，`id -> { child, startedAt }`。
   - **不要**塞进 `RUNNING`（`clean()` 会递归踩到 ChildProcess 循环引用）。
   - 在 `runProcess()` 里加可选 `onSpawn(child)` 回调，spawn 成功后立刻调用；四个 `*_run` 和 `hands_run` 里把当前派发 id 和 child 记进 `RUNNING_PROCS`。
   - 进程收尾（finishDispatch）时从表里删掉。
2. **`POST /dsh-hands/cancel`** body `{id}`：
   - 查 `RUNNING_PROCS`；没有就 `{ok:false, error:'not running'}` + 404（幂等：已完成也回 404 并说明）。
   - Windows 用 `taskkill /PID <pid> /T /F` 杀进程树（别用 child.kill，CLI 会留孙进程）；非 Windows 用 `process.kill(-pid, 'SIGTERM')` 兜底。
   - 收尾：`finishDispatch` 写 `status:'CANCELLED', ok:false, error:'cancelled'`（`outcome()` 里别把它归成 ERROR 之外的类别），删 RUNNING/RUNNING_PROCS，推 revision。
   - 返回 `{ok:true, id, killed:true}`。
3. **`POST /dsh-hands/rerun`** body `{id, prompt?}`：
   - 从 `mergedJobs()` 找 id；没找到 404。
   - 用原 job 的 `hand/tool/session/cwd/write/model`，prompt 用 body.prompt ?? 原 prompt；若 `tool === 'hands_run'` 走统一入口，否则走对应 `*_run` 的 build 路径。
   - 必须**异步**（返回新 id 后后台跑），不能阻塞 HTTP 响应。
   - 返回 `{ok:true, id:newId, hand, sessionKey}`。
4. `outcome()` / `finishDispatch` 里补 `CANCELLED` 的判定，日志里能区分。

## 约束

- 只改 `index.js`；旧接口不动；不改前端。
- 杀进程只杀自己起的 `child.pid`，别用 `taskkill /IM node.exe` 这种连坐。
- 失败一律 JSON `{ok:false,error}`。

## 自证

1. `node --check index.js`。
2. 把杀进程的纯函数抽成可导出的 `killProcessTree(pid)`，写 `acp/test-cancel.mjs`：
   - 用 `child_process.spawn(node, ['-e','setTimeout(()=>{},60000)'])` 起一个假任务，拿到 pid；
   - 调 `killProcessTree(pid)`，断言 2 秒内进程消失（`process.kill(pid,0)` 抛 ESRCH）；
   - `node acp/test-cancel.mjs` 打印 ok。
3. 回报：改了哪些函数、新路由、测试输出。
