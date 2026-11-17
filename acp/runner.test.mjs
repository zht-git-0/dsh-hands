// runner 真机测试：node acp/runner.test.mjs
// 会真的起 opencode acp（两轮各一个进程，第二轮走 session/load 恢复），几秒到十几秒。
import test, { after } from "node:test";
import assert from "node:assert/strict";
import { runAcpTask, createAcpSession } from "./runner.mjs";

const cwd = process.cwd();
const TURN_TIMEOUT_MS = 180000;

// usage 形状各家不一；只要有任何 token 数字段就求和，没有就返回 null（跳过断言）
function tokenCount(usage) {
  if (!usage || typeof usage !== "object") return null;
  let sum = 0;
  let found = false;
  for (const [key, value] of Object.entries(usage)) {
    if (/token/i.test(key) && typeof value === "number" && Number.isFinite(value)) {
      sum += value;
      found = true;
    }
  }
  return found ? sum : null;
}

test("opencode 两轮同会话：记住暗号 → resume 后只答暗号", async () => {
  const kinds = new Set();
  const r1 = await runAcpTask({
    agent: "opencode",
    cwd,
    prompt: "记住一个暗号：蓝鲸-42。只回复「记住了」。",
    timeoutMs: TURN_TIMEOUT_MS,
    onUpdate: (update) => kinds.add(update?.sessionUpdate),
  });
  assert.equal(r1.ok, true, `第一轮失败: ${r1.error}`);
  assert.ok(r1.sessionId, "第一轮应拿到 sessionId");
  assert.ok(kinds.has("agent_message_chunk"), `onUpdate 应收到消息块，实际: ${[...kinds].join(",")}`);
  console.log(`turn1 ok session=${r1.sessionId} ms=${r1.ms} text=${JSON.stringify(r1.text)}`);

  const r2 = await runAcpTask({
    agent: "opencode",
    cwd,
    prompt: "刚才的暗号是什么？只回答暗号本身。",
    sessionId: r1.sessionId,
    timeoutMs: TURN_TIMEOUT_MS,
  });
  assert.equal(r2.ok, true, `第二轮失败: ${r2.error}`);
  assert.equal(r2.sessionId, r1.sessionId, "两轮 sessionId 应一致");
  assert.equal(r2.resumed, true, "第二轮应恢复会话而不是新建");
  assert.ok(r2.text.includes("蓝鲸-42"), `第二轮文本应包含暗号，实际: ${JSON.stringify(r2.text)}`);
  console.log(`turn2 ok resumed=${r2.resumed} ms=${r2.ms} text=${JSON.stringify(r2.text)}`);

  const tokens = tokenCount(r2.usage) ?? tokenCount(r1.usage);
  if (tokens !== null) {
    assert.ok(tokens > 0, `token 数应 > 0，实际: ${tokens}`);
    console.log(`usage tokens=${tokens}`);
  } else {
    console.log(`usage 无 token 字段，跳过断言: ${JSON.stringify(r2.usage)}`);
  }
});

test("createAcpSession：开会话 → prompt → close", async () => {
  const session = await createAcpSession({ agent: "opencode", cwd });
  try {
    assert.ok(session.sessionId, "应拿到 sessionId");
    const r = await session.prompt("回答两个字：收到", { timeoutMs: TURN_TIMEOUT_MS });
    assert.ok(r.text.length > 0, "应有回复文本");
    assert.ok(r.stopReason, "应有 stopReason");
    console.log(`session ok id=${session.sessionId} stop=${r.stopReason} text=${JSON.stringify(r.text)}`);
  } finally {
    session.close();
  }
});

after(() => {
  if (!process.exitCode) console.log("ok");
});
