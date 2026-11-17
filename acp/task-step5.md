# 任务：dsh-hands 面板 v2 第 5 步（对话气泡 + 轮次 + 增量正文 + 元信息）

先读：

- `C:\Users\Administrator\Documents\deepseek-harness\default-workspace\notes\hands-panel-plan-v2.md` 第 3 节（Turn/Bubble 结构、元信息）第 4 节（数据流第 3/4/5 条）第 5 节第 5 步
- `D:\Program\projects\dsh-hands\client.js` 现状：`createHandsStore`（已带 `turnsByKey/liveByTurn/loadTurns/loadTurnBody/appendLive`）、`HandsPaneV2` 三列骨架、老的 `Stream` 组件（贴底跟随、上滚停跟、光标）。`USE_V2` 目前 false，**保持 false**，这轮只把 v2 的 thread 区做完整。

## 要做的

在 `HandsPaneV2` 的 thread 列里实现（复用 store 和现有 `Stream`）：

1. **ThreadHead**：会话名 + cwd（截断）+ 模型 + 今日 N 轮 + 运行状态点；右侧「取消」「重跑」按钮（调 `POST /dsh-hands/cancel` / `/rerun`，成功后刷新 turns）。
2. **TurnList**：按 startedAt 正序；选中会话加载后自动滚到底；上滚时不打断（沿用 Stream 的贴底逻辑）。
3. **Turn**：
   - `BubbleUser`：左对齐，`white-space: pre-wrap`，prompt 超长截断到 2000 字 + 「展开」。
   - `BubbleAgent`：右对齐（align-self: flex-end），正文按序回落：`liveByTurn[id]` → `/turn?id=&from=` 增量补齐 → `turn.excerpt` 兜底；`running` 时显示光标；正文超过 4000 字默认折叠 + 「展开」。
   - 元信息行：`status`（颜色点 + 文案）、耗时（ms 人读化）、tokens（有的话显示 in/out 或总数）、cost（$x.xx）、exitCode、model。
4. **增量拉取**：点开一轮历史（或选中会话时）对没有正文的 turn 调 `loadTurnBody(id, from)`，用返回的 `next` 继续拉，直到 `eof`；同一轮只拉一次，滚动到底时懒加载更早的 turns（`before` 分页）。
5. **取消/重跑**：按钮只在 `running` 时可点取消，`finished` 时可点重跑；请求中禁用，失败显示一行红字。

## 约束

- 只改 `client.js`；`index.js` 不动。`USE_V2` 保持 false。
- 不引第三方库；沿用 `h()` 和 `--dsw-alias-*` 变量；新类名 `dsh-hands-v2-` 前缀。
- 文案全部进 en/zh 字典。
- 性能：render 不要每帧全树重渲；正文更新走 store 切片。

## 自证

1. `node --check client.js`。
2. 扩 `acp/test-store.mjs`（或新增 `acp/test-bubbles.mjs`）用最小 React stub 渲染 `BubbleAgent`/`Turn` 的纯函数部分：
   - 断言正文回落顺序（live > 拉取 > excerpt）；
   - 断言 running 时带光标标记；
   - 断言元信息文本包含耗时/tokens/cost（给定假 turn）。
   如果组件依赖 hooks 不方便渲染，就把「正文回落」「元信息格式化」抽成纯函数（`resolveTurnBody(turn, live, fetched)`、`formatTurnMeta(turn)`）导出测试。
3. 回报：新增组件、纯函数、测试输出。
