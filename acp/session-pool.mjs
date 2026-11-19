// ACP 常驻会话池：同一个 key（agent + cwd + 会话 id）复用同一个子进程，
// 连续几轮 prompt 不用每次重新握手/载入历史。纯 ESM，create/close 由调用方注入，方便单测。
//
// 生命周期：
//   acquire(key, factory) 取（没有就用 factory 建，factory 收到 slot 可以把当轮 run 挂到 slot.holder）
//   release(key)          主动关掉并移除
//   sweep()               关掉闲置超过 idleMs 的
//   closeAll()            插件卸载时全关
export function createAcpSessionPool({ create, close, idleMs = 10 * 60 * 1000, now = Date.now } = {}) {
  const entries = new Map();
  const ttl = Math.max(1000, Number(idleMs) || 10 * 60 * 1000);

  function release(key) {
    const entry = entries.get(key);
    if (!entry) return false;
    entries.delete(key);
    try {
      if (typeof close === "function") close(entry.handle);
      else entry.handle?.close?.();
    } catch {
      /* 关不掉也不能把清理流程弄崩 */
    }
    return true;
  }

  return {
    async acquire(key, factory) {
      const existing = entries.get(key);
      if (existing) {
        existing.lastUsed = now();
        return existing;
      }
      const slot = { key, handle: null, holder: { current: null }, createdAt: now(), lastUsed: now() };
      if (typeof factory !== "function" && typeof create !== "function") {
        throw new Error("acquire() needs a factory (or a create option)");
      }
      const creator = typeof factory === "function" ? factory : () => create(slot);
      slot.handle = await creator(slot);
      entries.set(key, slot);
      return slot;
    },
    touch(key) {
      const entry = entries.get(key);
      if (entry) entry.lastUsed = now();
    },
    release,
    sweep() {
      let closed = 0;
      for (const [key, entry] of [...entries]) {
        if (now() - entry.lastUsed >= ttl) {
          if (release(key)) closed += 1;
        }
      }
      return closed;
    },
    size() {
      return entries.size;
    },
    keys() {
      return [...entries.keys()];
    },
    closeAll() {
      for (const key of [...entries.keys()]) release(key);
    },
  };
}
