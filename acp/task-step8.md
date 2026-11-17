# 任务：dsh-hands 侧边栏 v2 视觉改造（IM 机器人式大卡片 + 气泡左右对调）

爸爸实测后的两条反馈：

1. **侧边栏"感觉一般"，要像「IM 机器人」插件设置页那样的大标签层级**——参考 IM 设置页：一列**大卡片**（圆角、图标、主标题、副标题），选中卡片有强调色边框/底色，而不是现在 52px 的 AGY/CDX 缩写窄条。
2. **对话气泡左右对调**：现在是「你（左）→ 手下（右）」；改成**你在右、手下在左**（跟常见 IM 一致）。

只改 `client.js`（`HandsPaneV2` 及其 CSS、文案），不动 `index.js`、`stream.js`、`package.json`、旧扁平列表。

## 具体

### A. 第一列：agent 大卡片（宽度 clamp(168px, 24%, 220px)）

- 顶部一个小标题「手下 / Hands」（12px，tertiary）。
- 每个 agent 一张卡片（`dsh-hands-v2-agent`）：
  - 高约 56px，圆角 10px，内边距 8px 10px，`display:flex`，`gap:10px`；
  - 左侧 34×34 圆形/圆角图标块：2 个字母缩写（AG/CD/CL/OC），每家用不同底色（用 `--dsw-alias-brand-primary`、`--dsw-alias-state-business-primary`、`--dsw-alias-state-warn-primary`、`--dsw-alias-state-success-primary` 里挑，文字白色）；
  - 右侧两行：主标题（12.5px，500，`label` 去掉括号后的名字）+ 副标题（11px，tertiary：「今日 N 次 · 空闲/在跑 1」）；
  - 右上角状态点：running 用 `--dsw-alias-state-success-primary` 呼吸动画，否则 40% 透明灰点；
  - 选中：`background: var(--dsw-alias-interactive-bg-hover)` + `box-shadow: inset 0 0 0 1px var(--dsw-alias-brand-primary)`。
- 列表可滚动，卡片间距 6px。

### B. 第二列：会话列表（宽度 clamp(150px, 22%, 200px)）

- 顶部：当前 agent 名 +「刷新」小按钮。
- 每行做成浅卡片：12px 主名（超长省略）、11px 时间（相对时间：「3 分钟前」）、右侧「N 轮」+ 状态点；选中行左侧 2px 强调色竖条 + hover 底色。
- 空态：「还没有会话」。

### C. 第三列：对话（flex:1，min-width:0）

- 头部：会话名 + 状态点；第二行 chips：`cwd 最后一段`、模型名、`今日 N 轮`；右侧「取消 / 重跑」按钮（沿用现有逻辑）。
- 气泡：
  - **你（user）：`align-self:flex-end`，右对齐**，背景 `color-mix(in srgb, var(--dsw-alias-brand-primary) 16%, transparent)`，圆角 14px 14px 4px 14px；
  - **手下（agent）：`align-self:flex-start`，左对齐**，背景 `var(--dsw-alias-bg-layer-1)`，边框 `1px solid var(--dsw-alias-border-l2)`，圆角 14px 14px 14px 4px；
  - 两侧都 `max-width: 88%`，`padding: 9px 12px`，`white-space: pre-wrap`，`word-break: break-word`；
  - user 气泡上方小字「你 → 手下」（10.5px tertiary，右对齐）；agent 气泡上方小字「opencode · 写码」（10.5px tertiary，左对齐，带手忙色点）；
  - agent 气泡下方元信息行左对齐（状态点、成功/失败、耗时、tokens、$cost）；running 时光标保留。
- 轮次间距 14px；列表自动贴底（沿用现有 Stream 逻辑）。

### D. 宽度分级

- `>=560`：A 168–220 / B 150–200 / C 剩余；
- `420–560`：A 130 / B 120 / C 剩余；
- `<420`：钻取（现有逻辑保留，返回按钮位置放到头部左侧）。
- 任何宽度都不允许横向滚动条。

### E. 文案

新增文案进 en/zh 字典：「手下」「今日 N 次」「空闲」「在跑 N」「还没有会话」「你 → 手下」「刷新」等。

## 自证

1. `node --check client.js`。
2. `node acp/test-store.mjs`、`node acp/test-bubbles.mjs` 回归全绿（如有断言依赖旧的左右顺序/文案，按新要求改断言）。
3. 回报：改了哪些组件/CSS、文案键、测试输出。
