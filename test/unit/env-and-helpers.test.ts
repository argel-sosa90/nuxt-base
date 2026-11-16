import { describe, expect, it, vi } from 'vitest'
import { safeReturnTo } from '../../shared/auth'
import { parseSampleRate, readBaseEnv } from '../../server/utils/base-env'
import {
  runHealthChecks,
  registerHealthCheck,
  unregisterHealthCheck,
} from '../../server/utils/health'
import { isAllowedOrigin } from '../../server/utils/origin'
import { createThrottle } from '../../server/utils/throttle'
import { interpolate, sendHeartbeat, transactionName } from '../../server/utils/monitoring'
import { userFromClaims } from '../../server/utils/auth'

describe('readBaseEnv', () => {
  it('sem nada configurado: sem login e sem rastreador', () => {
    const env = readBaseEnv({})
    expect(env.appUrl).toBe('http://localhost:3000')
    expect(env.environment).toBe('production')
    expect(env.oidc).toBeNull()
    expect(env.monitoring.dsn).toBe('')
    expect(env.session.secret).toBe('')
  })

  it('lê o OIDC e normaliza URLs', () => {
    const env = readBaseEnv({
      APP_URL: 'https://app.example.com/',
      OIDC_ISSUER: 'https://auth.example.com/',
      OIDC_CLIENT_ID: 'id',
      OIDC_REQUIRE_EMAIL_VERIFIED: 'false',
      SESSION_SECRET: 'x'.repeat(32),
      SESSION_MAX_AGE_DAYS: '30',
    })
    expect(env.appOrigin).toBe('https://app.example.com')
    expect(env.oidc).toEqual({
      issuer: 'https://auth.example.com',
      clientId: 'id',
      clientSecret: '',
      scopes: 'openid profile email',
      requireEmailVerified: false,
    })
    expect(env.session.maxAgeSeconds).toBe(30 * 86400)
  })

  it('segredo curto: recusado em produção, efêmero em desenvolvimento', () => {
    expect(readBaseEnv({ SESSION_SECRET: 'curto' }).session.secret).toBe('')
    const dev = readBaseEnv({}, { dev: true })
    expect(dev.session.secret).toHaveLength(64)
    expect(dev.session.ephemeral).toBe(true)
    expect(readBaseEnv({}, { dev: true }).session.secret).toBe(dev.session.secret)
  })

  it('amostragem inválida desliga a medição', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    expect(parseSampleRate(undefined)).toBe(0.1)
    expect(parseSampleRate('0.5')).toBe(0.5)
    expect(parseSampleRate('2')).toBe(0)
    expect(parseSampleRate('abc')).toBe(0)
    warn.mockRestore()
  })
})

describe('safeReturnTo', () => {
  it.each([
    ['/listas/1?x=2', '/listas/1?x=2'],
    ['https://mal.example.com', '/'],
    ['//mal.example.com', '/'],
    ['/\\mal.example.com', '/'],
    ['/auth/login', '/'],
    ['/auth?x', '/'],
    ['/authors', '/authors'],
    ['/a\nb', '/'],
    [undefined, '/'],
    [['/a'], '/'],
  ])('%j → %j', (input, expected) => {
    expect(safeReturnTo(input, '/')).toBe(expected)
  })
})

describe('userFromClaims', () => {
  it('normaliza e-mail e aceita email_verified como texto', () => {
    expect(
      userFromClaims({
        sub: 's1',
        email: 'Ana@Example.com',
        email_verified: 'true',
        given_name: 'Ana',
        family_name: 'Silva',
      }),
    ).toEqual({
      id: 's1',
      sub: 's1',
      email: 'ana@example.com',
      emailVerified: true,
      name: 'Ana Silva',
    })
    expect(userFromClaims({ sub: 's2' })).toEqual({
      id: 's2',
      sub: 's2',
      email: undefined,
      emailVerified: false,
    })
    expect(() => userFromClaims({})).toThrow()
  })
})

describe('origem', () => {
  it('ausente passa; diferente ou null é recusada', () => {
    expect(isAllowedOrigin(undefined, 'https://a.com')).toBe(true)
    expect(isAllowedOrigin('https://a.com', 'https://a.com')).toBe(true)
    expect(isAllowedOrigin('https://b.a.com', 'https://a.com')).toBe(false)
    expect(isAllowedOrigin('null', 'https://a.com')).toBe(false)
  })
})

describe('throttle', () => {
  it('limita por chave na janela e esquece chaves antigas', () => {
    const throttle = createThrottle(2, 1000)
    expect(throttle.allow('a', 0)).toBe(true)
    expect(throttle.allow('a', 10)).toBe(true)
    expect(throttle.allow('a', 20)).toBe(false)
    expect(throttle.allow('b', 20)).toBe(true)
    expect(throttle.allow('a', 1001)).toBe(true)
    expect(throttle.size(5000)).toBe(0)
  })
})

describe('saúde', () => {
  it('503 se qualquer verificação falhar', async () => {
    registerHealthCheck('ok', () => undefined)
    registerHealthCheck('falha', async () => {
      throw new Error('x')
    })
    expect(await runHealthChecks()).toEqual({
      status: 'degraded',
      checks: { ok: 'ok', falha: 'fail' },
    })
    unregisterHealthCheck('falha')
    expect(await runHealthChecks()).toEqual({ status: 'ok', checks: { ok: 'ok' } })
    unregisterHealthCheck('ok')
  })
})

describe('monitoramento sem rastreador', () => {
  it('nomeia transações pela rota, nunca pelo valor', () => {
    expect(transactionName('GET', '/api/lists/:listId/items/:itemId')).toBe(
      'GET /api/lists/{listId}/items/{itemId}',
    )
    expect(transactionName('GET', '/api/files/**:path')).toBe('GET /api/files/{...path}')
    expect(transactionName('POST', undefined)).toBe('POST /api/(desconhecida)')
  })

  it('interpola atributos só na linha de console', () => {
    expect(interpolate('{n} itens de {quem}', { n: 3 })).toBe('3 itens de {quem}')
  })

  it('batimento: falha vira aviso e devolve false', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    expect(await sendHeartbeat(undefined)).toBe(false)
    expect(await sendHeartbeat('https://x', async () => new Response(null, { status: 200 }))).toBe(
      true,
    )
    expect(await sendHeartbeat('https://x', async () => new Response(null, { status: 500 }))).toBe(
      false,
    )
    expect(
      await sendHeartbeat('https://x', async () => {
        throw new Error('rede')
      }),
    ).toBe(false)
    expect(warn).toHaveBeenCalledTimes(2)
    warn.mockRestore()
  })
})
