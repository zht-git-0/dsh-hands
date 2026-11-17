# dsh-hands

把本机两个命令行智能体接成 DSH 工具。**自用版**，不带安装向导、不做环境检查面板。

| 手下 | 干什么 | 工具 |
|---|---|---|
| `agy`（Antigravity CLI） | 文案、写作、风格 | `agy_run` `agy_session` `agy_sessions` `agy_agents` `agy_models` |
| `codex`（OpenAI Codex CLI） | 规划、评审（旗舰后） | `codex_run` |
| `claude`（Claude Code） | 架构级规划、设计评审 | `claude_run` |
| `opencode` | **核心写代码**（用订阅，不按 token 计费） | `opencode_run` |
| — | 探活 | `hands_status` |

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

会话续接四家都支持，agy 的 id 是跑完之后去它自己的缓存里按 cwd 查的（它的 `-p` 只打答案，不带 id）。

## 调度上还没解决的问题（已知）

- **改完插件要手动 toggle 一次**才生效：`set_bundle false` 再 `true`。HMR 对 link 类型的 bundle 不生效。
- **超时时只能拿到部分输出**，没有"卡在哪一步"的信息。要靠 `timeoutSec` 给足。
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

从 `dsh-agy` 1.1.0 分出来：删掉 `client.js`（设置页）、删掉 `/dsh-agy/*` HTTP 接口、
插件名改 `hands`，加了 codex。agy 那五个工具原样保留。
