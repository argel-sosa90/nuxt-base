import {
  createServer,
  type IncomingHttpHeaders,
  type IncomingMessage,
  type ServerResponse,
} from 'node:http'
import { createServer as createHttpsServer } from 'node:https'
import type { AddressInfo } from 'node:net'

/** Servidor HTTP que guarda cada pedido e responde o que o teste mandar. */

export interface CapturedRequest {
  method: string
  path: string
  headers: IncomingHttpHeaders
  body: Buffer
}

export interface CaptureServer {
  url: string
  requests: CapturedRequest[]
  /** Status e corpo das próximas respostas (padrão 200 `{}`). */
  respondWith: (status: number, body?: string) => void
  clear: () => void
  close: () => Promise<void>
}

export async function startCaptureServer(tls?: {
  key: string
  cert: string
}): Promise<CaptureServer> {
  const requests: CapturedRequest[] = []
  let reply = { status: 200, body: '{}' }
  const handler = async (request: IncomingMessage, response: ServerResponse) => {
    const chunks: Buffer[] = []
    for await (const chunk of request) chunks.push(chunk as Buffer)
    requests.push({
      method: request.method ?? '',
      path: request.url ?? '',
      headers: request.headers,
      body: Buffer.concat(chunks),
    })
    response.writeHead(reply.status, { 'Content-Type': 'application/json' })
    response.end(reply.body)
  }
  const server = tls ? createHttpsServer(tls, handler) : createServer(handler)
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const { port } = server.address() as AddressInfo
  return {
    url: `${tls ? 'https' : 'http'}://127.0.0.1:${port}`,
    requests,
    respondWith: (status, body = '{}') => {
      reply = { status, body }
    },
    clear: () => {
      requests.length = 0
      reply = { status: 200, body: '{}' }
    },
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  }
}
