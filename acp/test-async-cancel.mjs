// 排队期取消的纯函数测试：node acp/test-async-cancel.mjs
// 只测 createAsyncQueue 的 run(start, key)/cancel(key) 语义，不起进程、不碰 HTTP。
import assert from 'node:assert/strict'
import { createAsyncQueue } from '../index.js'

const tick = () => new Promise((resolve) => setTimeout(resolve, 0))

// ── 1) 取消排队中的任务：start 不执行、promise 立刻得到 cancelled、waiting 减一 ──
{
  const q = createAsyncQueue(1)
  let release
  const gate = new Promise((resolve) => {
    release = resolve
  })
  const ran = []
  const first = q.run(async () => {
    await gate
    ran.push('first')
    return 'first'
  }, 'j-first')
  const second = q.run(async () => {
    ran.push('second')
    return 'second'
  }, 'j-second')

  assert.deepEqual(q.stats(), { limit: 1, active: 1, waiting: 1 }, '第二个在排队')
  assert.equal(q.cancel('j-second'), true, '排队中的能取消')
  assert.deepEqual(await second, { cancelled: true }, '取消后 promise 以 cancelled 结算')
  assert.deepEqual(q.stats(), { limit: 1, active: 1, waiting: 0 }, 'waiting 立即减少')

  release()
  assert.equal(await first, 'first')
  await tick()
  assert.deepEqual(ran, ['first'], '被取消的任务 start 一次都没跑')
  console.log('1) 取消排队中的任务 ok')
}

// ── 2) 取消不存在 / 正在跑的 key：都返回 false，不谎报 ──────────────────────
{
  const q = createAsyncQueue(2)
  let release
  const gate = new Promise((resolve) => {
    release = resolve
  })
  const running = q.run(async () => {
    await gate
    return 'ok'
  }, 'j-active')

  assert.equal(q.cancel('j-nope'), false, '不存在的 key')
  assert.equal(q.cancel('j-active'), false, '已在跑的不能从队列层取消（进程由 /cancel 杀）')
  release()
  assert.equal(await running, 'ok')
  await tick() // 等队列 finally 把 active 减回来
  assert.deepEqual(q.stats(), { limit: 2, active: 0, waiting: 0 })
  console.log('2) 非法取消不谎报 ok')
}

// ── 3) 取消中间项不影响 FIFO：a → c，b 被摘掉 ──────────────────────────────
{
  const q = createAsyncQueue(1)
  let release
  const gate = new Promise((resolve) => {
    release = resolve
  })
  const order = []
  const a = q.run(async () => {
    await gate
    order.push('a')
  }, 'a')
  const b = q.run(async () => {
    order.push('b')
  }, 'b')
  const c = q.run(async () => {
    order.push('c')
  }, 'c')

  assert.deepEqual(q.stats(), { limit: 1, active: 1, waiting: 2 })
  assert.equal(q.cancel('b'), true)
  release()
  await a
  await c
  await tick()
  assert.deepEqual(order, ['a', 'c'], 'b 被摘掉后剩下的顺序不变')
  assert.deepEqual(await b, { cancelled: true })
  console.log('3) 取消后 FIFO 不乱 ok')
}

// ── 4) 不带 key 的旧调用不受影响 ───────────────────────────────────────────
{
  const q = createAsyncQueue(1)
  const one = q.run(async () => 'one')
  const two = q.run(async () => 'two')
  assert.equal(await one, 'one')
  assert.equal(await two, 'two')
  await tick()
  assert.deepEqual(q.stats(), { limit: 1, active: 0, waiting: 0 })
  console.log('4) 旧调用兼容 ok')
}

console.log('ok')
