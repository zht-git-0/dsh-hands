// ACP runner：把 acp/client.mjs 的最小 client 包成「派一票活」和「开一个常驻会话」两种用法。
// runAcpTask：起 agent → 握手 → （可选 resume）→ 一句 prompt → 收尾，任何失败都不抛异常。
// createAcpSession：起 agent 并开好会话，返回句柄，可以连续 prompt，用完 close()。
// 纯 ESM，只用 node 内置模块。权限应答 / 文本收集 / usage 收集都在这里做，client.mjs 保持原样。
import { AcpClient } from "./client.mjs";

const DEFAULT_TIMEOUT_MS = 30 * 60 * 1000; // prompt 默认 30 分钟
const RESUME_TIMEOUT_MS = 60 * 1000; // load / resume 尝试给 60 秒，失败就退回新建
const MODEL_TIMEOUT_MS = 15 * 1000;

// 只改两处行为：权限按 permission 策略应答；spawn 失败不让进程崩。
export class RunnerClient extends AcpClient {
  constructor(name, options = {}) {
    super(name, options);
    // 权限策略：'allow' / 'reject'，或者一个 async 函数 (params) => 'allow'|'reject'
    // 函数形态给「面板上人工点允许/拒绝」用；函数抛错/超时按 reject 走（fail-closed）。
    this.permission = typeof options.permission === "function"
      ? options.permission
      : options.permission === "reject" ? "reject" : "allow";
  }

  start() {
    super.start();
    // 基类没监听这两个事件：spawn ENOENT / kill 后写 stdin 都会变成未捕获异常
    this.child.on("error", (err) => {
      for (const { reject } of this.pending.values()) reject(err);
      this.pending.clear();
    });
    this.child.stdin.on("error", () => {});
    return this;
  }

  _onRequest(msg) {
    if (msg.method !== "session/request_permission") return super._onRequest(msg);
    const opts = msg.params?.options ?? [];
    const answer = (decision) => {
      // allow：allow_always 优先，其次 allow_once；reject（或没有可选项）一律 cancelled
      const pick = decision === "allow"
        ? opts.find((o) => o.kind === "allow_always") || opts.find((o) => o.kind === "allow_once")
        : null;
      this._write({
        jsonrpc: "2.0",
        id: msg.id,
        result: pick
          ? { outcome: { outcome: "selected", optionId: pick.optionId } }
          : { outcome: { outcome: "cancelled" } },
      });
    };
    if (typeof this.permission === "function") {
      // 人工授权：等回调给结论；抛错或拒绝都按 reject 处理（fail-closed）
      Promise.resolve()
        .then(() => this.permission(msg.params || {}))
        .then((decision) => answer(decision === "allow" ? "allow" : "reject"))
        .catch(() => answer("reject"));
      return;
    }
    answer(this.permission === "allow" ? "allow" : "reject");
  }
}

// 选模型：标准 ACP 是 session/set_model；opencode 没有这个方法，
// 退到 session/set_config_option（configId=model）。尽力而为，选不上不搅黄任务。
// 没显式给 model 时，用 session 自带的 currentModelId 兜底（agy 不选就报 plan model not specified）。
async function selectModel(client, sessionId, model, session) {
  const mid = model || session?.models?.currentModelId;
  if (!mid) return;
  try {
    await client.request("session/set_model", { sessionId, modelId: mid }, MODEL_TIMEOUT_MS);
    return;
  } catch {
    /* 换 config option 再试 */
  }
  try {
    await client.request("session/set_config_option", { sessionId, configId: "model", value: mid }, MODEL_TIMEOUT_MS);
  } catch {
    /* 两条路都不通就算了 */
  }
}

// 内部公共流程：起进程 → initialize → resume（load 优先，resume 次之）→ 不行就新建。
// state 挂在 onUpdate 上收文本和 usage，prompt 失败时调用方还能拿到已收到的部分。
//
// onUpdate 语义：onUpdate(update) 收到的是 ACP 原始 session/update。
// session/load、session/resume 会把历史重放成 session/update；这段时间内转发出去的对象
// 一律带 replay:true，调用方（尤其 live view）应当整块丢弃。恢复完成后恢复正常（不带该字段）。
async function openSession({ agent, cwd, onUpdate, permission, sessionId }) {
  const dir = cwd || process.cwd();
  const state = { chunks: [], usage: null };
  let replaying = false;
  const client = new RunnerClient(agent, {
    cwd: dir,
    permission,
    onUpdate: (update) => {
      const kind = update?.sessionUpdate;
      if (kind === "agent_message_chunk") state.chunks.push(update.content?.text ?? "");
      else if (kind === "usage_update") {
        // 标准形状是 update.usage；opencode 把 used/size/cost 平铺在 update 上，退而取整体
        const { sessionUpdate, ...rest } = update;
        state.usage = update.usage ?? (Object.keys(rest).length ? rest : null);
      }
      if (onUpdate) onUpdate(replaying ? { ...update, replay: true } : update);
    },
  }).start();

  try {
    const init = await client.initialize();
    let resumed = false;
    if (sessionId) {
      // load / resume 全程打 replay 标：这两步会把历史重放成 session/update
      replaying = true;
      try {
        // loadSession=true 才声明支持 session/load
        if (init.agentCapabilities?.loadSession) {
          try {
            await client.request("session/load", { sessionId, cwd: dir, mcpServers: [] }, RESUME_TIMEOUT_MS);
            resumed = true;
          } catch {
            /* 再试 resume */
          }
        }
        if (!resumed) {
          try {
            await client.request("session/resume", { sessionId, cwd: dir, mcpServers: [] }, RESUME_TIMEOUT_MS);
            resumed = true;
          } catch {
            /* 都失败就新建会话 */
          }
        }
      } finally {
        replaying = false;
      }
    }
    let sessionValue = null;
    if (resumed) {
      client.sessionId = sessionId; // client.prompt 依赖这个字段
    } else {
      sessionValue = await client.newSession(dir);
    }
    return { client, state, sessionId: client.sessionId, resumed, session: sessionValue };
  } catch (error) {
    client.close();
    throw error;
  }
}

/**
 * 开一个常驻 ACP 会话（async：要等握手和建会话完成）。
 * 返回 { sessionId, prompt(text, opts), close() }；
 * prompt(text, { timeoutMs, model }) → { text, stopReason, usage }，失败会抛，由调用方处理。
 *
 * onUpdate(update)：ACP 原始 session/update，语义和 runAcpTask 相同：
 * resume 重放的历史块带 replay:true（本函数目前不 resume，正常不会出现）。
 */
export async function createAcpSession({ agent, cwd, onUpdate, permission } = {}) {
  const { client, state, sessionId, session } = await openSession({ agent, cwd, onUpdate, permission });
  return {
    sessionId,
    async prompt(text, opts = {}) {
      state.chunks = [];
      state.usage = null;
      await selectModel(client, sessionId, opts.model, session);
      const result = await client.prompt(text, opts.timeoutMs ?? DEFAULT_TIMEOUT_MS);
      return {
        text: state.chunks.join(""),
        stopReason: result?.stopReason ?? null,
        usage: state.usage ?? result?.usage ?? null,
      };
    },
    close() {
      client.close();
    },
  };
}

/**
 * 派一票活：起 agent → （可选 resume 同一会话）→ prompt → 关进程。
 * 永不抛异常；失败时 ok=false、error 带原因，已收到的文本保留在 text。
 * 返回 { ok, text, stopReason, sessionId, usage, ms, error, resumed }。
 *
 * onUpdate(update)：ACP 原始 session/update，用于流式展示。
 * resume（session/load / session/resume）期间重放的历史块带 replay:true，调用方应丢弃；
 * prompt 期间的更新不带 replay。
 */
export async function runAcpTask({
  agent,
  cwd,
  prompt,
  sessionId,
  onUpdate,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  permission = "allow",
  model,
} = {}) {
  const t0 = Date.now();
  const out = {
    ok: false,
    text: "",
    stopReason: null,
    sessionId: sessionId ?? null,
    usage: null,
    ms: 0,
    error: null,
    resumed: false,
  };
  let opened = null;
  try {
    opened = await openSession({ agent, cwd, onUpdate, permission, sessionId });
    out.sessionId = opened.sessionId;
    out.resumed = opened.resumed;
    await selectModel(opened.client, opened.sessionId, model, opened.session);
    opened.state.chunks = []; // load 重放的历史不算这轮的输出
    opened.state.usage = null;
    const result = await opened.client.prompt(prompt, timeoutMs);
    out.text = opened.state.chunks.join("");
    out.stopReason = result?.stopReason ?? null;
    out.usage = opened.state.usage ?? result?.usage ?? null;
    out.ok = true;
  } catch (error) {
    out.error = error?.message || String(error);
    if (opened) {
      out.text = opened.state.chunks.join("");
      out.usage = opened.state.usage;
    }
  } finally {
    opened?.client.close();
    out.ms = Date.now() - t0;
  }
  return out;
}
