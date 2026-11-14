/**
 * Summarise every stored session from its log and write (or refresh) the
 * per-conversation memory file.
 *
 * Only fills the mechanical parts — date, workspace, the opening request and the
 * closing exchange — so a memory file starts with real content instead of a bare
 * template. The agent still owns the judgement calls (progress, blockers, mood).
 */
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { decompressFrames, parseEvents } from './read-session.mjs'

const ROOT = path.join(os.homedir(), '.dsh', 'sessions')
const ROLES = path.join(os.homedir(), '.dsh', 'roles', 'nyan-reply', 'sessions')
const CURRENT = process.env.DSH_SESSION_ID || ''

const WS_LABEL = {
  '--C-Users-Kolobanov-Documents-deepseek-harness-default-workspace--': '默认工作区',
  '--E-~5DE5~7A0B~6587~4EF6-U3D-kolobanov_group--': 'U3D 工程文件 · kolobanov_group',
}

const INJECTION_MARKERS = [
  'Time sampled while preparing',
  'Untrusted reference material',
  'Current runtime context',
  'Current DSH file policy',
  'You are an AI agent powered by',
  'Available knowledge bases',
  'You are a coding agent',
  'Tokens prefixed with @',
  '# 你是谁',
  '## 〇、本喵长什么样',
]

const NOISE_LINE = [
  /^>>>/,
  /\[source:/,
  /baseId=/,
  /^```/,
  /^\s*\|\s/,
  /^来源：/,
  /^\s*来源:/,
  /^The user changed the approval policy/,
]

function cleanText(raw) {
  const lines = String(raw).split('\n')
  const kept = []
  let dropping = false
  for (const line of lines) {
    const hit = INJECTION_MARKERS.some((marker) => line.includes(marker))
    if (hit) {
      dropping = true
      continue
    }
    if (dropping && line.trim() === '') {
      dropping = false
      continue
    }
    if (dropping) continue
    if (NOISE_LINE.some((pattern) => pattern.test(line))) continue
    kept.push(line)
  }
  return kept.join('\n').trim()
}

function blocksText(blocks) {
  if (!Array.isArray(blocks)) return ''
  return blocks
    .filter((block) => block && block.type === 'text' && typeof block.text === 'string')
    .map((block) => block.text)
    .join('\n')
}

function textOf(event) {
  const data = event && event.data
  if (!data) return ''
  // assistant messages nest their content one level deeper
  const nested = data.message && data.message.content
  const direct = data.content
  const raw = blocksText(nested) || blocksText(direct) || (typeof data.text === 'string' ? data.text : '')
  return cleanText(raw)
}

function clip(text, limit) {
  const flat = text.replace(/\s+/g, ' ').trim()
  return flat.length > limit ? flat.slice(0, limit) + '…' : flat
}

function summarise(events, logFile) {
  const userTurns = events.filter((event) => event.type === 'user/message')
  const assistantTurns = events.filter((event) => event.type === 'assistant/message')
  const first = userTurns.find((event) => textOf(event))
  const lastUser = [...userTurns].reverse().find((event) => textOf(event))
  const lastAssistant = [...assistantTurns].reverse().find((event) => textOf(event))
  let date = ''
  try {
    date = fs.statSync(logFile).mtime.toISOString().slice(0, 10)
  } catch {}
  return {
    first: first ? clip(textOf(first), 140) : '',
    lastUser: lastUser ? clip(textOf(lastUser), 180) : '',
    lastAssistant: lastAssistant ? clip(textOf(lastAssistant), 220) : '',
    date,
    userTurns: userTurns.length,
    assistantTurns: assistantTurns.length,
  }
}

fs.mkdirSync(ROLES, { recursive: true })

const written = []
for (const ws of fs.readdirSync(ROOT, { withFileTypes: true })) {
  if (!ws.isDirectory()) continue
  const wsDir = path.join(ROOT, ws.name)
  let sessions
  try {
    sessions = fs.readdirSync(wsDir, { withFileTypes: true }).filter((e) => e.isDirectory())
  } catch {
    continue
  }
  for (const session of sessions) {
    const id = session.name
    if (id === CURRENT) continue
    const logFile = path.join(wsDir, id, 'session.v4.jsonl.zstd')
    if (!fs.existsSync(logFile)) continue
    let data
    try {
      data = decompressFrames(fs.readFileSync(logFile))
    } catch {
      continue
    }
    const events = parseEvents(data.text)
    if (events.length === 0) continue
    const info = summarise(events, logFile)
    const label = WS_LABEL[ws.name] || ws.name.replace(/^--|--$/g, '')

    const body = `# 对话记忆 · ${id}

> 只属于这一次对话的事。跨对话还有用的，另行提炼到 \`MEMORY.md\`。

- **工作区**：${label}
- **日期**：${info.date}
- **规模**：用户 ${info.userTurns} 轮 / 助手 ${info.assistantTurns} 轮

## 这次在做什么

- 开头：${info.first || '（读不到）'}

## 最近聊到

- 主人：${info.lastUser || '（读不到）'}
- 本喵：${info.lastAssistant || '（读不到）'}

## 进展

- （待补：下次进这个对话时自己整理）

## 卡点 / 待办

- 

## 约定

- 

## 已归档

- （未归档）
`
    fs.writeFileSync(path.join(ROLES, id + '.md'), body, 'utf8')
    written.push(id + '  ' + label + '  ' + info.date)
  }
}

console.log('refreshed ' + written.length)
for (const row of written) console.log('  ' + row)
