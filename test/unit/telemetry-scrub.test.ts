import { describe, expect, it } from 'vitest'
import { createScrubber, findPostgresError, TOKEN_MARKER } from '../../shared/telemetry-scrub'

const scrubber = createScrubber({
  tokenPathPrefixes: ['/convite/', '/api/invites'],
  tokenQueryPaths: ['/nova-senha'],
})

describe('caminhos e URLs', () => {
  it('troca o token do caminho pelo marcador e descarta a consulta', () => {
    expect(scrubber.scrubPath('/convite/abc123?x=1#y')).toBe(`/convite/${TOKEN_MARKER}`)
    expect(scrubber.scrubPath('/api/invites/abc/accept')).toBe(
      `/api/invites/${TOKEN_MARKER}/accept`,
    )
    expect(scrubber.scrubPath('/listas/42?busca=leite')).toBe('/listas/42')
  })

  it('marca a consulta dos caminhos que levam token nela', () => {
    expect(scrubber.scrubPath('/nova-senha?token=segredo')).toBe(`/nova-senha?${TOKEN_MARKER}`)
  })

  it('não confunde prefixo com caminho parecido', () => {
    expect(scrubber.scrubPath('/convites/abc')).toBe('/convites/abc')
  })

  it('a consulta do retorno do login some (code e state)', () => {
    expect(scrubber.scrubUrl('https://app.example.com/auth/callback?code=c&state=s')).toBe(
      'https://app.example.com/auth/callback',
    )
  })

  it('URL externa fica só com a origem; a da própria API fica com o caminho', () => {
    expect(scrubber.scrubRequestUrl('https://fcm.googleapis.com/fcm/send/credencial')).toBe(
      'https://fcm.googleapis.com',
    )
    expect(scrubber.scrubRequestUrl('https://app.example.com/api/items/1?q=x')).toBe(
      'https://app.example.com/api/items/1',
    )
  })

  it('sem regras, nada de token é presumido', () => {
    expect(createScrubber().scrubPath('/convite/abc')).toBe('/convite/abc')
  })
})

describe('eventos', () => {
  it('monta o evento só com os campos permitidos', () => {
    const event = scrubber.scrubEvent({
      event_id: 'e1',
      release: 'app@1',
      user: { id: 7, email: 'ana@example.com', ip_address: '1.2.3.4' },
      request: {
        url: 'https://app.example.com/convite/tok?a=1',
        method: 'GET',
        headers: { cookie: 'x' },
        data: { senha: 'x' },
      },
      contexts: {
        os: { name: 'Linux' },
        segredo: { valor: 1 },
        vue: { componentName: 'A', propsData: { nome: 'Ana' } },
      },
      extra: { qualquer: 'coisa' },
      exception: {
        values: [
          {
            type: 'Error',
            value: 'falhou em https://externo.example.com/caminho/secreto',
            stacktrace: { frames: [{ function: 'f', vars: { senha: 'x' } }] },
          },
        ],
      },
    }) as Record<string, any>

    expect(event.user).toEqual({ id: '7' })
    expect(event.request).toEqual({
      url: `https://app.example.com/convite/${TOKEN_MARKER}`,
      method: 'GET',
    })
    expect(event.contexts).toEqual({
      os: { name: 'Linux' },
      vue: { componentName: 'A', lifecycleHook: undefined },
    })
    expect(event.extra).toBeUndefined()
    expect(event.exception.values[0].value).toBe('falhou em https://externo.example.com')
    expect(event.exception.values[0].stacktrace.frames[0]).toEqual({ function: 'f' })
  })

  it('erro de banco: mensagem fixa com o SQLSTATE e agrupamento estável', () => {
    const pg = Object.assign(
      new Error('duplicate key value violates unique constraint (email)=(ana@example.com)'),
      {
        name: 'PostgresError',
        code: '23505',
        table_name: 'users',
        constraint_name: 'users_email_key',
      },
    )
    const wrapped = Object.assign(
      new Error('Failed query: insert into users values ($1)\nparams: ana@example.com'),
      { cause: pg },
    )
    const event = scrubber.scrubEvent(
      {
        tags: { route: 'POST /api/users' },
        exception: {
          values: [
            { type: 'PostgresError', value: pg.message },
            { type: 'DrizzleQueryError', value: wrapped.message },
          ],
        },
      },
      { originalException: wrapped },
    ) as Record<string, any>

    expect(event.exception.values).toHaveLength(1)
    expect(event.exception.values[0].value).toBe('PostgresError 23505')
    expect(event.fingerprint).toEqual(['postgres', '23505', 'POST /api/users'])
    expect(event.contexts.postgres).toEqual({
      code: '23505',
      table_name: 'users',
      constraint_name: 'users_email_key',
    })
    expect(JSON.stringify(event)).not.toContain('ana@example.com')
  })

  it('acha o erro do driver na cadeia de causas', () => {
    const pg = { name: 'PostgresError', code: '40001' }
    expect(findPostgresError({ cause: { cause: pg } })).toEqual({ code: '40001' })
    expect(findPostgresError(new Error('x'))).toBeNull()
  })

  it('transação sai sem o método no request (o nome já começa pelo verbo)', () => {
    const tx = scrubber.scrubTransaction({ request: { url: '/api/x', method: 'GET' } }) as Record<
      string,
      any
    >
    expect(tx.request).toEqual({ url: '/api/x' })
  })
})

describe('rastros, spans e logs', () => {
  it('descarta console e cliques; limpa URLs das requisições', () => {
    expect(scrubber.scrubBreadcrumb({ category: 'console', message: 'oi' })).toBeNull()
    expect(
      scrubber.scrubBreadcrumb({ category: 'ui.click', message: 'button[aria-label=Ana]' }),
    ).toBeNull()
    expect(
      scrubber.scrubBreadcrumb({
        category: 'fetch',
        data: {
          url: 'https://push.example.com/sub/credencial',
          method: 'POST',
          status_code: 201,
          body: 'x',
        },
      }),
    ).toEqual({
      category: 'fetch',
      data: { url: 'https://push.example.com', method: 'POST', status_code: 201 },
    })
    expect(
      scrubber.scrubBreadcrumb({
        category: 'navigation',
        data: { from: '/convite/abc', to: '/listas?x=1' },
      }),
    ).toEqual({ category: 'navigation', data: { from: `/convite/${TOKEN_MARKER}`, to: '/listas' } })
  })

  it('span perde parâmetros de consulta SQL e dados de usuário', () => {
    const span = scrubber.scrubSpanJson({
      description: 'GET https://externo.example.com/x/y',
      data: {
        'db.statement': 'select $1',
        'db.query.parameter.0': 'ana',
        'url.full': 'https://app/api/a?b=c',
        'user.email': 'x',
        'user.id': '1',
      },
    }) as Record<string, any>
    expect(span.description).toBe('GET https://externo.example.com')
    expect(span.data).toEqual({
      'db.statement': 'select $1',
      'url.full': 'https://app/api/a',
      'user.id': '1',
    })
  })

  it('log ganha o serviço sem sobrescrever um explícito', () => {
    expect(scrubber.scrubLog({ attributes: { scope: 'x' } }, 'app-api').attributes).toEqual({
      service: 'app-api',
      scope: 'x',
    })
    expect(
      scrubber.scrubLog({ attributes: { service: 'app-cron' } }, 'app-api').attributes,
    ).toEqual({ service: 'app-cron' })
  })
})
