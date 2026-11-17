# 任务：dsh-hands 面板 v2 第 4a 步（前端数据层：createHandsStore + 三列骨架占位）

先读：

- `C:\Users\Administrator\Documents\deepseek-harness\default-workspace\notes\hands-panel-plan-v2.md` 第 3 节（前端三列结构、状态管理、选中持久化、宽度自适应）和第 5 节第 4 步
- `D:\Program\projects\dsh-hands\client.js`（现状：870 行，`window.__ModuleLoader__.load({id:'dsh-hands', factory(require){...}})`，已有 `createHandsFeed`、`Stream` 组件、`sidebar.right.pane.tab` 注册、en/zh 文案）
- `D:\Program\projects\dsh-hands\index.js` 新接口：`/dsh-hands/agents` `/sessions` `/turns` `/turn?id=&from=` `/health` `/stream?key=`（v2 事件 agents/sessions/turns/live）——插件没装到 profile 里，**curl 不到**，请直接读 index.js 里这几个路由的实现确认字段名，别猜。

## 本轮只做前端数据层和骨架，不追求好看

1. **`createHandsStore()`**（放 client.js 的 factory 里，独立函数）：
   - 状态：`{ phase:'idle'|'loading'|'ready'|'error', agents:[], sessionsByHand:{}, turnsByKey:{}, liveByTurn:{}, selection:{hand,key,turnId}, connected:false, error:null }`
   - 方法：`start()/stop()`、`select(hand,key)`、`refreshAll()`、`loadTurns(key)`、`loadTurnBody(id, from)`、`appendLive(key,id,delta)`。
   - 订阅：`subscribe(fn)` + `getSnapshot()`；组件用 `useSyncExternalStore(subscribe, () => store.snapshotSlice('agents'))` 这类 selector 取切片（每次返回新对象会无限重渲，注意用缓存版本号：只有相关 revision 变了才换引用）。
   - SSE：连 `/dsh-hands/stream?key=<selection.key>`；事件 `agents/sessions/turns/live` 按事件名归并；断线 4s 无首包 → 退到轮询（`/agents` 每 5s、选中 key 的 `/turns` 每 3s）；重连成功切回 SSE。
   - 选中持久化：`localStorage['dsh.hands.sel']`，加载顺序按规划：读存档 → key 还在就恢复 → 否则该 hand 下 lastAt 最新的会话 → 否则第一个 hand 的第一个会话；`turnId` 失效回落到最后一轮。
   - poll 和 SSE 都要能停（`stop()` 清 timer / close EventSource）。

2. **三列骨架**：新增 `HandsPaneV2({ store })`，结构按规划第 3 节：
   - `HandsRail`（52px，agent 缩写 + 状态点 + 今日数）
   - `HandsSessions`（clamp(116px,28%,180px)，行：名字/最近时间/轮数/状态点）
   - `HandsThread`（flex:1，头：会话名 + cwd + 模型 + 今日轮数；下面先放占位文案「选择一条会话」或轮次列表的最小版本）
   - `ResizeObserver` 量宽：`>=520` 三列；`360..520` 窄三列；`<360` 钻取（`view='agents'|'sessions'|'thread'` + 返回按钮）。
   - 样式：一份 CSS 字符串，类名统一 `dsh-hands-v2-` 前缀，沿用 `--dsw-alias-*` 变量；不引库。

3. **灰度开关**：`const USE_V2 = false`（先保持默认旧列表）。true 时 `sidebar.right.pane.tab` 渲染 `HandsPaneV2`，false 时完全走旧渲染。旧的 `createHandsFeed` 和扁平列表**一行都别删**，作为回滚路径。

## 约束

- 只改 `client.js`；`index.js`、`stream.js`、`package.json` 不动。
- 不引第三方库；保持 `window.__ModuleLoader__.load` 的外壳和 `apply(ctx)` 的签名、locale 注册。
- 文案进 en/zh 两个字典，别硬编码中文。

## 自证

1. `node --check client.js` 通过（只做语法检查）。
2. 写 `acp/test-store.mjs`（node 环境）：用 `globalThis.window = { __ModuleLoader__: { load(def){ globalThis.__def = def } } }` 抓出 factory，用假 `require` 提供 react（最小 stub：createElement 返回对象、useSyncExternalStore 等），实例化 `createHandsStore`，用假 fetch 返回固定 JSON，断言：
   - 初始 refreshAll 后 agents/sessions 有数据；
   - select 后 localStorage 写对；
   - SSE 的 live 事件能 appendLive 且 delta 不重复；
   - stop() 后 timer/EventSource 清掉（用假定时器或断言内部字段）。
   注意：factory 里的 React hooks 不能直接跑，测试只碰 store 和纯函数，不渲染组件。
3. `node acp/test-store.mjs` 打印 ok。
4. 回报：新增了哪些函数、USE_V2 开关在哪、测试输出。
