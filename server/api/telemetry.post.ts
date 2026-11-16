import type { H3Event } from 'h3'

/**
 * Túnel dos envios do navegador ao GlitchTip.
 *
 * O SDK do cliente envia aqui com um DSN de preenchimento; esta rota troca o
 * destino pelo `GLITCHTIP_DSN` do servidor. Assim o DSN não chega ao cliente, a
 * CSP fica em `'self'` e bloqueador de anúncio não interfere. O nome evita
 * "sentry" de propósito.
 *
 * Responde 204 SEMPRE — corpo grande demais, limite excedido, nada a
 * encaminhar, rastreador fora do ar ou sem DSN: um erro aqui não pode virar
 * outro erro na tela. Sem sessão: erro em tela de visitante também interessa.
 * A conferência de origem recusa o `POST` vindo de outro site.
 */

const MAX_BODY_BYTES = 200 * 1024
const FORWARD_TIMEOUT_MS = 2_000

/** 30 envios por minuto por endereço, em memória. */
const throttle = createThrottle(30, 60_000)

async function readLimitedBody(event: H3Event): Promise<string | null> {
  const declared = Number(getRequestHeader(event, 'content-length'))
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) return null

  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of event.node.req) {
    size += (chunk as Buffer).length
    if (size > MAX_BODY_BYTES) return null
    chunks.push(chunk as Buffer)
  }
  return Buffer.concat(chunks).toString('utf8')
}

export default defineEventHandler(async (event) => {
  setResponseStatus(event, 204)

  const body = await readLimitedBody(event)
  if (body === null) return null

  const { monitoring } = baseEnv()
  const dsn = monitoring.dsn ? parseDsn(monitoring.dsn) : null
  if (!dsn) return null

  if (!throttle.allow(clientAddress(event))) return null

  const envelope = rewriteEnvelope(body, {
    dsn,
    environment: monitoring.environment,
    service: serviceName('web', baseAppConfig().project),
    scrubber: useScrubber(),
  })
  if (!envelope) return null

  try {
    await fetch(dsn.envelopeUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-sentry-envelope',
        'X-Sentry-Auth': `Sentry sentry_version=7, sentry_key=${dsn.publicKey}, sentry_client=nuxt-base-tunnel`,
      },
      body: envelope,
      signal: AbortSignal.timeout(FORWARD_TIMEOUT_MS),
    })
  } catch {
    // Rastreador fora do ar ou lento: o evento se perde, a resposta não muda.
  }
  return null
})
