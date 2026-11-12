/**
 * Inline every portrait PNG beside `portrait.json` into that file as a data URL.
 *
 * The Client reads the manifest once and can render without a second request
 * per expression, which keeps expression switching instant and survives the
 * Host asset route not being reachable for sub-paths.
 *
 * Run with the bundled Node after adding or replacing artwork:
 *   node tools/pack-portraits.mjs
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const ASSETS = path.join(HERE, '..', 'assets')
const MANIFEST_PATH = path.join(ASSETS, 'portrait.json')

const MIME = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
}

const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'))
const emotions = manifest.emotions ?? {}

let inlined = 0
let missing = []

for (const [id, entry] of Object.entries(emotions)) {
  const file = typeof entry.file === 'string' ? entry.file : undefined
  if (file === undefined) continue

  const absolute = path.join(ASSETS, file)
  let bytes
  try {
    bytes = fs.readFileSync(absolute)
  } catch {
    missing.push(file)
    delete entry.data
    continue
  }

  const mime = MIME[path.extname(file).toLowerCase()]
  if (mime === undefined) {
    missing.push(file)
    delete entry.data
    continue
  }

  entry.data = `data:${mime};base64,${bytes.toString('base64')}`
  inlined++
}

fs.writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2) + '\n', 'utf8')

const size = fs.statSync(MANIFEST_PATH).size
console.log(`inlined ${inlined}/${Object.keys(emotions).length} expressions -> ${MANIFEST_PATH}`)
console.log(`manifest size ${(size / 1024).toFixed(1)} KiB`)
if (missing.length > 0) console.log('missing artwork (falls back at runtime):', missing.join(', '))
