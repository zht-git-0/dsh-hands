// 把一段开发任务派给 ACP agent，并把过程摘要打到 stdout。
// 用法：node acp/delegate.mjs <opencode|agy|codex|claude> <prompt-file> [model]
// 例：node acp/delegate.mjs opencode acp/task-step2.md deepseek/deepseek-flash
import { readFileSync, writeFileSync } from "node:fs";
import { runAcpTask } from "./runner.mjs";

const agent = process.argv[2] || "opencode";
const promptFile = process.argv[3];
const model = process.argv[4] || process.env.ACP_MODEL || "";
if (!promptFile) {
  console.error("usage: node acp/delegate.mjs <agent> <prompt-file> [model]");
  process.exit(2);
}
const prompt = readFileSync(promptFile, "utf8");

let toolCount = 0;
const r = await runAcpTask({
  agent,
  cwd: process.cwd(),
  prompt,
  model: model || undefined,
  timeoutMs: 30 * 60 * 1000,
  permission: "allow",
  onUpdate: (update) => {
    const kind = update.sessionUpdate;
    if (kind === "agent_thought_chunk") process.stdout.write(".");
    else if (kind === "tool_call") {
      toolCount += 1;
      console.log(`\n[tool] ${update.title ?? update.kind ?? "?"}`);
    } else if (kind === "usage_update" && update.usage) {
      process.stdout.write(`\n[usage] ${JSON.stringify(update.usage)}\n`);
    }
  },
});

console.log(
  `\n[delegate] ${agent}${model ? "@" + model : ""} ok=${r.ok} stop=${r.stopReason} tools=${toolCount} ms=${r.ms}` +
    (r.error ? `\nerror: ${r.error}` : ""),
);
if (r.text) {
  console.log("[delegate] answer tail:\n" + r.text.slice(-1200));
  writeFileSync("acp/last-delegation.md", `# ${new Date().toISOString()} ${agent} ${model}\n\n${r.text}\n`, "utf8");
}
process.exitCode = r.ok ? 0 : 1;
