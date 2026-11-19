// ACP 权限应答测试：node acp/test-permission.mjs
// 只测 RunnerClient._onRequest 的策略分支（静态 allow/reject、函数回调、回调抛错），
// 不真的起 agent 进程。
import assert from 'node:assert/strict'
import { RunnerClient } from './runner.mjs'

const wait = () => new Promise((resolve) => setTimeout(resolve, 5))

function makeClient(permission) {
  const client = new RunnerClient('opencode', { permission })
  const written = []
  client._write = (obj) => written.push(obj)
  return { client, written }
}

// ── 1) 函数策略 allow：选 allow_once ───────────────────────────────────────
{
  const { client, written } = makeClient(async () => 'allow')
  client._onRequest({
    id: 1,
    method: 'session/request_permission',
    params: { options: [{ kind: 'allow_once', optionId: 'o1' }] },
  })
  await wait()
  assert.equal(written.length, 1)
  assert.deepEqual(written[0].result, { outcome: { outcome: 'selected', optionId: 'o1' } })
  console.log('1) 函数 allow ok')
}

// ── 2) 函数策略 reject：cancelled ──────────────────────────────────────────
{
  const { client, written } = makeClient(async () => 'reject')
  client._onRequest({
    id: 2,
    method: 'session/request_permission',
    params: { options: [{ kind: 'allow_once', optionId: 'o1' }] },
  })
  await wait()
  assert.deepEqual(written[0].result, { outcome: { outcome: 'cancelled' } })
  console.log('2) 函数 reject ok')
}

// ── 3) 回调抛错：fail-closed（cancelled）───────────────────────────────────
{
  const { client, written } = makeClient(async () => {
    throw new Error('panel timeout')
  })
  client._onRequest({
    id: 3,
    method: 'session/request_permission',
    params: { options: [{ kind: 'allow_once', optionId: 'o1' }] },
  })
  await wait()
  assert.deepEqual(written[0].result, { outcome: { outcome: 'cancelled' } })
  console.log('3) 回调异常按拒绝 ok')
}

// ── 4) 静态策略：allow 优先选 allow_always ─────────────────────────────────
{
  const { client, written } = makeClient('allow')
  client._onRequest({
    id: 4,
    method: 'session/request_permission',
    params: {
      options: [
        { kind: 'allow_once', optionId: 'once' },
        { kind: 'allow_always', optionId: 'always' },
      ],
    },
  })
  assert.deepEqual(written[0].result, { outcome: { outcome: 'selected', optionId: 'always' } })
  console.log('4) 静态 allow 优先 always ok')
}

// ── 5) 静态 reject ─────────────────────────────────────────────────────────
{
  const { client, written } = makeClient('reject')
  client._onRequest({
    id: 5,
    method: 'session/request_permission',
    params: { options: [{ kind: 'allow_once', optionId: 'o1' }] },
  })
  assert.deepEqual(written[0].result, { outcome: { outcome: 'cancelled' } })
  console.log('5) 静态 reject ok')
}

console.log('ok')
