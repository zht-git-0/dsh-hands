// 异步回传重试的纯函数测试：node acp/test-async-retry.mjs
// 只测状态机（投失败 → 排下一次 / 投成功 → 收工 / 次数用完 → failed），
// 真起进程、真 followup 不放在这里（那要走宿主）。
import assert from 'node:assert/strict'
import {
  ASYNC_DELIVERY_RETRY_DELAYS_MS,
  asyncDeliveryRetryDelay,
  nextAsyncDelivery,
  planAsyncRecovery,
} from '../index.js'

// ── 0) 默认退避表：30s / 90s / 240s ──────────────────────────────────────────
{
  assert.deepEqual(ASYNC_DELIVERY_RETRY_DELAYS_MS, [30000, 90000, 240000], '退避表固定为 3 档')
  assert.equal(asyncDeliveryRetryDelay(0), 30000, '第 1 次重试等 30s')
  assert.equal(asyncDeliveryRetryDelay(1), 90000, '第 2 次等 90s')
  assert.equal(asyncDeliveryRetryDelay(2), 240000, '第 3 次等 240s')
  assert.equal(asyncDeliveryRetryDelay(3), -1, '用完 3 次后没有下一次')
  assert.equal(asyncDeliveryRetryDelay(-1), -1, '负数不是合法 attempt')
  assert.equal(asyncDeliveryRetryDelay(1.5), -1, '小数不是合法 attempt')
  console.log('0) 退避表 ok')
}

// ── 1) 投递成功：直接 sent，不再排重试 ──────────────────────────────────────
{
  const now = 1000
  const r = nextAsyncDelivery({ deliveryAttempts: 2 }, 'sent', now)
  assert.equal(r.delivery, 'sent')
  assert.equal(r.attempts, 2, '成功不增加 attempt')
  assert.equal(r.retryAt, 0)
  assert.equal(r.exhausted, false)
  console.log('1) 成功收工 ok')
}

// ── 2) 第一次失败：排 30s 后重试，attempts 从 0 变 1 ─────────────────────────
{
  const now = 1000
  const r = nextAsyncDelivery({ deliveryAttempts: 0 }, 'failed', now)
  assert.equal(r.delivery, 'retrying')
  assert.equal(r.attempts, 1)
  assert.equal(r.retryAt, now + 30000)
  assert.equal(r.delayMs, 30000)
  assert.equal(r.exhausted, false)

  // 老记录没有 deliveryAttempts 字段，也按 0 算
  const legacy = nextAsyncDelivery({}, 'failed', now)
  assert.equal(legacy.delivery, 'retrying')
  assert.equal(legacy.attempts, 1)
  console.log('2) 首次失败排重试 ok')
}

// ── 3) 连续失败：30s → 90s → 240s → failed ──────────────────────────────────
{
  let now = 5000
  let record = { deliveryAttempts: 0 }
  const seen = []
  for (let i = 0; i < 4; i += 1) {
    const r = nextAsyncDelivery(record, 'failed', now)
    seen.push({ delivery: r.delivery, attempts: r.attempts, delayMs: r.delayMs })
    record = { deliveryAttempts: r.attempts, delivery: r.delivery }
    now = r.retryAt || now
  }
  assert.deepEqual(seen, [
    { delivery: 'retrying', attempts: 1, delayMs: 30000 },
    { delivery: 'retrying', attempts: 2, delayMs: 90000 },
    { delivery: 'retrying', attempts: 3, delayMs: 240000 },
    { delivery: 'failed', attempts: 3, delayMs: 0 },
  ])
  console.log('3) 三次退避后放弃 ok')
}

// ── 4) 自定义退避表（测试可注入短间隔）──────────────────────────────────────
{
  const now = 0
  assert.equal(nextAsyncDelivery({}, 'failed', now, [1000]).delivery, 'retrying', '1 档能排一次')
  assert.equal(nextAsyncDelivery({ deliveryAttempts: 1 }, 'failed', now, [1000]).delivery, 'failed', '1 档用完就 failed')
  console.log('4) 自定义退避表 ok')
}

// ── 5) 重启补投：没投出去的（含 retrying）仍会被重新排进队列 ─────────────────
{
  const state = {
    jobs: {
      'j-running': { id: 'j-running', startedAt: 1, delivery: 'pending' }, // 没跑完 → orphan
      'j-unsent': { id: 'j-unsent', startedAt: 2, endedAt: 'x', report: 'r', delivery: 'pending' },
      'j-retrying': { id: 'j-retrying', startedAt: 3, endedAt: 'x', report: 'r', delivery: 'retrying', deliveryAttempts: 1 },
      'j-failed': { id: 'j-failed', startedAt: 4, endedAt: 'x', report: 'r', delivery: 'failed', deliveryAttempts: 3 },
      'j-sent': { id: 'j-sent', startedAt: 5, endedAt: 'x', report: 'r', delivery: 'sent' },
    },
  }
  const plan = planAsyncRecovery(state)
  assert.deepEqual(plan.orphan, ['j-running'])
  assert.deepEqual(plan.deliver.sort(), ['j-failed', 'j-retrying', 'j-unsent'], 'sent 不补投，其余都补')
  console.log('5) 重启补投范围 ok')
}

console.log('ok')
