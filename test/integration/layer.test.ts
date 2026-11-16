import { createServer } from 'node:net'
import { fileURLToPath } from 'node:url'
import { $fetch, fetch, setup, url } from '@nuxt/test-utils/e2e'
import { OAuth2Server } from 'oauth2-mock-server'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { startFakeTracker } from '../support/fake-tracker'

/**
 * O layer num app real (o playground, em build de produção) contra um IdP OIDC
 * simulado (`oauth2-mock-server`) e um GlitchTip falso.
 */

async function freePort(): Promise<number> {
  return new Promise((resolve) => {
    const server = createServer()
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as { port: number }
      server.close(() => resolve(port))
    })
  })
}

const idp = new OAuth2Server()
await idp.issuer.keys.generate('RS256')
await idp.start(await freePort(), '127.0.0.1')
const issuer = idp.issuer.url!

const tracker = await startFakeTracker()
const port = await freePort()
const appUrl = `http://127.0.0.1:${port}`

// Credenciais sem caracteres especiais: o openid-client codifica `-` como `%2D`
// no Basic auth (RFC 6749), e o IdP simulado não decodifica (o Zitadel sim).

// Perfil devolvido pelo `userinfo` do IdP; cada teste ajusta.
let profile: Record<string, unknown> = {}
idp.service.on('beforeUserinfo', (response: { body: Record<string, unknown> }) => {
  response.body = { ...response.body, ...profile }
})

Object.assign(process.env, {
  APP_URL: appUrl,
  APP_ENV: 'test-env',
  GLITCHTIP_DSN: `http://chavepublica@127.0.0.1:${tracker.port}/1`,
  GLITCHTIP_TRACES_SAMPLE_RATE: '1',
  OIDC_ISSUER: issuer,
  OIDC_CLIENT_ID: 'playground',
  OIDC_CLIENT_SECRET: 'segredodocliente',
  SESSION_SECRET: 'segredo-de-sessao-com-mais-de-32-caracteres',
})

await setup({
  rootDir: fileURLToPath(new URL('../../.playground', import.meta.url)),
  server: true,
  build: true,
  browser: false,
  port,
})

afterAll(async () => {
  await idp.stop()
  await tracker.close()
})

beforeEach(() => {
  tracker.clear()
  profile = { email: 'Ana@Example.com', email_verified: true, name: 'Ana Teste' }
})

/** Cookies `nome=valor` de um conjunto de respostas, o último vence. */
class CookieJar {
  private cookies = new Map<string, string>()
  store(response: Response) {
    for (const header of response.headers.getSetCookie()) {
      const [pair, ...attributes] = header.split(';')
      const [name, ...value] = pair!.split('=')
      const expired = attributes.some(
        (a) => /max-age=0\b/i.test(a.trim()) || /expires=thu, 01 jan 1970/i.test(a.trim()),
      )
      if (expired || value.join('=') === '') this.cookies.delete(name!.trim())
      else this.cookies.set(name!.trim(), value.join('='))
    }
  }
  header() {
    return [...this.cookies].map(([n, v]) => `${n}=${v}`).join('; ')
  }
  has(name: string) {
    return this.cookies.has(name)
  }
}

/** Percorre o login inteiro como o navegador faria; devolve o destino final. */
async function login(jar: CookieJar, query = 'returnTo=/privado'): Promise<string> {
  const start = await fetch(`/auth/login?${query}`, { redirect: 'manual' })
  jar.store(start)
  expect(start.status).toBe(302)
  const authorize = new URL(start.headers.get('location')!)
  expect(authorize.origin).toBe(new URL(issuer).origin)

  // O IdP simulado autentica direto e volta ao redirect_uri com o código.
  const atIdp = await globalThis.fetch(authorize, { redirect: 'manual' })
  const callback = new URL(atIdp.headers.get('location')!)
  expect(callback.href.startsWith(`${appUrl}/auth/callback?`)).toBe(true)

  const back = await fetch(`${callback.pathname}${callback.search}`, {
    redirect: 'manual',
    headers: { cookie: jar.header() },
  })
  jar.store(back)
  expect(back.status).toBe(302)
  return back.headers.get('location')!
}

describe('autenticação OIDC', () => {
  it('pede ao IdP código com PKCE, state e nonce', async () => {
    const response = await fetch('/auth/login?returnTo=/privado&prompt=create', {
      redirect: 'manual',
    })
    const location = new URL(response.headers.get('location')!)
    expect(location.searchParams.get('client_id')).toBe('playground')
    expect(location.searchParams.get('redirect_uri')).toBe(`${appUrl}/auth/callback`)
    expect(location.searchParams.get('code_challenge_method')).toBe('S256')
    expect(location.searchParams.get('state')).toBeTruthy()
    expect(location.searchParams.get('nonce')).toBeTruthy()
    expect(location.searchParams.get('prompt')).toBe('create')
    expect(location.searchParams.get('scope')).toBe('openid profile email')
  })

  it('login completo: sessão com o id local, e a API protegida responde', async () => {
    const jar = new CookieJar()
    expect(await login(jar)).toBe('/privado')
    expect(jar.has('base-session')).toBe(true)

    const session = await $fetch<{ user: Record<string, unknown> }>('/api/_auth/session', {
      headers: { cookie: jar.header() },
    })
    expect(session.user).toEqual({
      id: 'local-johndoe',
      sub: 'johndoe',
      email: 'ana@example.com',
      emailVerified: true,
      name: 'Ana Teste',
    })
    const data = await $fetch('/api/private', { headers: { cookie: jar.header() } })
    expect(data).toEqual({ id: 'local-johndoe' })
  })

  it('a página protegida redireciona ao login no SSR, e abre com sessão', async () => {
    const anonymous = await fetch('/privado', { redirect: 'manual' })
    expect(anonymous.status).toBe(302)
    expect(anonymous.headers.get('location')).toBe('/auth/login?returnTo=%2Fprivado')

    const jar = new CookieJar()
    await login(jar)
    const html = await $fetch<string>('/privado', { headers: { cookie: jar.header() } })
    expect(html).toContain('Área de Ana Teste')
  })

  it('sem sessão: 401 na API e nenhum cookie criado para o visitante', async () => {
    const response = await fetch('/api/private')
    expect(response.status).toBe(401)
    const session = await fetch('/api/_auth/session')
    expect(await session.json()).toEqual({ user: null })
    expect(session.headers.getSetCookie()).toEqual([])
  })

  it('returnTo para outro site é ignorado', async () => {
    const jar = new CookieJar()
    expect(await login(jar, 'returnTo=//mal.example.com')).toBe('/')
  })

  it('e-mail não verificado não entra', async () => {
    profile = { email: 'ana@example.com', email_verified: false }
    const jar = new CookieJar()
    expect(await login(jar)).toBe('/?auth_error=email_unverified')
    expect(jar.has('base-session')).toBe(false)
  })

  it('o app pode recusar o login no gancho', async () => {
    profile = { email: 'bloqueado@example.com', email_verified: true }
    const jar = new CookieJar()
    expect(await login(jar)).toBe('/?auth_error=forbidden')
    expect(jar.has('base-session')).toBe(false)
  })

  it('retorno sem o cookie do fluxo (expirado ou forjado) é recusado', async () => {
    const response = await fetch('/auth/callback?code=x&state=y', { redirect: 'manual' })
    expect(response.headers.get('location')).toBe('/?auth_error=flow_expired')
  })

  it('state adulterado é recusado', async () => {
    const jar = new CookieJar()
    const start = await fetch('/auth/login', { redirect: 'manual' })
    jar.store(start)
    const atIdp = await globalThis.fetch(start.headers.get('location')!, { redirect: 'manual' })
    const callback = new URL(atIdp.headers.get('location')!)
    callback.searchParams.set('state', 'outro')
    const back = await fetch(`${callback.pathname}${callback.search}`, {
      redirect: 'manual',
      headers: { cookie: jar.header() },
    })
    expect(back.headers.get('location')).toBe('/?auth_error=idp_error')
  })

  it('logout encerra a sessão aqui e devolve o logout do IdP', async () => {
    const jar = new CookieJar()
    await login(jar)
    const response = await fetch('/auth/logout', {
      method: 'POST',
      headers: { cookie: jar.header(), origin: appUrl },
    })
    jar.store(response)
    const { redirect } = (await response.json()) as { redirect: string }
    const target = new URL(redirect)
    expect(`${target.origin}${target.pathname}`).toBe(`${issuer}/endsession`)
    expect(target.searchParams.get('post_logout_redirect_uri')).toBe(`${appUrl}/`)
    expect(target.searchParams.get('client_id')).toBe('playground')

    const after = await fetch('/api/private', { headers: { cookie: jar.header() } })
    expect(after.status).toBe(401)
  })

  it('logout vindo de outro site é recusado', async () => {
    const response = await fetch('/auth/logout', {
      method: 'POST',
      headers: { origin: 'https://mal.example.com' },
    })
    expect(response.status).toBe(403)
  })
})

describe('observabilidade', () => {
  it('erro inesperado chega com versão, ambiente, serviço, rota e só o id da pessoa', async () => {
    const jar = new CookieJar()
    await login(jar)
    tracker.clear()
    const response = await fetch('/api/boom?token=abc', { headers: { cookie: jar.header() } })
    expect(response.status).toBe(500)

    const item = await tracker.waitFor((i) => i.type === 'event')
    const event = item.payload
    expect(item.path.startsWith('/api/1/envelope/')).toBe(true)
    expect(event.release).toMatch(/^playground@/)
    expect(event.environment).toBe('test-env')
    expect(event.tags.service).toBe('playground-api')
    expect(event.tags.route).toBe('/api/boom')
    expect(event.user).toEqual({ id: 'local-johndoe' })
    expect(event.request).toEqual({ url: '/api/boom', method: 'GET' })
    expect(event.exception.values.at(-1).value).toBe('explodiu com https://externo.example.com')
    // A pilha leva linhas do código-fonte (ContextLines), que é código e não
    // dado da requisição: o literal de /api/boom aparece ali de propósito.
    const raw = JSON.stringify({
      ...event,
      exception: {
        values: event.exception.values.map((v: any) => ({ ...v, stacktrace: undefined })),
      },
    })
    expect(raw).not.toContain('ana@example.com')
    expect(raw).not.toContain('base-session')
    expect(raw).not.toContain('token=abc')
  })

  it('resposta prevista (4xx) não gera evento', async () => {
    await fetch('/api/private')
    await new Promise((resolve) => setTimeout(resolve, 1000))
    expect(tracker.items.filter((i) => i.type === 'event')).toEqual([])
  })

  it('falha tratada: evento agrupado por escopo e log estruturado', async () => {
    await fetch('/api/handled', { method: 'POST' })
    const event = (await tracker.waitFor((i) => i.type === 'event')).payload
    expect(event.fingerprint).toEqual(['provider', 'Error'])
    expect(event.contexts.falha).toEqual({ status: 429 })

    const logs = await tracker.waitFor(
      (i) =>
        i.type === 'log' &&
        i.payload.items.some(
          (l: any) => l.attributes.scope?.value === 'provider' && l.level === 'info',
        ),
    )
    const info = logs.payload.items.find(
      (l: any) => l.level === 'info' && l.attributes.scope?.value === 'provider',
    )
    expect(info.body).toBe('Enviados 3 avisos')
    expect(info.attributes['sentry.message.template'].value).toBe('Enviados %s avisos')
    expect(info.attributes.count.value).toBe(3)
    expect(info.attributes.service.value).toBe('playground-api')
  })

  it('transação nomeada pelo molde da rota; health e telemetria fora', async () => {
    await fetch('/api/items/12345')
    await fetch('/api/health')
    const tx = (await tracker.waitFor((i) => i.type === 'transaction')).payload
    // O nome agrupa pela rota; o id fica só na URL do request (ids não são dado pessoal).
    expect(tx.transaction).toBe('GET /api/items/{id}')
    expect(tx.contexts.trace.op).toBe('http.server')
    await new Promise((resolve) => setTimeout(resolve, 500))
    const names = tracker.items
      .filter((i) => i.type === 'transaction')
      .map((i) => i.payload.transaction)
    expect(names).toEqual(['GET /api/items/{id}'])
  })

  it('túnel do navegador: destino, ambiente e serviço do servidor; o resto é descartado', async () => {
    const body = [
      JSON.stringify({ dsn: 'https://cliente@telemetria.invalid/1' }),
      JSON.stringify({ type: 'event' }),
      JSON.stringify({
        event_id: 'abc',
        environment: 'development',
        tags: { service: 'playground-api' },
        request: { url: `${appUrl}/convite/token-secreto?x=1`, headers: { Cookie: 'a' } },
        user: { id: 'local-1', email: 'ana@example.com' },
      }),
      JSON.stringify({ type: 'session' }),
      JSON.stringify({ sid: 'x' }),
    ].join('\n')

    const response = await fetch('/api/telemetry', {
      method: 'POST',
      body,
      headers: { origin: appUrl },
    })
    expect(response.status).toBe(204)
    const item = await tracker.waitFor((i) => i.type === 'event')
    expect(item.envelope.dsn).toBe(process.env.GLITCHTIP_DSN)
    expect(item.auth).toContain('sentry_key=chavepublica')
    expect(item.payload.environment).toBe('test-env')
    expect(item.payload.tags.service).toBe('playground-web')
    expect(item.payload.request).toEqual({ url: `${appUrl}/convite/[token]` })
    expect(item.payload.user).toEqual({ id: 'local-1' })
    expect(tracker.items.map((i) => i.type)).toEqual(['event'])
  })

  it('túnel: corpo grande demais responde 204 sem encaminhar', async () => {
    const response = await fetch('/api/telemetry', {
      method: 'POST',
      body: 'x'.repeat(300 * 1024),
      headers: { origin: appUrl },
    })
    expect(response.status).toBe(204)
    await new Promise((resolve) => setTimeout(resolve, 300))
    expect(tracker.items).toEqual([])
  })
})

describe('plataforma', () => {
  it('health com as verificações registradas', async () => {
    expect(await $fetch('/api/health')).toEqual({ status: 'ok', checks: { playground: 'ok' } })
  })

  it('cabeçalhos de segurança, inclusive em arquivo estático', async () => {
    for (const path of ['/', '/_nuxt/does-not-exist.js']) {
      const response = await fetch(path)
      expect(response.headers.get('x-content-type-options')).toBe('nosniff')
      expect(response.headers.get('content-security-policy')).toContain("frame-ancestors 'none'")
      expect(response.headers.get('strict-transport-security')).toBe('max-age=31536000')
    }
  })

  it('POST de outra origem é recusado antes do handler', async () => {
    const response = await fetch('/api/handled', {
      method: 'POST',
      headers: { origin: 'https://mal.example.com' },
    })
    expect(response.status).toBe(403)
    const ok = await fetch('/api/handled', { method: 'POST', headers: { origin: appUrl } })
    expect(ok.status).toBe(200)
  })
})

// `url` importado para quem quiser depurar: url('/') é o endereço do servidor.
void url
