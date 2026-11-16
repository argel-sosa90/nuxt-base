import { afterEach, describe, expect, it, vi } from 'vitest'
import { notificationFromPayload, safeTargetPath } from '../../layers/push/shared/push'
import {
  isAllowedPushEndpoint,
  readPushEnv,
  registerPushStore,
  sendPush,
  sendPushToUser,
  DEFAULT_PUSH_HOSTS,
} from '../../layers/push/server/utils/push'
import { parseSubscriptionBody } from '../../layers/push/server/utils/push-validation'

const subscription = { endpoint: 'https://fcm.googleapis.com/fcm/send/abc', p256dh: 'p', auth: 'a' }
const config = readPushEnv({
  VAPID_PUBLIC_KEY: 'pub',
  VAPID_PRIVATE_KEY: 'priv',
  APP_URL: 'https://app.example.com',
})

describe('payload no service worker', () => {
  it('monta a notificação e só abre caminho do próprio app', () => {
    expect(
      notificationFromPayload({ title: 'Oi', body: 'Corpo', url: '/listas/1', tag: 't' }),
    ).toEqual({
      title: 'Oi',
      options: { body: 'Corpo', tag: 't', badge: '/badge-96.png', data: { url: '/listas/1' } },
    })
    expect(
      notificationFromPayload({ title: 'Oi', url: 'https://mal.example.com' })!.options.data.url,
    ).toBe('/')
    expect(notificationFromPayload({ body: 'sem título' })).toBeNull()
    expect(notificationFromPayload('texto')).toBeNull()
  })

  it.each([
    ['/a?b=1', '/a?b=1'],
    ['//mal.example.com', '/'],
    ['/\\mal.example.com', '/'],
    ['javascript:alert(1)', '/'],
    [undefined, '/'],
  ])('safeTargetPath(%j) = %j', (input, expected) => {
    expect(safeTargetPath(input)).toBe(expected)
  })
})

describe('configuração e validação', () => {
  it('subject padrão é a URL https do app; mailto fora dela', () => {
    expect(config.subject).toBe('https://app.example.com')
    expect(readPushEnv({}).subject).toBe('mailto:dev@localhost')
    expect(readPushEnv({ VAPID_SUBJECT: 'mailto:a@b.c' }).subject).toBe('mailto:a@b.c')
  })

  it('só aceita endereços https dos serviços de push conhecidos', () => {
    const hosts = [...DEFAULT_PUSH_HOSTS]
    expect(isAllowedPushEndpoint('https://fcm.googleapis.com/fcm/send/x', hosts)).toBe(true)
    expect(
      isAllowedPushEndpoint('https://updates.push.services.mozilla.com/wpush/v2/x', hosts),
    ).toBe(true)
    expect(isAllowedPushEndpoint('https://web.push.apple.com/x', hosts)).toBe(true)
    expect(isAllowedPushEndpoint('https://wns2-bl2p.notify.windows.com/w/?token=x', hosts)).toBe(
      true,
    )
    expect(isAllowedPushEndpoint('http://fcm.googleapis.com/x', hosts)).toBe(false)
    expect(isAllowedPushEndpoint('https://fcm.googleapis.com.mal.example.com/x', hosts)).toBe(false)
    expect(isAllowedPushEndpoint('https://evilfcm.googleapis.com.example/x', hosts)).toBe(false)
    expect(isAllowedPushEndpoint('https://169.254.169.254/latest', hosts)).toBe(false)
    expect(isAllowedPushEndpoint('https://fcm.googleapis.com:8443/x', hosts)).toBe(false)
    expect(isAllowedPushEndpoint('https://u:p@fcm.googleapis.com/x', hosts)).toBe(false)
    expect(isAllowedPushEndpoint('lixo', hosts)).toBe(false)
    expect(readPushEnv({ PUSH_ALLOWED_HOSTS: 'push.example.com, ' }).allowedHosts).toContain(
      'push.example.com',
    )
  })

  it('corpo da inscrição', () => {
    expect(
      parseSubscriptionBody({ endpoint: 'https://x', keys: { p256dh: 'p', auth: 'a' } }),
    ).toEqual({
      endpoint: 'https://x',
      p256dh: 'p',
      auth: 'a',
    })
    expect(
      parseSubscriptionBody({ endpoint: 'https://x', keys: { p256dh: '', auth: 'a' } }),
    ).toBeNull()
    expect(
      parseSubscriptionBody({ endpoint: 'x'.repeat(1001), keys: { p256dh: 'p', auth: 'a' } }),
    ).toBeNull()
    expect(parseSubscriptionBody(null)).toBeNull()
  })
})

describe('sendPush', () => {
  afterEach(() => vi.restoreAllMocks())

  it('assina com VAPID e manda o payload em JSON', async () => {
    const sender = vi.fn(async () => ({ statusCode: 201, body: '', headers: {} }))
    expect(await sendPush(subscription, { title: 'Oi' }, { ttl: 60 }, config, sender)).toBe('sent')
    const [target, payload, options] = sender.mock.calls[0] as unknown as [
      unknown,
      string,
      Record<string, any>,
    ]
    expect(target).toEqual({ endpoint: subscription.endpoint, keys: { p256dh: 'p', auth: 'a' } })
    expect(JSON.parse(payload)).toEqual({ title: 'Oi' })
    expect(options.vapidDetails).toEqual({
      subject: 'https://app.example.com',
      publicKey: 'pub',
      privateKey: 'priv',
    })
    expect(options.TTL).toBe(60)
  })

  it('404/410 é inscrição morta; o resto é falha registrada, sem o endereço', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const fail = (statusCode: number) => async () => {
      throw Object.assign(new Error('x'), { statusCode })
    }
    expect(await sendPush(subscription, { title: 'Oi' }, {}, config, fail(410))).toBe('gone')
    expect(await sendPush(subscription, { title: 'Oi' }, {}, config, fail(404))).toBe('gone')
    expect(await sendPush(subscription, { title: 'Oi' }, {}, config, fail(500))).toBe('failed')
    expect(error).toHaveBeenCalledTimes(1)
    expect(JSON.stringify(error.mock.calls)).not.toContain('/fcm/send/abc')
  })
})

describe('sendPushToUser', () => {
  it('sem chave VAPID não consulta o store', async () => {
    const listForUser = vi.fn()
    registerPushStore({ save: vi.fn(), remove: vi.fn(), listForUser, removeEndpoints: vi.fn() })
    const saved = { ...process.env }
    delete process.env.VAPID_PUBLIC_KEY
    delete process.env.VAPID_PRIVATE_KEY
    expect(await sendPushToUser('u1', { title: 'Oi' })).toEqual({ sent: 0, gone: 0, failed: 0 })
    expect(listForUser).not.toHaveBeenCalled()
    process.env = saved
  })
})
