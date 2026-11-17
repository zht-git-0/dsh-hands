// 四家 ACP 冒烟：node acp/four-agents.mjs
// 一次性把 opencode / agy / codex / claude 各跑一句，打印 ok/耗时/回复。
import { runAcpTask } from "./runner.mjs";

const AGENTS = ["opencode", "agy", "codex", "claude"];
const prompt = process.argv[2] || "只回复两个字：收到";

let failed = 0;
for (const agent of AGENTS) {
  const t0 = Date.now();
  const r = await runAcpTask({ agent, cwd: process.cwd(), prompt, timeoutMs: 240000 });
  const ms = Date.now() - t0;
  if (r.ok) {
    console.log(`✔ ${agent.padEnd(8)} ${String(ms).padStart(6)}ms  text=${JSON.stringify(r.text).slice(0, 40)} model=${r.usage?.currentModelId ?? ""}`);
  } else {
    failed += 1;
    console.log(`✘ ${agent.padEnd(8)} ${String(ms).padStart(6)}ms  error=${r.error}`);
  }
}
console.log(failed ? `failed=${failed}` : "all ok");
process.exitCode = failed ? 1 : 0;
