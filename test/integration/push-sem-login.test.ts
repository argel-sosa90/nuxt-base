import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { $fetch, fetch, setup } from '@nuxt/test-utils/e2e'
import webpush from 'web-push'
import { afterAll, describe, expect, it } from 'vitest'
import { startCaptureServer } from '../support/capture-server'
import { selfSignedCertificate } from '../support/self-signed'

/**
 * O `/push` num app SEM login e sem banco (fixture `push-sem-login`, build de
 * produção): o dono da inscrição é um canal que o app resolve, e as
 * inscrições ficam num arquivo.
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

const tls = selfSignedCertificate()
const pushService = await startCaptureServer(tls)
pushService.respondWith(201)
const vapid = webpush.generateVAPIDKeys()
const port = await freePort()
const appUrl = `http://127.0.0.1:${port}`

const canalA = 'canal-a-0123456789abcdefghijklmnopqrstuvwxyz'
const canalB = 'canal-b-0123456789abcdefghijklmnopqrstuvwxyz'
// O serviço de push falso é https local com porta, que a rota de inscrição
// recusa (proteção contra SSRF): a inscrição dele já começa no arquivo.
const device = webpush.generateVAPIDKeys()
const storeFile = join(await mkdtemp(join(tmpdir(), 'push-sem-login-')), 'push.json')
await writeFile(
  storeFile,
  JSON.stringify([
    {
      owner: canalB,
      endpoint: `${pushService.url}/aparelho-b`,
      p256dh: device.publicKey,
      auth: 'c2VncmVkby1hdXRoLTE2Yg',
    },
  ]),
)

Object.assign(process.env, {
  APP_URL: appUrl,
  VAPID_PUBLIC_KEY: vapid.publicKey,
  VAPID_PRIVATE_KEY: vapid.privateKey,
  PUSH_STORE_FILE: storeFile,
  NODE_EXTRA_CA_CERTS: tls.caBundle,
})

await setup({
  rootDir: fileURLToPath(new URL('../fixtures/apps/push-sem-login', import.meta.url)),
  server: true,
  build: true,
  browser: false,
  port,
})

afterAll(async () => {
  await pushService.close()
})

const subscription = {
  endpoint: 'https://fcm.googleapis.com/fcm/send/aparelho-a',
  keys: { p256dh: 'BPub', auth: 'segredo' },
}
const json = { origin: appUrl, 'content-type': 'application/json' }

describe('push sem login', () => {
  it('o layer não traz o login', async () => {
    expect((await fetch('/auth/login')).status).toBe(404)
    expect((await fetch('/api/_auth/session')).status).toBe(404)
  })

  it('inscreve sob o canal que o app resolve, e grava no arquivo', async () => {
    const semCanal = await fetch('/api/_push/subscription', {
      method: 'POST',
      headers: json,
      body: JSON.stringify(subscription),
    })
    expect(semCanal.status).toBe(400)

    const ok = await fetch('/api/_push/subscription', {
      method: 'POST',
      headers: { ...json, 'x-push-channel': canalA },
      body: JSON.stringify(subscription),
    })
    expect(ok.status).toBe(204)

    const rows = JSON.parse(await readFile(storeFile, 'utf8')) as { owner: string }[]
    expect(rows.map((row) => row.owner).sort()).toEqual([canalA, canalB])
  })

  it('outro canal não remove a inscrição; o dono remove', async () => {
    const alheio = await fetch('/api/_push/subscription', {
      method: 'DELETE',
      headers: { ...json, 'x-push-channel': canalB },
      body: JSON.stringify({ endpoint: subscription.endpoint }),
    })
    expect(alheio.status).toBe(204)
    expect(await readFile(storeFile, 'utf8')).toContain(subscription.endpoint)

    const dono = await fetch('/api/_push/subscription', {
      method: 'DELETE',
      headers: { ...json, 'x-push-channel': canalA },
      body: JSON.stringify({ endpoint: subscription.endpoint }),
    })
    expect(dono.status).toBe(204)
    expect(await readFile(storeFile, 'utf8')).not.toContain(subscription.endpoint)
  })

  it('envia ao canal, cifrado e assinado com VAPID', async () => {
    const report = await $fetch('/api/notify', {
      method: 'POST',
      headers: { origin: appUrl },
      body: { channel: canalB },
    })
    expect(report).toEqual({ sent: 1, gone: 0, failed: 0 })
    const [request] = pushService.requests
    expect(request!.path).toBe('/aparelho-b')
    expect(request!.headers.authorization).toMatch(/^vapid t=.+, k=/)
    expect(request!.headers['content-encoding']).toBe('aes128gcm')
  })
})
