// withHealthCache 纯逻辑测试：node acp/test-health.mjs
// 不真的起 http / 不真的 spawn 探测进程：注入 fake fn + fake 时钟，
// 只验证「30s 内命中缓存」「并发共享同一个 in-flight」「失败不缓存」。
import assert from 'node:assert/strict'
import { withHealthCache } from '../index.js'

function fakeClock(start = 1000) {
  let now = start
  return {
    now: () => now,
    tick: (ms) => {
      now += ms
    },
  }
}

// 1) 首次调用走 fn，TTL 内不再走；过期后重新走
{
  const clock = fakeClock()
  let calls = 0
  const cached = withHealthCache(
    async () => {
      calls += 1
      return { hits: calls }
    },
    { ttlMs: 30000, now: clock.now },
  )

  const a = await cached()
  assert.equal(calls, 1)
  assert.deepEqual(a, { hits: 1 })
  assert.deepEqual(await cached(), { hits: 1 })
  assert.equal(calls, 1, 'TTL 内必须命中缓存')

  clock.tick(29999)
  await cached()
  assert.equal(calls, 1, 'TTL 边界内仍然命中缓存')

  clock.tick(1)
  const b = await cached()
  assert.equal(calls, 2, '超过 30s 要重新探测')
  assert.deepEqual(b, { hits: 2 })
}

// 2) 并发请求共享同一个 in-flight Promise
{
  const clock = fakeClock()
  let calls = 0
  let release
  const gate = new Promise((resolve) => {
    release = resolve
  })
  const cached = withHealthCache(
    async () => {
      calls += 1
      await gate
      return { hits: calls }
    },
    { ttlMs: 30000, now: clock.now },
  )

  const p1 = cached()
  const p2 = cached()
  const p3 = cached()
  assert.equal(calls, 1, '三个并发只该起一份探测')
  release()
  const results = await Promise.all([p1, p2, p3])
  assert.deepEqual(results, [{ hits: 1 }, { hits: 1 }, { hits: 1 }])
  assert.equal(calls, 1)
}

// 3) 失败不写缓存：下一次还能重试
{
  const clock = fakeClock()
  let calls = 0
  const cached = withHealthCache(
    async () => {
      calls += 1
      if (calls === 1) throw new Error('boom')
      return { ok: true }
    },
    { ttlMs: 30000, now: clock.now },
  )

  await assert.rejects(() => cached(), /boom/)
  assert.equal(cached.peek(), null, '失败不能留下缓存')
  assert.deepEqual(await cached(), { ok: true })
  assert.equal(calls, 2)
  // 失败后 in-flight 已经放开，不会卡住后续请求
  assert.deepEqual(await cached(), { ok: true })
  assert.equal(calls, 2)
}

// 4) peek 只看缓存、不触发探测；reset 清空
{
  const clock = fakeClock()
  let calls = 0
  const cached = withHealthCache(
    async () => {
      calls += 1
      return { agents: {} }
    },
    { ttlMs: 30000, now: clock.now },
  )

  assert.equal(cached.peek(), null)
  assert.equal(calls, 0, 'peek 不能触发探测')
  await cached()
  assert.equal(calls, 1)
  assert.deepEqual(cached.peek(), { at: 1000, value: { agents: {} } })
  cached.reset()
  assert.equal(cached.peek(), null)
  await cached()
  assert.equal(calls, 2, 'reset 之后下一次要重新探测')
}

console.log('ok')
