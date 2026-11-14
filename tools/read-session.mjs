/**
 * Decompress a multi-frame zstd session log.
 *
 * node's `zstdDecompressSync` only decodes the first frame. The log is written as
 * a sequence of independent frames, so scan for the frame magic (0x28B52FFD),
 * decompress each slice, and concatenate. A false magic inside compressed data
 * simply fails to decode and is skipped.
 */
import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'
import os from 'node:os'

const MAGIC = Buffer.from([0x28, 0xb5, 0x2f, 0xfd])

export function decompressFrames(buffer) {
  const offsets = []
  let cursor = 0
  while (cursor < buffer.length) {
    const at = buffer.indexOf(MAGIC, cursor)
    if (at === -1) break
    offsets.push(at)
    cursor = at + 4
  }
  if (offsets.length === 0) return { text: '', frames: 0, failed: 0 }

  const parts = []
  let failed = 0
  for (let index = 0; index < offsets.length; index++) {
    const start = offsets[index]
    const end = index + 1 < offsets.length ? offsets[index + 1] : buffer.length
    try {
      parts.push(zlib.zstdDecompressSync(buffer.subarray(start, end)))
    } catch {
      failed++
    }
  }
  return { text: Buffer.concat(parts).toString('utf8'), frames: offsets.length, failed }
}

export function parseEvents(text) {
  const events = []
  for (const line of text.split('\n')) {
    if (line.trim() === '') continue
    try {
      events.push(JSON.parse(line))
    } catch {}
  }
  return events
}

export function sessionTitles(file) {
  const raw = fs.readFileSync(file)
  const { text, frames, failed } = decompressFrames(raw)
  const events = parseEvents(text)
  const types = {}
  for (const event of events) types[event.type] = (types[event.type] || 0) + 1
  return { events, frames, failed, types }
}

const invokedDirectly =
  typeof process.argv[1] === 'string' &&
  import.meta.url === `file:///${process.argv[1].replace(/\\/g, '/')}`

if (invokedDirectly) {
  const file = process.argv[2]
  if (!file) {
    console.log('usage: node tools/read-session.mjs <session.v4.jsonl.zstd>')
    process.exit(2)
  }
  const { events, frames, failed, types } = sessionTitles(file)
  console.log('frames', frames, 'failed', failed, 'events', events.length)
  const top = Object.entries(types).sort((a, b) => b[1] - a[1]).slice(0, 15)
  console.log('types:', top.map(([k, v]) => k + ':' + v).join(', '))
  for (const event of events.slice(0, 3)) {
    console.log('---', event.type, JSON.stringify(event.data ?? null).slice(0, 160))
  }
}
