import type { Scrubber } from '../../shared/telemetry-scrub'

/**
 * Encaminhamento dos envios do navegador ao GlitchTip. Funções puras: a rota
 * `POST /api/telemetry` lê o corpo, chama `rewriteEnvelope` e manda o resultado.
 *
 * O navegador fala com o próprio app; o DSN de verdade só existe no servidor.
 * Tudo que vem do cliente é entrada de terceiro: o destino informado no
 * envelope é ignorado, só erros e logs passam, e o ambiente e o serviço são os
 * do servidor.
 */

/** Itens que passam; transação, span, sessão, replay e relatório ficam. */
const FORWARDED_TYPES = new Set(['event', 'log'])

export interface ParsedDsn {
  publicKey: string
  /** `https://host[:porta][/caminho]/api/<projeto>/envelope/` */
  envelopeUrl: string
  /** O DSN inteiro, que vai no cabeçalho do envelope reescrito. */
  dsn: string
}

export function parseDsn(dsn: string): ParsedDsn | null {
  try {
    const url = new URL(dsn)
    const projectId = url.pathname.split('/').filter(Boolean).pop()
    if (!url.username || !projectId) return null
    const basePath = url.pathname.slice(0, url.pathname.lastIndexOf('/'))
    return {
      publicKey: url.username,
      envelopeUrl: `${url.protocol}//${url.host}${basePath}/api/${projectId}/envelope/`,
      dsn,
    }
  } catch {
    return null
  }
}

type Dict = Record<string, unknown>

function parseLines(
  body: string,
): { header: Dict; items: { header: Dict; payload: string }[] } | null {
  const lines = body.split('\n')
  let index = 0
  const next = () => lines[index++]
  try {
    const header = JSON.parse(next() || '{}') as Dict
    const items: { header: Dict; payload: string }[] = []
    while (index < lines.length) {
      const line = next()
      if (!line?.trim()) continue
      const itemHeader = JSON.parse(line) as Dict
      items.push({ header: itemHeader, payload: next() ?? '' })
    }
    return { header, items }
  } catch {
    return null
  }
}

export interface RewriteOptions {
  dsn: ParsedDsn
  environment: string
  /** `<projeto>-web`, diga o cliente o que disser. */
  service: string
  scrubber: Scrubber
}

/**
 * Reescreve um envelope do navegador para o projeto configurado, ou devolve
 * `null` quando não sobra nada para encaminhar.
 */
export function rewriteEnvelope(body: string, options: RewriteOptions): string | null {
  const { dsn, environment, service, scrubber } = options
  const parsed = parseLines(body)
  if (!parsed) return null

  const kept: string[] = []
  for (const item of parsed.items) {
    const type = String(item.header.type)
    if (!FORWARDED_TYPES.has(type)) continue
    let payload: Dict
    try {
      payload = JSON.parse(item.payload) as Dict
    } catch {
      continue
    }
    if (!payload || typeof payload !== 'object') continue

    let rewritten: Dict
    if (type === 'event') {
      rewritten = scrubber.scrubEvent({ ...payload, environment }) as Dict
      rewritten.tags = { ...((rewritten.tags as Dict) ?? {}), service }
    } else {
      const entries = Array.isArray(payload.items) ? (payload.items as Dict[]) : []
      rewritten = {
        ...payload,
        items: entries.map((entry) => {
          const scrubbed = scrubber.scrubLog(entry as { attributes?: Dict }, service)
          return {
            ...scrubbed,
            attributes: {
              ...scrubbed.attributes,
              service: { value: service, type: 'string' },
              'sentry.environment': { value: environment, type: 'string' },
            },
          }
        }),
      }
    }
    // Sem `length`: o conteúdo mudou, e um item JSON não precisa dele.
    const { length: _length, ...header } = item.header
    kept.push(JSON.stringify(header), JSON.stringify(rewritten))
  }
  if (kept.length === 0) return null

  const header: Dict = { ...parsed.header, dsn: dsn.dsn }
  if (header.trace && typeof header.trace === 'object') {
    header.trace = { ...(header.trace as Dict), public_key: dsn.publicKey, environment }
  }
  return [JSON.stringify(header), ...kept].join('\n')
}
