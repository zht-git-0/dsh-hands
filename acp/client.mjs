// 最小 ACP client：握手、开会话、连续多轮 prompt、权限应答、usage 收集。
// 用途：验证「同一个 ACP 会话可以追问」，以及给 dsh-hands 换 runner 打底。
// 用法：node acp/client.mjs <opencode|agy> "<第一句>" ["<追问>"]
import { spawn } from "node:child_process";
import readline from "node:readline";

const SPECS = {
  opencode: {
    command: process.env.OPENCODE_BIN || "D:\\Program\\environment\\nodejs\\node_modules\\@opencode\\cli\\bin\\opencode.exe",
    args: ["acp"],
  },
  agy: {
    command: process.env.AGY_BIN || "C:\\Users\\Administrator\\AppData\\Local\\agy\\bin\\agy.exe",
    args: ["acp"],
  },
};

export class AcpClient {
  constructor(name, options = {}) {
    const spec = SPECS[name];
    if (!spec) throw new Error(`unknown ACP agent: ${name}`);
    this.name = name;
    this.spec = spec;
    this.options = options;
    this.child = null;
    this.pending = new Map();
    this.nextId = 1;
    this.usage = [];
    this.onUpdate = options.onUpdate || null;
  }

  start() {
    this.child = spawn(this.spec.command, this.spec.args, {
      cwd: this.options.cwd || process.cwd(),
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
    });
    this.stderr = "";
    this.child.stderr.on("data", (d) => {
      this.stderr += d.toString();
      if (this.stderr.length > 20000) this.stderr = this.stderr.slice(-20000);
    });
    const rl = readline.createInterface({ input: this.child.stdout });
    rl.on("line", (line) => this._onLine(line));
    this.child.on("exit", (code) => {
      for (const { reject } of this.pending.values()) reject(new Error(`agent exited (${code})`));
      this.pending.clear();
    });
    return this;
  }

  _onLine(line) {
    let msg;
    try {
      msg = JSON.parse(line);
    } catch {
      return;
    }
    if (msg.id !== undefined && msg.method) {
      // agent → client request（主要是权限）
      this._onRequest(msg);
      return;
    }
    if (msg.id !== undefined && this.pending.has(msg.id)) {
      const { resolve, reject } = this.pending.get(msg.id);
      this.pending.delete(msg.id);
      msg.error ? reject(new Error(JSON.stringify(msg.error))) : resolve(msg.result);
      return;
    }
    if (msg.method === "session/update") {
      const update = msg.params?.update ?? {};
      if (update.sessionUpdate === "usage_update") this.usage.push(update);
      if (this.onUpdate) this.onUpdate(update);
    }
  }

  _onRequest(msg) {
    const id = msg.id;
    if (msg.method === "session/request_permission") {
      const opts = msg.params?.options ?? [];
      const pick = opts.find((o) => o.kind === "allow_always") || opts.find((o) => o.kind === "allow_once") || opts[0];
      this._write({
        jsonrpc: "2.0",
        id,
        result: pick ? { outcome: { outcome: "selected", optionId: pick.optionId } } : { outcome: { outcome: "cancelled" } },
      });
      return;
    }
    this._write({ jsonrpc: "2.0", id, error: { code: -32601, message: `unsupported client request: ${msg.method}` } });
  }

  _write(obj) {
    this.child.stdin.write(JSON.stringify(obj) + "\n");
  }

  request(method, params, timeoutMs = 60000) {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`timeout ${method}`));
      }, timeoutMs);
      this.pending.set(id, {
        resolve: (v) => {
          clearTimeout(timer);
          resolve(v);
        },
        reject: (e) => {
          clearTimeout(timer);
          reject(e);
        },
      });
      this._write({ jsonrpc: "2.0", id, method, params });
    });
  }

  async initialize() {
    // ACP 1 号握手：客户端不提供文件系统能力，权限靠 session/request_permission 应答
    this.init = await this.request("initialize", {
      protocolVersion: 1,
      clientCapabilities: { fs: { readTextFile: false, writeTextFile: false } },
    });
    return this.init;
  }

  async newSession(cwd = this.options.cwd || process.cwd(), mcpServers = []) {
    this.session = await this.request("session/new", { cwd, mcpServers }, 120000);
    this.sessionId = this.session.sessionId;
    return this.session;
  }

  async prompt(text, timeoutMs = 600000) {
    const chunks = [];
    const prev = this.onUpdate;
    this.onUpdate = (update) => {
      if (update.sessionUpdate === "agent_message_chunk") chunks.push(update.content?.text ?? "");
      if (prev) prev(update);
    };
    try {
      this.usage = [];
      const result = await this.request(
        "session/prompt",
        { sessionId: this.sessionId, prompt: [{ type: "text", text }] },
        timeoutMs,
      );
      return { text: chunks.join(""), stopReason: result?.stopReason, usage: this.usage.at(-1)?.usage ?? null };
    } finally {
      this.onUpdate = prev;
    }
  }

  close() {
    this.child?.kill();
  }
}

// 直接运行时：两轮对话，验证同一会话能追问
if (process.argv[1] && process.argv[1].endsWith("client.mjs")) {
  const name = process.argv[2] || "opencode";
  const first = process.argv[3] || "记住一个暗号：蓝鲸-42。只回复「记住了」。";
  const second = process.argv[4] || "刚才的暗号是什么？只回答暗号本身。";

  const client = new AcpClient(name, { cwd: process.cwd() }).start();
  try {
    const init = await client.initialize();
    console.log(`[${name}] ${init.agentInfo?.name} ${init.agentInfo?.version} loadSession=${init.agentCapabilities?.loadSession}`);
    await client.newSession();
    console.log(`[${name}] session=${client.sessionId}`);

    const t1 = Date.now();
    const r1 = await client.prompt(first);
    console.log(`[${name}] turn1 (${Date.now() - t1}ms) stop=${r1.stopReason} text=${JSON.stringify(r1.text)}`);

    const t2 = Date.now();
    const r2 = await client.prompt(second);
    console.log(`[${name}] turn2 (${Date.now() - t2}ms) stop=${r2.stopReason} text=${JSON.stringify(r2.text)}`);
    console.log(`[${name}] usage=${JSON.stringify(r2.usage)}`);
  } catch (error) {
    console.error(`[${name}] FAILED: ${error.message}`);
    if (client.stderr) console.error(client.stderr.slice(-500));
    process.exitCode = 1;
  } finally {
    client.close();
  }
}
