# dsh-hands

把本机四个命令行智能体接成 DSH 工具，并在**对话窗口右侧边栏**提供「手下任务」实时看板：派活内容、对面正在说的话、成没成、跑了多久，都在里面。**自用版**，不带安装向导、不做环境检查面板。

| 手下 | 干什么 | 工具 |
|---|---|---|
| `agy`（Antigravity CLI） | 文案、写作、风格 | `agy_run` `agy_session` `agy_sessions` `agy_agents` `agy_models` |
| `codex`（OpenAI Codex CLI） | 规划、评审（旗舰后） | `codex_run` |
| `claude`（Claude Code） | 架构级规划、设计评审 | `claude_run` |
| `opencode` | **核心写代码**（用订阅，不按 token 计费） | `opencode_run` |
| — | 探活 | `hands_status` |
| 对话右侧边栏 → 手下任务 | 派活内容和对面**实时流式输出** | 可视化面板 |

分工：**claude / codex 出方案 → opencode 落地 → 希可验收**，agy 只管文案。

## 装

```bash
plugin_manager install_bundle  target=D:\Program\projects\dsh-hands
```

装之前先把旧的 `dsh-agy` 停掉，否则 `agy_run` 会注册两遍。

## 配置

`cordis.patch.yml`：

```yaml
- insert:
    - id: hands
      name: 'dsh-hands'
      config:
        agyBin: '...agy.exe'
        codexBin: '...codex.exe'
        timeoutSec: 900
        skipPermissions: true
        acpHands: []          # 例如 ['opencode']：该家改走 ACP（失败自动回退 CLI）
```

路径用正斜杠，别写反斜杠（YAML 里的 `\U` 会被当成转义）。

## 用法

**写作找 agy**

```
agy_run(prompt="写一支 60 秒口播稿…", cwd="…", session="deepseek 限额")
```

同一 `session` 名字会一直续同一个会话，适合反复改稿。

**架构规划找 claude**

```
claude_run(prompt="读 docs/runtime.md，给「多游戏实例化」出一个分层方案…",
           cwd="D:/Program/projects/AI_game", session="架构规划")
```

`permissionMode` 默认 `plan`（只读推理）。它读代码、出方案，但**它说的每一条关于代码的话都要自己核**。

**写代码主力找 opencode**

```
opencode_run(prompt="…", cwd="D:/Program/projects/AI_game",
             session="aigame 主力开发", auto=true)
```

`auto: true` 才会真的写文件。它按订阅计费，成本那一栏常常是 0。

**写代码也可以找 codex**

```
codex_run(prompt="实现 scripts/x.mjs …，跑 node --test scripts/x.test.mjs",
          cwd="D:/Program/projects/AI_game",
          sandbox="workspace-write")
```

`sandbox` 默认 `read-only`，真让它改文件要显式给 `workspace-write`。


## 统一入口 hands_run

四个手下的参数各不一样（agy 用 mode、codex 用 sandbox、claude 用 permissionMode、opencode 用 auto），
每次调用都要先想"这个手下那个字段叫什么"。所以再开了一个入口：

```
hands_run(to="opencode", prompt="…", cwd="…", session="aigame", write=true)
```

只需要回答两件事：**派给谁**、**要不要让它改文件**（`write`）。四个细节工具都还在，需要精调时用。

会话续接四家都支持。agy 现在优先从 `stream-json` 的 `result` 里拿 `conversation_id`，拿不到再退回它自己按 cwd 存的缓存。

## 右侧边栏：手下任务

打开对话右侧边栏的「手下任务」（右侧栏引导页里也有入口），可以看到：

- 派给了哪个手下（颜色区分 agy / codex / claude / opencode）
- **你派活的内容**，以及**对面正在返回的实时输出**
- 成没成（成功 / 失败 / 超时 / 进行中）和跑了多久
- 配的是哪个 `session`、用哪个入口（`hands_run` 还是单个 `*_run`）、要不要写文件
- 点开一行看完整对话；默认展开最新一条

输出是实时折出来的，不是等跑完再一次性贴：

- `agy` / `claude` 改用 `--output-format stream-json`，claude 还开 `--include-partial-messages`，所以能逐字看到它说；
- `codex` 用 `--json`，工具调用、命令输出、最终答复都能按事件显示；
- `opencode` 本来就是 JSONL 事件流。

服务端把 JSONL 折成人能读的文本，用 SSE 推到面板：正在跑的输出 250ms 一推，收尾或新增记录时才重发历史快照。连接断了会自动重连；重试几次仍不行就退回 800ms 轮询。贴底时自动跟随，往上翻就停住。

有新派发时右侧栏会自动掀开并切到本面板；手动收起后，下一票新活还会再打开一次。数据写在 `~/.dsh/hands-log.jsonl`，只保留最近 300 条。正在跑的活只放在内存里，跑完后落盘；历史快照只带摘录，点开某一行时再单独取完整输出。

桌面端第一次加载新面板需要重启一次（link bundle 的 HMR 不生效）；之后改 `client.js` 也要重开页面或重启才能看到新代码。设置里的旧「手下调度」页已经删掉。

## 三层面板 v2（默认关，`USE_V2 = false`）

目标形态：**agent 名字条 → 会话列表 → 对话气泡**，越往左越细。

```
┌──────────┬──────────────┬─────────────────────────────┐
│ 对话     │ 会话列表      │  交互详情                    │
│ （已有）  │ 某 agent 下   │  左我说 / 右它说，流式 + 元信息 │
└──────────┴──────────────┴─────────────────────────────┘
     最右窄条：agent 名字 + 状态点 + 今日次数
```

- 开关：`client.js` 顶部 `const USE_V2 = false`；打开前旧扁平列表原样保留，出问题改回 false 即可。
- 数据层：`createHandsStore()`（SSE v2 + 轮询回退 + 选中持久化 `localStorage['dsh.hands.sel']` + 正文增量）。
- 宽度自适应：`>=520` 三列；`360–520` 窄三列；`<360` 钻取（agents → sessions → thread）。
- 正文回落：`liveByTurn` → `/turn?id=&from=` 增量 → `excerpt`；增量由服务端算 `next`，前端只拼。

### v2 HTTP 接口（前缀 `/dsh-hands`）

| 接口 | 说明 |
|---|---|
| `GET /agents` | 四个手下的状态、今日次数、会话数、最近时间 |
| `GET /sessions?hand=` | 会话列表（日志 ∪ 四个 `*-sessions.json`，含 NOT_STARTED） |
| `GET /turns?key=&before=&limit=` | 某会话的轮次头（不含正文） |
| `GET /turn?id=` | 单轮完整记录（含 output） |
| `GET /turn?id=&from=N` | 正文增量：`{delta,next,eof}` |
| `GET /health` | 四家并行探活 + 30s 缓存 |
| `GET /stream?key=` | v2 SSE：`agents` / `sessions` / `turns` / `live` 四种事件 |
| `POST /cancel` | `{id}`，`taskkill /T /F` 杀自己的进程树，状态记 `CANCELLED` |
| `POST /rerun` | `{id,prompt?}`，从历史记录重放，后台跑、立刻回新 id |

旧接口 `/log`、`/job`、`/ping`、无 key 的 `/stream` 保持原行为不变。

### ACP 接入

`acp/runner.mjs` 把四家统一成 ACP 客户端（`runAcpTask` / `createAcpSession`）：

- opencode：`opencode acp`（原生）
- agy：`agy acp`（原生，必须 `session/set_model` 指定模型）
- codex：`codex-acp`
- claude：`@agentclientprotocol/claude-agent-acp`

`session/load` 会把历史重放成 `session/update`，runner 给这些更新标 `replay:true`，`stream.js` 的 `feedEvent` 直接丢弃，不会灌进本轮气泡。

自测脚本（都在 `acp/`）：

```bash
node acp/four-agents.mjs        # 四家各跑一句
node acp/runner.test.mjs        # 跨进程 resume，两轮
node acp/test-turns.mjs         # /turns 纯函数
node acp/test-live-delta.mjs    # live 增量
node acp/test-health.mjs        # health 缓存/并发
node acp/test-store.mjs         # 前端 store（SSE/轮询/选中）
node acp/test-bubbles.mjs       # 气泡回落/元信息
node acp/test-acp-map.mjs       # ACP update → 文本映射（含 replay 丢弃）
node acp/test-cancel.mjs        # 进程树击杀
```

## 调度上还没解决的问题（已知）

- **改完插件要手动 toggle 一次**才生效：`set_bundle false` 再 `true`。HMR 对 link 类型的 bundle 不生效。
- **超时时只能拿到部分输出**，没有"卡在哪一步"的信息。要靠 `timeoutSec` 给足；右侧栏会保留超时前收到的最后一段。
- **实时输出有上限**：内存里每次派发最多留 20 万字符，落盘只留最后 2 万字符，供右侧栏历史详情使用。
- **右侧栏面板依赖 DSH 自带的右侧栏服务**（`sidebarRightTabs` / `sidebarRight`）。太旧的 DSH 没有这两个服务时面板不会注册，也不会报错。
- 四个工具的 schema 都常驻在上下文里，每个 description 都在吃 token。细节该往 README 挪。

## 两个坑（踩过）

1. **sandbox 是在建会话时定死的**。用 read-only 建的会话，后面 resume 也不能写文件——
   `codex exec resume` 没有 `-s` 参数。要写文件就在第一次调用时给 workspace-write，
   给错了就把 ~/.dsh/codex-sessions.json 里那个名字删掉重开。
2. **spawn 时必须显式关 stdin**。codex 在非 TTY 下会等 stdin EOF，继承父进程的 stdin 会一直挂着
   （现象：打印 Reading additional input from stdin... 然后超时）。

## 验收规矩

codex 交活之后**不许直接信**：

1. `git status` 看它到底动了哪些文件
2. 测试自己重跑一遍
3. 真机跑一遍命令
4. 读代码，尤其看它有没有把 bug 写进测试断言里

第一次试用就抓到过一次：`list` 给备注加了引号，它把带引号的格式写进了测试断言。

## 和旧版的关系

从 `dsh-agy` 1.1.0 分出来：删掉旧的 `client.js`（设置页）和 `/dsh-agy/*` HTTP 接口，
插件名改 `hands`，加了 codex、claude、opencode 和统一入口。2.1.0 重新加了
`client.js`，但只做「手下调度」这一个设置页，旧的 agy 会话管理页没有搬回来。
2.2.0 把可视化从设置页搬到对话右侧边栏，并把四家的输出改成事件流，加了 SSE 实时推送。
2.3.0 v2 数据层：派发改 start/end 双记录、启动时补 INTERRUPTED、`sessionKey`、全文另存 `~/.dsh/hands-jobs/`。
2.4.0 三层面板：`/agents /sessions /turns /turn /health /cancel /rerun` + `/stream?key=` 四种事件；前端 `createHandsStore`、三列骨架、气泡与增量正文；ACP runner 接入（`acpHands` 开关，失败回退 CLI）。`USE_V2` 默认关，实机验证后再打开。
