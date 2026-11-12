/**
 * Load client.js the way the browser module loader does, without a browser.
 *
 * `node --check` only proves the file parses. This actually runs the factory and
 * `apply`, which is where a bad hook order, a missing global, or a broken
 * registration would throw and take the whole web boot down.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const SRC = path.join(HERE, '..', 'client.js')
const source = fs.readFileSync(SRC, 'utf8')

const loads = []
const fakeWindow = {
  __ModuleLoader__: { load: (definition) => loads.push(definition) },
  localStorage: { getItem: () => null, setItem: () => {} },
  addEventListener: () => {},
  removeEventListener: () => {},
  setInterval: () => 0,
  clearInterval: () => {},
  setTimeout: () => 0,
  clearTimeout: () => {},
  innerWidth: 1400,
  getComputedStyle: () => ({ display: 'block', visibility: 'visible' }),
}

const fakeDocument = {
  querySelector: () => null,
  querySelectorAll: () => [],
  body: {},
  documentElement: { style: { setProperty() {}, removeProperty() {} } },
}

new Function('window', 'document', 'navigator', source)(fakeWindow, fakeDocument, { language: 'zh-CN' })

if (loads.length !== 1) throw new Error(`expected one module load, got ${loads.length}`)
const definition = loads[0]
console.log('module id:', definition.id)

const React = {
  createElement: (type) => ({ type }),
  useState: (initial) => [typeof initial === 'function' ? initial() : initial, () => {}],
  useEffect: () => {},
  useRef: (initial) => ({ current: initial }),
  Fragment: 'Fragment',
}
const ReactDOM = { createPortal: () => null }

const mod = definition.factory((name) => {
  if (name === 'react') return React
  if (name === 'react-dom') return ReactDOM
  throw new Error('unexpected require: ' + name)
})
console.log('exports:', Object.keys(mod).join(', '))
console.log('inject:', JSON.stringify(mod.inject))

const registered = []
const ctx = {
  effect: (callback) => {
    const dispose = callback()
    return typeof dispose === 'function' ? dispose : () => {}
  },
  locale: { register: () => () => {} },
  slots: {
    inject: (key, callback) => {
      callback()
      return () => {}
    },
    register: (options) => {
      registered.push(options.id ?? options.name)
      return () => {}
    },
  },
}

mod.apply(ctx)
console.log('registered slots:', registered.join(', '))
console.log('VERIFY OK')
