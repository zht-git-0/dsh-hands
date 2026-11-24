// /dsh-hands/async 观测口的路由测试：node acp/test-async-route.mjs
// 用假的 ctx 挂 apply()，把 webServer.register 的 handler 抓出来直接调用，
// 不碰正在跑的 DSH。
import assert from 'node:assert/strict'

const { apply } = await import('../index.js')

let handler = null
const ctx = {
  tools: { register: () => () => {} },
  webServer: {
    register(options) {
      if (options?.path === '/dsh-hands' && options.handler) handler = options.handler
      return () => {}
    },
  },
  effect: (fn) => {
    try {
      return fn()
    } catch {
      return () => {}
    }
  },
  get: () => undefined,
}

apply(ctx, {})
assert.ok(handler, '抓到了 /dsh-hands 的 handler')

async function call(path) {
  const res = {
    destroyed: false,
    writableEnded: false,
    headersSent: false,
    status: 0,
    body: '',
    writeHead(status) {
      this.status = status
      this.headersSent = true
    },
    end(body) {
      this.body = String(body ?? '')
      this.writableEnded = true
    },
  }
  await handler({ url: path, on() {} }, res)
  let json = null
  try {
    json = JSON.parse(res.body)
  } catch {
    json = null
  }
  return { status: res.status, json, raw: res.body }
}

// 1) 正常返回结构
{
  const r = await call('/dsh-hands/async')
  assert.equal(r.status, 200, `状态码 200，实际 ${r.status}`)
  assert.ok(r.json, '返回 JSON')
  assert.ok(Array.isArray(r.json.live), 'live 是数组')
  assert.ok(Array.isArray(r.json.persisted), 'persisted 是数组')
  assert.ok(r.json.counts && typeof r.json.counts.live === 'number', 'counts 里有 live')
  assert.equal(r.json.queue.session.limit, 3, '会话队列默认上限 3')
  assert.equal(typeof r.json.queue.session.waiting, 'number', '会话队列等待数')
  console.log('1) /dsh-hands/async 结构 ok')
}

// 2) n 参数能限制条数（这里只验参数不炸，真实条数看落盘文件）
{
  const r = await call('/dsh-hands/async?n=1')
  assert.equal(r.status, 200)
  assert.ok(r.json.persisted.length <= 1, 'n=1 最多一条')
  const r2 = await call('/dsh-hands/async?n=abc')
  assert.equal(r2.status, 200, 'n 不是数字也不炸')
  console.log('2) n 参数 ok')
}

// 3) 别的路径不该被这个分支吃掉
{
  const r = await call('/dsh-hands/nope')
  assert.notEqual(r.status, 200, '未知路径不该 200')
  console.log('3) 未知路径 ok')
}

console.log('ok')
