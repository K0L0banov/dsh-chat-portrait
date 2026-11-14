/**
 * Create a per-conversation memory file for every stored session that does not
 * have one yet.
 *
 * The session log itself is multi-frame zstd, which node's decompressor only
 * reads the first frame of, so titles are not extracted here: the file gets the
 * workspace name, the date and the session id, and the agent fills the body on
 * its next visit.
 */
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

const ROOT = path.join(os.homedir(), '.dsh', 'sessions')
const ROLES = path.join(os.homedir(), '.dsh', 'roles', 'nyan-reply', 'sessions')
const CURRENT = process.env.DSH_SESSION_ID || ''

fs.mkdirSync(ROLES, { recursive: true })

function workspaceLabel(dirName) {
  return dirName
    .replace(/^--|--$/g, '')
    .replace(/-+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

const template = (sessionId, workspace, date) => `# 对话记忆 · ${sessionId}

> 只属于这一次对话的事。跨对话还有用的，另行提炼到 \`MEMORY.md\`。

- **工作区**：${workspace}
- **日期**：${date}

## 这次在做什么

- （待补：下次进入这类对话时自己读一遍再写）

## 进展

- 

## 卡点 / 待办

- 

## 约定

- 

## 已归档

- （未归档）
`

const created = []
const skipped = []

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
    if (session.name === CURRENT) {
      skipped.push(session.name + ' (current)')
      continue
    }
    const out = path.join(ROLES, session.name + '.md')
    if (fs.existsSync(out)) {
      skipped.push(session.name + ' (exists)')
      continue
    }
    const dir = path.join(wsDir, session.name)
    let date = ''
    try {
      date = fs.statSync(dir).mtime.toISOString().slice(0, 10)
    } catch {}
    fs.writeFileSync(out, template(session.name, workspaceLabel(ws.name), date), 'utf8')
    created.push(session.name + ' ' + date + ' ' + workspaceLabel(ws.name))
  }
}

console.log('created ' + created.length)
for (const row of created) console.log('  + ' + row)
console.log('skipped ' + skipped.length)
for (const row of skipped) console.log('  - ' + row)
