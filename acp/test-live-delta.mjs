// computeLiveDelta 纯函数测试：node acp/test-live-delta.mjs
// 只喂字符串，不起服务、不碰日志；跑通最后打印 ok。
import assert from 'node:assert/strict'
import { computeLiveDelta } from '../index.js'

// 1) 空串：没有增量，next 停在 0
assert.deepEqual(computeLiveDelta('', 0), { delta: '', next: 0, changed: false })
assert.deepEqual(computeLiveDelta(null, 0), { delta: '', next: 0, changed: false })
assert.deepEqual(computeLiveDelta(undefined, 5), { delta: '', next: 0, changed: false })

// 2) 第一次全发
assert.deepEqual(computeLiveDelta('hello', 0), { delta: 'hello', next: 5, changed: true })
assert.deepEqual(computeLiveDelta('hello', -10), { delta: 'hello', next: 5, changed: true })

// 3) 两次增量不重复：第二次从上一帧的 next 起，只拿新增那段
let text = 'hello'
const first = computeLiveDelta(text, 0)
assert.equal(first.delta, 'hello')
assert.equal(first.next, 5)
text += ' world'
const second = computeLiveDelta(text, first.next)
assert.equal(second.delta, ' world')
assert.equal(second.next, 11)
assert.equal(second.changed, true)
// 再问一次同样的 next：没有新内容
const again = computeLiveDelta(text, second.next)
assert.deepEqual(again, { delta: '', next: 11, changed: false })

// 4) sentLength 越界（磁盘上的全文变短）要夹到 [0, text.length]，next 不能超过长度
assert.deepEqual(computeLiveDelta('abc', 99), { delta: '', next: 3, changed: false })
assert.deepEqual(computeLiveDelta('abc', Infinity), { delta: '', next: 3, changed: false })
assert.deepEqual(computeLiveDelta('abc', NaN), { delta: 'abc', next: 3, changed: true })

// 5) 非整数 / 字符串偏移也认，统一向下取整
assert.deepEqual(computeLiveDelta('abcdef', 2.9), { delta: 'cdef', next: 6, changed: true })
assert.deepEqual(computeLiveDelta('abcdef', '2'), { delta: 'cdef', next: 6, changed: true })

// 6) 中文按同一套 UTF-16 下标切片，不拆字
const zh = '你好世界'
const zhFirst = computeLiveDelta(zh, 0)
const zhSecond = computeLiveDelta(zh + '！', zhFirst.next)
assert.equal(zhSecond.delta, '！')
assert.equal(zhSecond.next, 5)

// 7) next 永远等于 起点 + 增量长度（前端直接拿 next 当下一帧 from）
for (const [value, sent] of [['', 0], ['x', 0], ['xyz', 2], ['xyz', 3], ['xyz', 100]]) {
  const out = computeLiveDelta(value, sent)
  const base = Math.min(Math.max(Math.trunc(Number(sent)) || 0, 0), value.length)
  assert.equal(out.next, base + out.delta.length)
  assert.equal(out.changed, out.delta.length > 0)
}

console.log('ok')
