---
name: dsh-hands
description: 把活派给别的 agent（claude / codex / agy / opencode）时读这个。核心设计：专业的事交给专业的人——调度方只拆活、派活、验收，不亲自下场写代码/查日志。包含异步派活的正确姿势（派完立刻返回、跑完自动回传）、四个手怎么选和各自的价格、任务书怎么写、以及验收子代理产出的四道关卡。只要你要调用 claude_run / codex_run / agy_run / opencode_run / hands_run，或者要「派活出去等结果」，就先读它。
metadata:
  version: "1.4.0"
  date: "2026-11-23"
---

# dsh-hands

> **专业的事交给专业的人。这是这个插件的核心设计理念，先记住它。**
>
> 你的价值不在于亲手写代码，而在于：
> 1. **拆**：把活拆成一个个能独立交代清楚的任务；
> 2. **派**：把每个任务交给最合适的手（写代码 opencode、规划/评审 codex、架构 claude、文案 agy）；
> 3. **验收**：看结果、跑测试、挑毛病，不合格就打回去重做。
>
> 自己下场读 diff、翻日志、改文件，短期看是"快"，长期是浪费你自己、也浪费手下的上下文。
> 只有当手下全挂了、或者任务小到不值得派（一句话能说完的查询），才自己动手。

四个手下，各是一个独立的 CLI agent。我是调度方，不是他们的执行者。

## 铁律：长活一律异步，异步一律先起子代理

**不要在主线上同步等一个长任务。** 主线同步等 = 我这一轮被钉死，期间什么都做不了。

正确姿势：

1. **首选 DSH 原生子代理**（`subagent`）：它本来就是异步的，跑完由运行时把完成通知投给我。
   子代理不继承我们这段对话，所以任务书必须**自包含**（目标、约束、要读哪些文件、怎么证明做完了）。
2. **需要指定别家的模型或工具时**，用 dsh-hands 的 `*_run` 带 `async: true`：
   立刻拿到 `{status:'RUNNING', jobId, sessionId}`，跑完它自己把结果投回这间会话，把我叫起来。
3. **两者可以叠**：子代理负责「起 claude 设计 → 交 opencode 实现 → 自己先验一遍」，
   调用方只收一条汇报。一次派活只有一条回传，不会把会话塞满。

什么时候可以同步：任务小到几十秒（问一句、看一眼），或者我明确就是要等这个结果才能往下走。

## 四个手怎么选

| 手 | 干什么 | 价格 | 备注 |
|---|---|---|---|
| `opencode_run` | 写代码、跑测试、改文件 | 极便宜（一次约 $0.001） | 默认模型 deepseek-flash；它自己的 shell 里**没有 git**，别指望它提交 |
| `agy_run` | 写文案、出稿 | 便宜 | 用 `--mode` 控制 |
| `codex_run` | 规划、代码审查 | 中 | sandbox 在**建会话时**定死，resume 改不了 |
| `claude_run` | 架构设计、复杂推理 | **贵，一次至少 $0.05**（系统提示就两百 K） | **必须显式传 model**（如 `model: 'sonnet'`），不传会走 CLI 默认，可能直接上 opus |

价格差三个数量级。日常干活走 opencode / agy；**架构设计/评审优先 codex**（便宜，够用），claude 只在真正需要长上下文推理时才上。

**别跑 `acp/four-agents.mjs` 这类探活脚本**：它每跑一次就真起一轮 sonnet 会话（一句「收到」≈ $0.05），面板里会堆一串「未命名」。健康检查看 `/dsh-hands/health` 就够，那个只跑 `--version`。

## agy 用第三方模型（可选，2026-11-23）

agy 默认走官方（免费的 gemini-3.8-flash）。要切第三方（如 znbcode）：

- **传 `provider`**：`agy_run` / `hands_run(to=agy)` 传 `provider: "znbcode"`。不传或 `"official"` = 官方，官方路径不变：不注入 env、不写 settings、不传 `--settings`。
- **配置文件**：`~/.dsh/hands-providers.json`（缺文件自动补示例），结构同：
  `{"official":{},"znbcode":{"baseUrl":"https://znbcode.com","apiKeyEnv":"GEMINI_API_KEY","model":"Gemini 4 Neon (XHigh)"}}` —— `apiKeyEnv` 是读 key 时优先取的环境变量名。
- **密钥不写明文**：优先环境变量 `apiKeyEnv`；找不到再从 cc-switch 的 sqlite 里读（`~/.cc-switch/cc-switch.db`，`providers` 表 `app_type='agy'`，`settings_config.env` 里的 `GEMINI_API_KEY`；现在电脑上那行 name=znbcode）。
- **怎么生效**：第三方调用时插件把 `GOOGLE_GEMINI_BASE_URL` / `GEMINI_API_KEY` 注入 agy 子进程，并在 `~/.dsh/agy-profiles/znbcode/settings.json` 写 `{"modelProvider":"gemini","model":"Gemini 4 Neon (XHigh)"}`，通过 agy 的 `--settings` 只对这次会话生效——**不污染用户默认 `~/.gemini`**。
- **缺 key 报错**：`agy 供应商「znbcode」缺 API key：请设置环境变量 GEMINI_API_KEY…` —— 传了 provider 但没找到 key 时别默默跑官方。

## 会话：续接优先，新开必须显式（2026-11-22 用户定死）

**默认动作是「续接」，不是「新开」。** 派活时先想：这件事是不是接着之前那条线干的？

- 是 → `session` 用**原来那个名字**，并且显式 `sessionMode: "resume"`。名字差一个字都算新会话。
- 不是（全新任务）→ 起个新名字，显式 `sessionMode: "new"`，并在任务书开头重新交代背景。
- `sessionMode` 不写 = `auto`：有同名就续、没有就建。**连续任务不要偷懒用 auto**，因为名字打错会静默变成新会话。

**硬性规矩：**

1. 同一个项目、同一条任务线，**永远**用同一个 `session` 名字 + `resume`。改 bug、补镜头、修测试都属于「接着干」。
2. 名字只差后缀（`xxx` vs `xxx2`、`xxx-fix` vs `xxx`）时，先当作同一件事，用原名 `resume`；确实要分线才起新名（例如并行两条完全不同的活）。
3. 报错信息不是障碍：`resume` 说会话不存在、或目录不一致，先停下来核对名字/目录，别顺手改成 `new` 绕过去。
4. 新开之后如果发现「本该接上一条」，不要继续在新会话里硬干：回到原会话 `resume`，把新会话里得到的结论带回去。
5. 任务书开头写一行「这条线继续 <session 名>，之前做过：…」，换人接手也不用重新考古。

**今天踩过的坑（2026-11-22）：** 修 MV 第 6 镜时新开了 `cover-stage4-fix6`，没续 `cover-stage4-claude`，agent 只能靠读文件猜前情，绕了一圈才发现「相机不能凑近 mascot 平面」这个结论早就有了。上下文比文件重要。

## 会话命名惯例

- 名字用「项目名 + 用途」：`fatal-lock 接管`、`dsh-hands 面板`、`cover-stage4-claude`。
- 一个项目并行两条线时才用两个名字区分（`fatal-lock UI` / `fatal-lock 存档`）。
- 别用「任务1/任务2」这种一次性名字——等于每次新开会话，上下文全丢。

## hands_run 的异步是真的异步（2.6.3 起）

- `async: true` → 立刻返回 `{status:'RUNNING', jobId}`，**这一轮不被钉住**；跑完由插件把结果投回当前会话。
- 异步任务默认**不限时**（`timeoutSec` 传 0）；要限时就在调用时显式传秒数。
- 投递依赖「调用方 DSH 会话 id」：job 里拿不到 id 时会标 `no-agent`，任务本身可能已经跑完，去 `~/.dsh/hands-async.json` 或 `GET /dsh-hands/async` 看 `delivery` / `deliveryError`。
- 老会话里工具实例不会热更：插件发版后要重启 DSH 或新开会话，异步修复才生效。

## 任务书怎么写

子代理看不到我们的对话。任务书里至少要有：

- **目标**：要产出什么，给谁看。
- **约束**：哪些文件不许动、什么依赖不许加、要不要保持向后兼容。
- **可读的东西**：具体路径，不要写「你去看看那个项目」。
- **验收方式**：它要跑什么命令、交什么证据。
- **不要做什么**：明确写「只出设计不写代码」这类边界，否则它会自己加戏。

- **多行任务书**（2026-11-23）：任务书本来就多行——第一行动作，`结果标准：`，然后编号步骤。多行 prompt 已验证能原样送达 opencode（此前 Windows 上 opencode 的 cmd 包装器把多行 prompt 截成第一行，丢了列表）。结构建议：**第一行是完整目标句**，`结果标准：` 说怎么算通过，步骤列表每一步都要能独立落地。

## 验收：只要证据，不要结论

它说「做完了」是零信息。我要的是：

1. **可复跑的命令 + 原始输出**：退出码、测试名、报错原文。不接受「应该没问题」。
2. **我自己复跑**：它给的命令调用方再跑一遍，看真实退出码；代码我自己 `git diff` 过一遍，多改的少改的都算问题。
3. **对账**：它说改了哪几个文件，我拿 `git status` 对；说测过哪条，我点开那条断言看。设计稿和实现对不上，实现就不算过。
4. **它验不了的**（真实 API 调用、外部系统状态）：要求贴原始日志和路径，我自己去读，不听转述。

验收标准必须**我先定**，不能让它自己定标准再自己宣布通过。

## 并发与观测

- 异步活同时最多跑 3 个（`config.maxAsync` 可调），多的先进先出排队，进程是排队之后才起的。
- `GET /dsh-hands/async?n=50` 一次看到在跑的（`live`）和落盘的（`persisted`），
  每条带 `delivery` / `deliveryError` / `deliveredAt` —— 排查「投没投出去、是不是孤儿」看这里，不用翻日志。
- 回传正文是契约格式：状态、用时、退出码、花费、派活原文、结果、完整日志路径。
- DSH 重启后（2026-11-23）：
  - `~/.dsh/hands-async.json` 里每条 job 的 `status` / `delivery` / `pid` / `recoverNote` 说清三种状态：
    - `ORPHAN` = 进程已经不在了（没了结果在原会话记录里，不会自动回传）；
    - `RUNNING` + `recoverNote` 带 `pid` = 还在跑（`tasklist /FI "PID eq N"` 或 `ps -p N` 可核对），跑完由插件补传；
    - `delivery: retrying` + `nextRetryAt` = 投递退避中。
  - 进程到底完没完，别只看插件状态——`tasklist /FI "PID eq N"` / `ps -p N` 查真实进程。
  - 没了结果的 ORPHAN 不要硬投：去 opencode 会话里找那次回复，或重派一次。

## 踩过的坑

1. **二进制会搬家**。2026-11-18 开机后 `~/.local/bin` 整个没了，`claude_run` 直接 ENOENT。
   现在按「配置 → 本机常用位置 → 默认值」顺序找第一个存在的；`/dsh-hands/health` 能看四家路径和版本。
2. **claude 不传 model 会走默认**，默认可能是 opus，一次两百 K 缓存读，很贵。
3. **codex 的 sandbox 是建会话时定死的**，`codex exec resume` 没有 `-s` 参数，给错了就把 `~/.dsh/codex-sessions.json` 里那个名字删掉重开。
4. **spawn 必须显式关 stdin**，codex 在非 TTY 下会等 stdin EOF 一直挂着。
5. **改了插件要 toggle 一次才生效**（`set_bundle false` 再 `true`），HMR 对 link 类型的 bundle 不生效。

## 收尾

派出去的活，我必须在合理时间内给用户一个说法：成了、没成、卡在哪。
长时间没动静要主动查 `/dsh-hands/async`，别让活烂在队列里。
