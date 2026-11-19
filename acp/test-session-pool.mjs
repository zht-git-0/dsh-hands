// ACP 常驻会话池测试：node acp/test-session-pool.mjs
// 只测池子的复用/关闭/闲置回收，不真的起子进程。
import assert from 'node:assert/strict'
import { createAcpSessionPool } from './session-pool.mjs'

// ── 1) 同 key 复用：create 只调一次，holder 共享 ────────────────────────────
{
  const closed = []
  const pool = createAcpSessionPool({ close: (handle) => closed.push(handle) })
  let created = 0
  const slot1 = await pool.acquire('hand|cwd|sid', async (slot) => {
    created += 1
    return { id: 'h1', holder: slot.holder }
  })
  const slot2 = await pool.acquire('hand|cwd|sid', async () => {
    created += 1
    return { id: 'h2' }
  })
  assert.equal(created, 1, '第二个 acquire 不重建')
  assert.equal(slot1, slot2, '返回同一个 slot')
  assert.equal(pool.size(), 1)
  slot1.holder.current = 'run-1'
  assert.equal(slot2.holder.current, 'run-1', 'holder 是共享的，onUpdate 能转到当轮')
  assert.deepEqual(closed, [])
  console.log('1) 复用 ok')
}

// ── 2) release 会关掉句柄并移除 ────────────────────────────────────────────
{
  const closed = []
  const pool = createAcpSessionPool({ close: (handle) => closed.push(handle) })
  const slot = await pool.acquire('k', async () => ({ id: 'h' }))
  assert.equal(pool.release('k'), true)
  assert.equal(pool.size(), 0)
  assert.deepEqual(closed, [slot.handle])
  assert.equal(pool.release('k'), false, '重复 release 返回 false')
  console.log('2) release ok')
}

// ── 3) sweep 按闲置时间回收 ────────────────────────────────────────────────
{
  let clock = 0
  const closed = []
  const pool = createAcpSessionPool({ close: (handle) => closed.push(handle), idleMs: 1000, now: () => clock })
  await pool.acquire('a', async () => ({ id: 'ha' }))
  clock = 500
  await pool.acquire('b', async () => ({ id: 'hb' }))
  clock = 1200
  assert.equal(pool.size(), 2, 'a 闲置 1200ms、b 闲置 700ms')
  assert.equal(pool.sweep(), 1, '只回收 a')
  assert.deepEqual(closed.map((h) => h.id), ['ha'])
  assert.deepEqual(pool.keys(), ['b'])
  console.log('3) sweep ok')
}

// ── 4) touch 会续命；closeAll 全关 ─────────────────────────────────────────
{
  let clock = 0
  const closed = []
  const pool = createAcpSessionPool({ close: (handle) => closed.push(handle), idleMs: 1000, now: () => clock })
  await pool.acquire('a', async () => ({ id: 'ha' }))
  clock = 900
  pool.touch('a')
  clock = 1500
  assert.equal(pool.sweep(), 0, 'touch 后续命')
  pool.closeAll()
  assert.equal(pool.size(), 0)
  assert.deepEqual(closed.map((h) => h.id), ['ha'])
  console.log('4) touch/closeAll ok')
}

// ── 5) factory 抛错不留脏条目 ──────────────────────────────────────────────
{
  const pool = createAcpSessionPool({ close: () => {} })
  await assert.rejects(
    pool.acquire('bad', async () => {
      throw new Error('spawn failed')
    }),
    /spawn failed/,
  )
  assert.equal(pool.size(), 0, '失败的会话不进池子')
  console.log('5) 失败不留脏 ok')
}

console.log('ok')
