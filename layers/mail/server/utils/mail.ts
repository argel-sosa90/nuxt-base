import { log, measureStep, reportFailure } from '../../../../server/utils/monitoring'
import { readBaseEnv, type Env } from '../../../../server/utils/base-env'

/**
 * Envio de e-mail pela API do Zoho CPaaS (antigo ZeptoMail), extraído do
 * family-lists, onde roda em produção.
 *
 * Nunca lança: quem chama decide o que dizer à pessoa (a recuperação de conta,
 * por exemplo, responde de forma neutra mesmo com falha, para não revelar se o
 * endereço existe). A falha vai ao log e ao GlitchTip, sem o destinatário.
 */

export interface MailMessage {
  to: string
  subject: string
  text: string
  html: string
  /**
   * Identifica o envio no console do CPaaS (`client_reference`) e nos logs.
   * Vai ao provedor e ao GlitchTip: só tipo e id (`convite:<id>`), nunca o
   * endereço nem o token de um link.
   */
  reference?: string
}

export interface MailEnv {
  apiKey: string
  url: string
  fromAddress: string
  fromName: string
}

export const DEFAULT_CPAAS_URL = 'https://cpaas.zoho.com/v1.1/email'

export function readMailEnv(env: Env = process.env): MailEnv {
  return {
    apiKey: env.ZOHO_CPAAS_API_KEY || '',
    url: env.ZOHO_CPAAS_URL || DEFAULT_CPAAS_URL,
    fromAddress: env.MAIL_FROM_ADDRESS || '',
    fromName: env.MAIL_FROM_NAME || '',
  }
}

export function mailEnv(): MailEnv {
  return readMailEnv(process.env)
}

/** `true` com chave e remetente. Sem eles o e-mail fica desligado, o app segue. */
export function isMailConfigured(config: MailEnv = mailEnv()): boolean {
  return Boolean(config.apiKey && config.fromAddress)
}

/**
 * Falhas sem exceção por trás ganham tipo próprio, de mensagem fixa: a
 * impressão digital é `[mail, tipo]`, e recusas com status diferentes caem na
 * mesma issue, com o status no contexto.
 */
export class MailNotConfiguredError extends Error {
  override name = 'MailNotConfiguredError'
  constructor() {
    super('E-mail não configurado')
  }
}

export class MailRejectedError extends Error {
  override name = 'MailRejectedError'
  constructor() {
    super('CPaaS recusou o envio')
  }
}

/** O envio costuma acontecer dentro da requisição: provedor lento não pode prendê-la. */
const TIMEOUT_MS = 10_000

/**
 * Envia e informa se o provedor aceitou, sem lançar. Recebe a configuração e o
 * `fetch` para ser testável fora do Nuxt; no app, use `sendMail`.
 */
export async function deliverMail(
  config: MailEnv,
  message: MailMessage,
  fetchImpl: typeof fetch = fetch,
): Promise<boolean> {
  const reference = message.reference ?? ''
  if (!isMailConfigured(config)) {
    reportFailure('mail', new MailNotConfiguredError(), {
      message: 'E-mail não configurado; nada enviado',
      line: ['[mail] e-mail não configurado; nada enviado', reference],
      context: { reference },
    })
    return false
  }

  const body = {
    from: { address: config.fromAddress, ...(config.fromName ? { name: config.fromName } : {}) },
    to: [{ email_address: { address: message.to } }],
    subject: message.subject,
    textbody: message.text,
    htmlbody: message.html,
    // O rastreamento passaria os links por um redirecionamento do provedor, e
    // links de convite e de ação levam token.
    track_opens: false,
    track_clicks: false,
    ...(reference ? { client_reference: reference } : {}),
  }

  try {
    const response = await fetchImpl(config.url, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        Authorization: `Zoho-enczapikey ${config.apiKey}`,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })

    if (!response.ok) {
      const detail = await response.text().catch(() => '')
      // O corpo da resposta pode repetir o destinatário: só no console.
      reportFailure('mail', new MailRejectedError(), {
        message: 'CPaaS recusou o envio',
        line: [`[mail] CPaaS recusou o envio (${response.status})`, reference, detail],
        context: { reference, status: response.status },
      })
      return false
    }

    const result = (await response.json().catch(() => null)) as { request_id?: string } | null
    log.info('mail', 'Enviado {reference} {request_id}', {
      reference,
      request_id: result?.request_id ?? '',
    })
    return true
  } catch (error) {
    reportFailure('mail', error, {
      message: 'Falha ao enviar e-mail',
      line: ['[mail] falha ao enviar e-mail:', reference, (error as Error).message],
      context: { reference },
    })
    return false
  }
}

/** Envia um e-mail e informa se conseguiu, sem nunca lançar. */
export function sendMail(message: MailMessage): Promise<boolean> {
  return measureStep('enviar e-mail', 'http.client', async (step) => {
    const config = mailEnv()
    step.set('server.address', safeHost(config.url))
    return deliverMail(config, message)
  })
}

function safeHost(url: string): string {
  try {
    return new URL(url).host
  } catch {
    return '(inválido)'
  }
}

/** Link absoluto do app para pôr num e-mail (`/convite/x` → `https://app/convite/x`). */
export function appLink(path: string): string {
  return new URL(path, readBaseEnv().appUrl).href
}
