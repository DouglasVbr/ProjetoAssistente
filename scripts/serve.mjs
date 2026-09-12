import { createServer } from 'node:http'
import { createReadStream } from 'node:fs'
import { access, stat } from 'node:fs/promises'
import { extname, join, normalize, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(fileURLToPath(new URL('../www', import.meta.url)))
const port = Number(process.env.PORT || 3000)
const contentTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
}

function safePath(urlPath) {
  const pathname = decodeURIComponent(urlPath.split('?')[0])
  const candidate = resolve(root, `.${pathname === '/' ? '/index.html' : pathname}`)
  return candidate === root || candidate.startsWith(`${root}/`) ? candidate : null
}

const server = createServer(async (request, response) => {
  try {
    const requestedPath = safePath(request.url || '/')
    if (!requestedPath) {
      response.writeHead(403)
      response.end('Forbidden')
      return
    }

    let filePath = requestedPath
    try {
      const details = await stat(filePath)
      if (details.isDirectory()) filePath = join(filePath, 'index.html')
    } catch {
      if (!extname(filePath)) filePath = join(root, 'index.html')
    }

    await access(filePath)
    response.writeHead(200, {
      'Cache-Control': 'no-cache',
      'Content-Type': contentTypes[extname(filePath)] || 'application/octet-stream',
    })
    createReadStream(filePath).pipe(response)
  } catch {
    response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' })
    response.end('Not found')
  }
})

server.listen(port, '0.0.0.0', () => {
  console.log(`[v0] Phennellopy disponível em http://localhost:${port}`)
})
