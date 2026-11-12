/**
 * Exercise the portrait emotion rules by loading them out of client.js.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const SRC = path.join(HERE, '..', 'client.js')
const source = fs.readFileSync(SRC, 'utf8')

const start = source.indexOf('const SIGNALS =')
const end = source.indexOf('function blocksToText')
if (start < 0 || end < 0) throw new Error('cannot locate the emotion engine')

const detect = new Function(source.slice(start, end) + '\nreturn detectEmotion;')()

const cases = [
  ['好耶！终于搞定了喵！', 'excited'],
  ['呜……对不起，本喵搞错了', 'sad'],
  ['可恶！主人又说本喵是钢板', 'angry'],
  ['诶？真的吗，主人居然记得', 'surprised'],
  ['嘿嘿，主人再多说一句嘛', 'shy'],
  ['让我想想……先看看日志里的报错', 'thinking'],
  ['主人今天是不是又熬夜了喵', 'sleepy'],
  ['好', 'neutral'],
  ['', 'neutral'],
  ['这里改好了，主人刷新一下～', 'neutral'],
  ['可恶，这个 bug 又来了……算了，先排查', 'angry'],
  ['本喵有个好消息：全部测试通过，太好了！', 'happy'],
]

let failed = 0
for (const [text, expected] of cases) {
  const actual = detect(text)
  const ok = actual === expected
  if (!ok) failed++
  console.log(`${ok ? 'PASS' : 'FAIL'}  expect=${expected.padEnd(9)} got=${String(actual).padEnd(9)} ${JSON.stringify(text)}`)
}
console.log(failed === 0 ? '\nall cases passed' : `\n${failed} case(s) failed`)
process.exit(failed === 0 ? 0 : 1)
