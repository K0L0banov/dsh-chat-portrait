/**
 * Host half of the chat-portrait bundle.
 *
 * The Client half renders the portrait in the browser, but the artwork lives on
 * disk. This half publishes the bundle's `assets/` directory at
 * `/chat-portrait/`, so a portrait file dropped next to `portrait.json` is
 * reachable without any Client rebuild.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ASSETS_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'assets')
const ROUTE_PREFIX = '/chat-portrait/'

const MIME = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.json': 'application/json; charset=utf-8',
}

/** Reject any path that resolves outside the bundle's assets directory. */
function resolveAsset(relativePath) {
  const target = path.resolve(ASSETS_DIR, relativePath)
  if (target !== ASSETS_DIR && !target.startsWith(ASSETS_DIR + path.sep)) return undefined
  return target
}

async function serveAsset(request) {
  const url = new URL(request.url)
  let relativePath
  try {
    relativePath = decodeURIComponent(url.pathname.slice(ROUTE_PREFIX.length))
  } catch {
    return new Response('bad request', { status: 400 })
  }
  if (relativePath === '') relativePath = 'portrait.json'

  const target = resolveAsset(relativePath)
  if (target === undefined) return new Response('forbidden', { status: 403 })

  let data
  try {
    data = await fs.promises.readFile(target)
  } catch (error) {
    return new Response(
      'not found | request=' + request.url + ' | rel=' + relativePath + ' | target=' + target + ' | ' + String(error && error.message),
      { status: 404 },
    )
  }

  return new Response(data, {
    headers: {
      'content-type': MIME[path.extname(target).toLowerCase()] ?? 'application/octet-stream',
      'cache-control': 'no-cache',
    },
  })
}

export const inject = ['webServer']

export function apply(ctx) {
  ctx.effect(() =>
    ctx.webServer.register({
      kind: 'prefix',
      path: ROUTE_PREFIX,
      resource: serveAsset,
    }),
  )
}
