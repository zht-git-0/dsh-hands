# dsh-hands

把本机两个命令行智能体接成 DSH 工具。**自用版**，不带安装向导、不做环境检查面板。

| 手下 | 干什么 | 工具 |
|---|---|---|
| `agy`（Antigravity CLI） | 文案、写作、风格 | `agy_run` `agy_session` `agy_sessions` `agy_agents` `agy_models` |
| `codex`（OpenAI Codex CLI） | 写代码、跑测试 | `codex_run` |
| — | 探活 | `hands_status` |

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

**写代码找 codex**

```
codex_run(prompt="实现 scripts/x.mjs …，跑 node --test scripts/x.test.mjs",
          cwd="D:/Program/projects/AI_game",
          sandbox="workspace-write")
```

`sandbox` 默认 `read-only`，真让它改文件要显式给 `workspace-write`。

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
