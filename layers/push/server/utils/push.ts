import webpush from 'web-push'
import type { H3Event } from 'h3'
import { readBaseEnv, type Env } from '../../../../server/utils/base-env'
import { measureStep, reportFailure } from '../../../../server/utils/monitoring'
import type { PushMessage } from '../../shared/push'

/**
 * Envio de Web Push (VAPID), extraído do family-lists.
 *
 * O app registra, num plugin do Nitro, duas coisas que são dele:
 *
 * - `registerPushStore`: onde as inscrições ficam (o template traz uma tabela
 *   com Drizzle; sem banco, `createFilePushStore`).
 * - `registerPushOwner`: de quem é a inscrição feita nesta requisição. Com
 *   login, a conta da sessão; sem login, o que o app usar para agrupar
 *   aparelhos (um canal, um grupo).
 *
 * O layer cuida do resto: chave pública, rotas de inscrição, envio, limpeza
 * das inscrições mortas e o que vai ao GlitchTip — nunca o endereço da
 * inscrição, que é uma credencial.
 */

export interface PushSubscriptionRecord {
  endpoint: string
  p256dh: string
  auth: string
}

/**
 * As inscrições, agrupadas por dono. O dono é uma string opaca para o layer:
 * o id da conta num app com login, ou o que `registerPushOwner` devolver.
 */
export interface PushStore {
  /** Grava (ou transfere para este dono) a inscrição do aparelho. Upsert pelo endpoint. */
  save: (owner: string, subscription: PushSubscriptionRecord) => Promise<void>
  /** Remove a inscrição, só se for deste dono. */
  remove: (owner: string, endpoint: string) => Promise<void>
  listForOwner: (owner: string) => Promise<PushSubscriptionRecord[]>
  /** Remove inscrições que o serviço de push disse não existirem mais. */
  removeEndpoints: (endpoints: string[]) => Promise<void>
}

export interface PushEnv {
  publicKey: string
  privateKey: string
  /** `mailto:` ou URL `https:` de contato, exigido pelos serviços de push. */
  subject: string
  /** Sufixos de host aceitos como serviço de push (proteção contra SSRF). */
  allowedHosts: string[]
}

/** Os serviços de push dos navegadores (Chrome/Edge/Android, Firefox, Safari, Windows). */
export const DEFAULT_PUSH_HOSTS = [
  'fcm.googleapis.com',
  'android.googleapis.com',
  'push.services.mozilla.com',
  'push.apple.com',
  'notify.windows.com',
]

export function readPushEnv(env: Env = process.env): PushEnv {
  const appUrl = readBaseEnv(env).appUrl
  const extra = (env.PUSH_ALLOWED_HOSTS || '')
    .split(',')
    .map((host) => host.trim().toLowerCase())
    .filter(Boolean)
  return {
    publicKey: env.VAPID_PUBLIC_KEY || '',
    privateKey: env.VAPID_PRIVATE_KEY || '',
    subject: env.VAPID_SUBJECT || (appUrl.startsWith('https://') ? appUrl : 'mailto:dev@localhost'),
    allowedHosts: [...DEFAULT_PUSH_HOSTS, ...extra],
  }
}

export function pushEnv(): PushEnv {
  return readPushEnv(process.env)
}

/** Sem as duas chaves, o push fica desligado e o app segue inteiro. */
export function isPushConfigured(config: PushEnv = pushEnv()): boolean {
  return Boolean(config.publicKey && config.privateKey)
}

/**
 * O endereço é de um serviço de push conhecido? O servidor faz POST nele, e o
 * endereço vem do navegador: sem esta conferência, qualquer conta faria o
 * servidor chamar um endereço interno.
 */
export function isAllowedPushEndpoint(endpoint: string, allowedHosts: string[]): boolean {
  let url: URL
  try {
    url = new URL(endpoint)
  } catch {
    return false
  }
  if (url.protocol !== 'https:' || url.username || url.password || url.port) return false
  const host = url.hostname.toLowerCase()
  return allowedHosts.some((allowed) => host === allowed || host.endsWith(`.${allowed}`))
}

/** Host do serviço de push — o resto do endereço é segredo. */
export function pushHost(endpoint: string): string {
  try {
    return new URL(endpoint).host
  } catch {
    return '(inválido)'
  }
}

/** 404 e 410: "este endereço não existe mais", os únicos que autorizam apagar. */
export function isGoneStatus(status: number | undefined): boolean {
  return status === 404 || status === 410
}

let store: PushStore | undefined

/** Registra onde as inscrições ficam. Num plugin do Nitro do app. */
export function registerPushStore(implementation: PushStore): void {
  store = implementation
}

export function usePushStore(): PushStore {
  if (!store) {
    throw new Error('Nenhum PushStore registrado: chame registerPushStore() num plugin do Nitro.')
  }
  return store
}

/**
 * De quem é a inscrição feita nesta requisição. Lança para recusar (o erro
 * vira a resposta: `requireAuthUser` dá 401). Nunca leia o dono do corpo da
 * requisição sem conferir: quem escolhe o dono recebe as notificações dele.
 */
export type PushOwnerResolver = (event: H3Event) => string | Promise<string>

let ownerResolver: PushOwnerResolver | undefined

/**
 * Registra como achar o dono da inscrição. Num plugin do Nitro do app:
 *
 *   registerPushOwner(async (event) => (await requireAuthUser(event)).id)
 */
export function registerPushOwner(resolver: PushOwnerResolver): void {
  ownerResolver = resolver
}

export async function resolvePushOwner(event: H3Event): Promise<string> {
  if (!ownerResolver) {
    throw new Error(
      'Nenhum dono de inscrição registrado: chame registerPushOwner() num plugin do Nitro.',
    )
  }
  const owner = await ownerResolver(event)
  if (typeof owner !== 'string' || owner.length === 0 || owner.length > 200) {
    throw new Error('registerPushOwner devolveu um dono inválido.')
  }
  return owner
}

export type PushResult = 'sent' | 'gone' | 'failed'

export interface PushOptions {
  /** Segundos que o serviço guarda a mensagem para um aparelho desligado. */
  ttl?: number
  urgency?: 'very-low' | 'low' | 'normal' | 'high'
}

type Sender = typeof webpush.sendNotification

/**
 * Envia a uma inscrição. Nunca lança: `gone` diz para apagar a inscrição;
 * `failed` (rede, 5xx, 429) é registrado e não apaga nada — o endereço pode
 * estar bom e o problema ser passageiro.
 */
export async function sendPush(
  subscription: PushSubscriptionRecord,
  message: PushMessage,
  options: PushOptions = {},
  config: PushEnv = pushEnv(),
  sender: Sender = webpush.sendNotification.bind(webpush),
): Promise<PushResult> {
  const host = pushHost(subscription.endpoint)
  try {
    await measureStep(
      'web push',
      'http.client',
      async (step) => {
        try {
          const result = await sender(
            {
              endpoint: subscription.endpoint,
              keys: { p256dh: subscription.p256dh, auth: subscription.auth },
            },
            JSON.stringify(message),
            {
              vapidDetails: {
                subject: config.subject,
                publicKey: config.publicKey,
                privateKey: config.privateKey,
              },
              TTL: options.ttl ?? 24 * 60 * 60,
              urgency: options.urgency ?? 'normal',
              timeout: 10_000,
            },
          )
          step.set('http.response.status_code', result?.statusCode)
        } catch (error) {
          step.set('http.response.status_code', (error as { statusCode?: number }).statusCode)
          throw error
        }
      },
      { 'server.address': host },
    )
    return 'sent'
  } catch (error) {
    const status = (error as { statusCode?: number } | null)?.statusCode
    if (isGoneStatus(status)) return 'gone'
    reportFailure('push', error, {
      message: 'Falha no envio de push',
      line: ['[push] falha no envio:', host, status ?? (error as Error).message],
      context: { status, host },
    })
    return 'failed'
  }
}

export interface PushReport {
  sent: number
  gone: number
  failed: number
}

/**
 * Envia a todos os aparelhos de um dono e apaga as inscrições mortas. Sem
 * chave VAPID, ou sem inscrições, não faz nada. Nunca lança por falha de envio.
 */
export async function sendPushToOwner(
  owner: string,
  message: PushMessage,
  options: PushOptions = {},
): Promise<PushReport> {
  const report: PushReport = { sent: 0, gone: 0, failed: 0 }
  const config = pushEnv()
  if (!isPushConfigured(config)) return report

  const pushStore = usePushStore()
  const subscriptions = await pushStore.listForOwner(owner)
  const gone: string[] = []
  await Promise.all(
    subscriptions.map(async (subscription) => {
      const result = await sendPush(subscription, message, options, config)
      report[result]++
      if (result === 'gone') gone.push(subscription.endpoint)
    }),
  )
  if (gone.length > 0) await pushStore.removeEndpoints(gone)
  return report
}
