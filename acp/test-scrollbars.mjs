// 滚动条与 turn 导航刻度契约：两者分离，刻度按轮次跳转。
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'

const clientFile = fileURLToPath(new URL('../client.js', import.meta.url))
const source = fs.readFileSync(clientFile, 'utf8')
const cssMatch = source.match(/const V2_CSS = `([\s\S]*?)`;/)
assert.ok(cssMatch, 'V2_CSS exists')
const css = cssMatch[1]
for (const selector of ['.dsh-hands-v2-list', '.dsh-hands-v2-threadBody']) {
  assert.match(css, new RegExp(`${selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[^{]*\\{[^}]*scrollbar-width:\\s*thin`), `${selector} 使用细滚动条`)
  assert.match(css, /::-webkit-scrollbar-thumb/, 'WebKit 滚动条 thumb 有独立样式')
}
assert.match(css, /data-scrolling=true/, '滚动时有变亮状态')
assert.doesNotMatch(css, /dsh-hands-scrollMarker/, '装饰性百分比标记已移除')
assert.match(css, /dsh-hands-v2-turnTickBar/, 'turn 刻度条有独立样式')
assert.match(css, /dsh-hands-v2-turnTickTooltip/, '刻度 tooltip 有独立样式')

globalThis.window = { __ModuleLoader__: { load(def) { globalThis.__def = def } } }
await import('../client.js')
const ReactStub = {
  createElement(type, props, ...children) { return { type, props, children } },
  useCallback(fn) { return fn },
  useEffect() {},
  useLayoutEffect() {},
  useMemo(fn) { return fn() },
  useRef(value) { return { current: value } },
  useState(value) { return [value, () => {}] },
  useSyncExternalStore() { return null },
}
const mod = globalThis.__def.factory((name) => {
  if (name === 'react') return ReactStub
  throw new Error(`unexpected require: ${name}`)
})
assert.equal(typeof mod.buildTurnTicks, 'function')
assert.equal(typeof mod.turnTickSummary, 'function')
assert.equal(typeof mod.scrollToTurnElement, 'function')

const turns = Array.from({ length: 100 }, (_, index) => ({
  id: `t${index}`,
  startedAt: new Date(Date.UTC(2026, 0, 1, 0, index)).toISOString(),
  prompt: `第 ${index + 1} 轮\n第二行`,
}))
const ticks = mod.buildTurnTicks(turns, { currentId: 't50', maxTicks: 24 })
assert.ok(ticks.length <= 25, '刻度太多时抽稀，最多额外保留当前轮')
assert.equal(ticks[0].id, 't0')
assert.equal(ticks.at(-1).id, 't99')
assert.ok(ticks.some((tick) => tick.id === 't50' && tick.current))
for (let index = 1; index < ticks.length; index += 1) assert.ok(ticks[index].percent >= ticks[index - 1].percent)
assert.equal(mod.turnTickSummary({ prompt: '第一行摘要\n第二行' }), '第一行摘要')
assert.equal(mod.turnTickSummary({ prompt: 'x'.repeat(50) }).length, 31)

const list = { clientHeight: 200, scrollTop: 100 }
const target = { height: 80, getBoundingClientRect: () => ({ top: 500, height: 80 }) }
list.getBoundingClientRect = () => ({ top: 100 })
mod.scrollToTurnElement(list, target)
assert.equal(list.scrollTop, 440)

const jumps = [];
const tree = mod.TurnTickBar({ turns, selectedTurnId: 't50', t: (key) => key, onJump: (id) => jumps.push(id) })
const buttons = tree.children[0].children.flat(Infinity).filter((node) => node?.type === 'button')
assert.ok(buttons.length <= 25)
assert.ok(buttons.every((button) => button.props.type === 'button'))
assert.ok(buttons.some((button) => button.props['data-current'] === 'true'))
assert.ok(buttons.every((button) => button.props['aria-label']))
const third = buttons[2]
third.props.onClick()
assert.deepEqual(jumps, [third.props['data-turn-id']])
console.log('scrollbar and turn tick contract ok')
