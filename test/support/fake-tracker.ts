import { createServer, type IncomingMessage, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { gunzipSync } from 'node:zlib'

/**
 * Um GlitchTip de mentira: aceita envelopes no formato do Sentry, decodifica
 * cada item e guarda em memória.
 */

export interface TrackerItem {
  type: string
  header: Record<string, unknown>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  payload: any
  envelope: Record<string, unknown>
  path: string
  auth: string | undefined
}

export function parseEnvelope(body: Buffer) {
  let offset = 0
  const readLine = (): string => {
    const end = body.indexOf(0x0a, offset)
    const line = body.subarray(offset, end === -1 ? body.length : end).toString('utf8')
    offset = end === -1 ? body.length : end + 1
    return line
  }
  const header = JSON.parse(readLine() || '{}') as Record<string, unknown>
  const items: { header: Record<string, unknown>; payload: unknown }[] = []
  while (offset < body.length) {
    const line = readLine()
    if (!line.trim()) continue
    const itemHeader = JSON.parse(line) as Record<string, unknown>
    let raw: string
    if (typeof itemHeader.length === 'number') {
      raw = body.subarray(offset, offset + itemHeader.length).toString('utf8')
      offset += itemHeader.length
      if (body[offset] === 0x0a) offset += 1
    } else {
      raw = readLine()
    }
    let payload: unknown = raw
    try {
      payload = JSON.parse(raw)
    } catch {
      // anexo binário: fica como veio
    }
    items.push({ header: itemHeader, payload })
  }
  return { header, items }
}

async function readBody(request: IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = []
  for await (const chunk of request) chunks.push(chunk as Buffer)
  const body = Buffer.concat(chunks)
  return request.headers['content-encoding'] === 'gzip' ? gunzipSync(body) : body
}

export interface FakeTracker {
  url: string
  port: number
  items: TrackerItem[]
  clear: () => void
  waitFor: (predicate: (item: TrackerItem) => boolean, timeoutMs?: number) => Promise<TrackerItem>
  close: () => Promise<void>
}

export async function startFakeTracker(): Promise<FakeTracker> {
  const items: TrackerItem[] = []
  const server: Server = createServer(async (request, response) => {
    const body = await readBody(request)
    try {
      const envelope = parseEnvelope(body)
      for (const item of envelope.items) {
        items.push({
          type: String(item.header.type),
          header: item.header,
          payload: item.payload,
          envelope: envelope.header,
          path: request.url ?? '',
          auth: request.headers['x-sentry-auth'] as string | undefined,
        })
      }
    } catch {
      // corpo que não é envelope: ignora
    }
    response.writeHead(200, { 'Content-Type': 'application/json' })
    response.end('{}')
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const { port } = server.address() as AddressInfo

  return {
    url: `http://127.0.0.1:${port}`,
    port,
    items,
    clear: () => {
      items.length = 0
    },
    async waitFor(predicate, timeoutMs = 10_000) {
      const deadline = Date.now() + timeoutMs
      while (Date.now() < deadline) {
        const found = items.find(predicate)
        if (found) return found
        await new Promise((resolve) => setTimeout(resolve, 50))
      }
      throw new Error(
        `Nenhum item do rastreador casou em ${timeoutMs} ms (${items.length} recebidos)`,
      )
    },
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  }
}
