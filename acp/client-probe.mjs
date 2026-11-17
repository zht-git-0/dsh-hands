// ACP 探针：起一个 ACP agent 子进程，握手 → 新会话 → 发一句 → 收流。
// 用法：node acp/client-probe.mjs <opencode|agy> "<prompt>"
// 这是给 dsh-hands 换 runner 前的最小验证，不依赖 DSH。
import { spawn } from "node:child_process";
import readline from "node:readline";

const which = process.argv[2] || "opencode";
const prompt = process.argv[3] || "回答两个字：收到";

const SPECS = {
  opencode: { command: "cmd.exe", args: ["/c", "opencode", "acp"] },
  agy: { command: process.env.AGY_BIN || "C:\\Users\\Administrator\\AppData\\Local\\agy\\bin\\agy.exe", args: ["acp"] },
};
const spec = SPECS[which];
if (!spec) {
  console.error("unknown agent:", which, "expected opencode|agy");
  process.exit(2);
}

const child = spawn(spec.command, spec.args, {
  cwd: process.cwd(),
  stdio: ["pipe", "pipe", "pipe"],
  windowsHide: true,
});

const pending = new Map();
let nextId = 1;
const updates = [];
let stderr = "";

const rl = readline.createInterface({ input: child.stdout });
rl.on("line", (line) => {
  let msg;
  try {
    msg = JSON.parse(line);
  } catch {
    return;
  }
  if (msg.id !== undefined && pending.has(msg.id)) {
    const { resolve, reject } = pending.get(msg.id);
    pending.delete(msg.id);
    if (msg.error) reject(new Error(JSON.stringify(msg.error)));
    else resolve(msg.result);
    return;
  }
  if (msg.method === "session/update") {
    const u = msg.params?.update;
    const kind = u?.sessionUpdate ?? "?";
    updates.push(kind);
    if (kind === "agent_message_chunk") {
      const text = u?.content?.text ?? "";
      process.stdout.write(text);
    } else {
      const extra = u?.toolCall ? `${u.toolCall.title ?? u.toolCall.kind ?? ""}` : "";
      console.error(`[update] ${kind}${extra ? " " + extra : ""}`);
    }
  }
});

child.stderr.on("data", (d) => {
  stderr += d.toString();
});

function request(method, params, timeoutMs = 60000) {
  const id = nextId++;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error(`timeout ${method}`));
    }, timeoutMs);
    pending.set(id, {
      resolve: (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      reject: (e) => {
        clearTimeout(timer);
        reject(e);
      },
    });
    child.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n");
  });
}

const t0 = Date.now();
try {
  const init = await request("initialize", {
    protocolVersion: 1,
    clientCapabilities: { fs: { readTextFile: false, writeTextFile: false } },
  });
  console.log(
    `[${which}] initialize ok: ${init.agentInfo?.name ?? "?"} ${init.agentInfo?.version ?? ""} ` +
      `loadSession=${init.agentCapabilities?.loadSession ?? false}`,
  );

  const session = await request("session/new", { cwd: process.cwd(), mcpServers: [] }, 90000);
  console.log(`[${which}] session: ${session.sessionId}`);

  const res = await request(
    "session/prompt",
    { sessionId: session.sessionId, prompt: [{ type: "text", text: prompt }] },
    180000,
  );
  console.log(`\n[${which}] done stopReason=${res.stopReason} updates=${updates.length} ms=${Date.now() - t0}`);
} catch (error) {
  console.error(`[${which}] FAILED: ${error.message}`);
  if (stderr) console.error(`[${which}] stderr: ${stderr.slice(-800)}`);
  process.exitCode = 1;
} finally {
  child.kill();
}
