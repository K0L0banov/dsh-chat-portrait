/**
 * List every stored session with its title, so per-conversation memory files can
 * be created with real names instead of bare ids.
 */
import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'
import os from 'node:os'

const ROOT = path.join(os.homedir(), '.dsh', 'sessions')

function readEvents(file) {
  const raw = fs.readFileSync(file)
  let text
  try {
    text = zlib.zstdDecompressSync(raw).toString('utf8')
  } catch (error) {
    return { error: String(error && error.message) }
  }
  const lines = text.split('\n').filter((line) => line.trim() !== '')
  const events = []
  for (const line of lines.slice(0, 40)) {
    try {
      events.push(JSON.parse(line))
    } catch {}
  }
  return { events, total: lines.length }
}

function guessTitle(events) {
  for (const event of events) {
    const data = event && event.data
    if (!data) continue
    if (typeof data.title === 'string' && data.title.trim()) return data.title.trim()
    if (data.header && typeof data.header.title === 'string' && data.header.title.trim()) {
      return data.header.title.trim()
    }
  }
  // Fall back to the first user message.
  for (const event of events) {
    if (event && event.type === 'user/message') {
      const content = (event.data && event.data.content) || []
      for (const block of content) {
        if (block && block.type === 'text' && typeof block.text === 'string') {
          const line = block.text.trim().split('\n')[0]
          if (line) return line.slice(0, 40)
        }
      }
    }
  }
  return null
}

const workspaces = fs.readdirSync(ROOT, { withFileTypes: true }).filter((e) => e.isDirectory())
const rows = []

for (const ws of workspaces) {
  const wsDir = path.join(ROOT, ws.name)
  let sessions
  try {
    sessions = fs.readdirSync(wsDir, { withFileTypes: true }).filter((e) => e.isDirectory())
  } catch {
    continue
  }
  for (const session of sessions) {
    const sessionDir = path.join(wsDir, session.name)
    const file = path.join(sessionDir, 'session.v4.jsonl.zstd')
    if (!fs.existsSync(file)) {
      rows.push({ workspace: ws.name, id: session.name, title: null, note: 'no log' })
      continue
    }
    const stat = fs.statSync(file)
    const { events, total, error } = readEvents(file)
    rows.push({
      workspace: ws.name,
      id: session.name,
      title: error ? null : guessTitle(events || []),
      events: total,
      mtime: stat.mtime.toISOString().slice(0, 10),
      note: error,
    })
  }
}

for (const row of rows) {
  console.log(
    [row.id, row.workspace.replace(/^--|--$/g, '').slice(0, 24), row.mtime || '', String(row.events || ''),
      row.title || '(no title)', row.note || ''].join(' | '),
  )
}
console.log(`\ntotal sessions: ${rows.length}`)
