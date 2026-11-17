// 把一段开发任务派给 ACP agent，并把过程摘要打到 stdout。
// 用法：node acp/delegate.mjs <opencode|agy> <prompt-file>
import { readFileSync, writeFileSync } from "node:fs";
import { AcpClient } from "./client.mjs";

const agent = process.argv[2] || "opencode";
const promptFile = process.argv[3];
if (!promptFile) {
  console.error("usage: node acp/delegate.mjs <opencode|agy> <prompt-file>");
  process.exit(2);
}
const prompt = readFileSync(promptFile, "utf8");

const t0 = Date.now();
const client = new AcpClient(agent, { cwd: process.cwd() }).start();
let toolCount = 0;
try {
  const init = await client.initialize();
  console.log(`[delegate] ${agent}: ${init.agentInfo?.name} ${init.agentInfo?.version}`);
  await client.newSession();
  console.log(`[delegate] session=${client.sessionId}`);

  client.onUpdate = (update) => {
    const kind = update.sessionUpdate;
    if (kind === "agent_thought_chunk") {
      process.stdout.write(".");
    } else if (kind === "tool_call") {
      toolCount += 1;
      console.log(`\n[tool] ${update.title ?? update.kind ?? "?"}`);
    } else if (kind === "usage_update") {
      console.log(`\n[usage] ${JSON.stringify(update.usage)}`);
    }
  };

  const result = await client.prompt(prompt, 30 * 60000);
  const ms = Date.now() - t0;
  console.log(`\n[delegate] done stop=${result.stopReason} tools=${toolCount} ms=${ms}`);
  console.log("[delegate] answer:\n" + result.text);
  writeFileSync("acp/last-delegation.md", `# ${new Date().toISOString()} ${agent}\n\n${result.text}\n`, "utf8");
} catch (error) {
  console.error(`\n[delegate] FAILED: ${error.message}`);
  if (client.stderr) console.error(client.stderr.slice(-1500));
  process.exitCode = 1;
} finally {
  client.close();
}
