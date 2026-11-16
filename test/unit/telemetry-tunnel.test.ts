import { describe, expect, it } from 'vitest'
import { createScrubber } from '../../shared/telemetry-scrub'
import { parseDsn, rewriteEnvelope } from '../../server/utils/telemetry-tunnel'
import { parseEnvelope } from '../support/fake-tracker'

const dsn = parseDsn('https://chave@glitchtip.example.com/7')!
const options = { dsn, environment: 'production', service: 'app-web', scrubber: createScrubber() }

function envelope(header: object, ...items: [object, object | string][]): string {
  return [
    JSON.stringify(header),
    ...items.flatMap(([h, p]) => [
      JSON.stringify(h),
      typeof p === 'string' ? p : JSON.stringify(p),
    ]),
  ].join('\n')
}

describe('parseDsn', () => {
  it('monta a URL de envelope', () => {
    expect(dsn).toEqual({
      publicKey: 'chave',
      envelopeUrl: 'https://glitchtip.example.com/api/7/envelope/',
      dsn: 'https://chave@glitchtip.example.com/7',
    })
    expect(parseDsn('https://glitchtip.example.com/7')).toBeNull()
    expect(parseDsn('não é url')).toBeNull()
  })
})

describe('rewriteEnvelope', () => {
  it('troca o destino e força ambiente e serviço', () => {
    const body = envelope({ dsn: 'https://outra@atacante.example.com/1', event_id: 'e1' }, [
      { type: 'event' },
      { event_id: 'e1', environment: 'development', tags: { service: 'app-api' } },
    ])
    const out = parseEnvelope(Buffer.from(rewriteEnvelope(body, options)!))
    expect(out.header.dsn).toBe(dsn.dsn)
    const event = out.items[0]!.payload as Record<string, any>
    expect(event.environment).toBe('production')
    expect(event.tags.service).toBe('app-web')
  })

  it('só passam erros e logs', () => {
    const body = envelope(
      {},
      [{ type: 'transaction' }, { type: 'transaction' }],
      [{ type: 'session' }, { sid: 'x' }],
      [
        { type: 'log', item_count: 1 },
        {
          items: [{ body: 'oi', attributes: { service: { value: 'app-api' }, 'user.email': 'x' } }],
        },
      ],
    )
    const out = parseEnvelope(Buffer.from(rewriteEnvelope(body, options)!))
    expect(out.items.map((item) => item.header.type)).toEqual(['log'])
    const attributes = (out.items[0]!.payload as any).items[0].attributes
    expect(attributes.service).toEqual({ value: 'app-web', type: 'string' })
    expect(attributes['sentry.environment']).toEqual({ value: 'production', type: 'string' })
    expect(attributes['user.email']).toBeUndefined()
  })

  it('nada a encaminhar, ou corpo inválido, devolve null', () => {
    expect(rewriteEnvelope(envelope({}, [{ type: 'session' }, {}]), options)).toBeNull()
    expect(rewriteEnvelope('lixo', options)).toBeNull()
    expect(rewriteEnvelope(envelope({}, [{ type: 'event' }, 'não é json']), options)).toBeNull()
  })
})
