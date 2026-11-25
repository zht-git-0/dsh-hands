// 滚动条与位置标记契约：细滚动条 + 滚动变亮 + 顶部/中部/底部可解释位置。
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
assert.match(css, /dsh-hands-v2-scrollShell/, '滚动容器有定位外壳')
assert.match(css, /dsh-hands-scrollMarker/, '位置标记有样式')
assert.match(css, /data-scrolling=true/, '滚动时有变亮状态')

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
assert.equal(typeof mod.scrollMarkerState, 'function')
assert.deepEqual(mod.scrollMarkerState({ scrollTop: 0, scrollHeight: 1000, clientHeight: 200 }), {
  scrollable: true, percent: 0, atTop: true, atBottom: false,
})
assert.deepEqual(mod.scrollMarkerState({ scrollTop: 400, scrollHeight: 1000, clientHeight: 200 }), {
  scrollable: true, percent: 50, atTop: false, atBottom: false,
})
assert.deepEqual(mod.scrollMarkerState({ scrollTop: 800, scrollHeight: 1000, clientHeight: 200 }), {
  scrollable: true, percent: 100, atTop: false, atBottom: true,
})
assert.deepEqual(mod.scrollMarkerState({ scrollTop: 0, scrollHeight: 100, clientHeight: 100 }), {
  scrollable: false, percent: 0, atTop: true, atBottom: true,
})
const area = mod.ScrollArea({ className: 'demo-scroll', t: (key) => key }, 'content')
assert.equal(area.props.className, 'dsh-hands-v2-scrollShell')
assert.equal(area.children[0].props.className, 'demo-scroll')
assert.equal(area.children[1].type, mod.ScrollMarker)
console.log('scrollbar contract ok')
