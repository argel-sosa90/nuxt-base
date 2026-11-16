import { randomBytes } from 'node:crypto'

/**
 * Configuração do layer, lida de `process.env` em EXECUÇÃO — nunca assada no
 * build (ver nuxt.config.ts). Funções puras sobre um objeto de ambiente, para
 * os testes não dependerem do Nitro.
 */

export type Env = Record<string, string | undefined>

export interface OidcEnv {
  issuer: string
  clientId: string
  /** Vazio: cliente público (só PKCE). Com valor: `client_secret_basic`. */
  clientSecret: string
  scopes: string
  requireEmailVerified: boolean
}

export interface BaseEnv {
  /** URL pública do app (`APP_URL`): origem esperada, redirect URIs, cookie `Secure`. */
  appUrl: string
  appOrigin: string
  /** `APP_ENV`: ambiente dos eventos; as regras de alerta filtram por `production`. */
  environment: string
  monitoring: {
    dsn: string
    tracesSampleRate: number
    environment: string
  }
  /** `null` quando o login não está configurado. */
  oidc: OidcEnv | null
  session: {
    secret: string
    maxAgeSeconds: number
    /** O segredo foi gerado nesta subida (só em desenvolvimento). */
    ephemeral: boolean
  }
}

/** Amostragem quando a variável não existe: uma requisição em cada dez. */
export const DEFAULT_TRACES_SAMPLE_RATE = 0.1
export const DEFAULT_SESSION_DAYS = 7
export const DEFAULT_SCOPES = 'openid profile email'
const MIN_SECRET_LENGTH = 32

/**
 * Fração das requisições medidas. Valor fora de 0–1, ou que não é número,
 * DESLIGA a medição em vez de cair no padrão: quem escreveu algo quis mudar a
 * amostragem, e medir mais do que pediu ocupa a instância compartilhada.
 */
export function parseSampleRate(raw: string | undefined): number {
  if (raw === undefined || raw.trim() === '') return DEFAULT_TRACES_SAMPLE_RATE
  const rate = Number(raw)
  if (Number.isFinite(rate) && rate >= 0 && rate <= 1) return rate
  console.warn(
    `[base] GLITCHTIP_TRACES_SAMPLE_RATE="${raw}" fora de 0–1; medição de desempenho desligada`,
  )
  return 0
}

export function parseBoolean(raw: string | undefined, fallback: boolean): boolean {
  if (raw === undefined || raw.trim() === '') return fallback
  return !['false', '0', 'no', 'off'].includes(raw.trim().toLowerCase())
}

export function parseSessionDays(raw: string | undefined): number {
  const days = Number(raw)
  return Number.isFinite(days) && days > 0 ? days : DEFAULT_SESSION_DAYS
}

let ephemeralSecret: string | undefined

export function readBaseEnv(env: Env = process.env, options: { dev?: boolean } = {}): BaseEnv {
  const appUrl = (env.APP_URL || 'http://localhost:3000').replace(/\/+$/, '')
  const environment = env.APP_ENV || 'production'

  const issuer = (env.OIDC_ISSUER || '').replace(/\/+$/, '')
  const clientId = env.OIDC_CLIENT_ID || ''
  const oidc: OidcEnv | null =
    issuer && clientId
      ? {
          issuer,
          clientId,
          clientSecret: env.OIDC_CLIENT_SECRET || '',
          scopes: env.OIDC_SCOPES || DEFAULT_SCOPES,
          requireEmailVerified: parseBoolean(env.OIDC_REQUIRE_EMAIL_VERIFIED, true),
        }
      : null

  // Em desenvolvimento, sem SESSION_SECRET, um segredo aleatório por subida:
  // o login funciona e as sessões caem a cada reinício. Em produção, sem
  // segredo válido, o login responde 503 (ver server/utils/auth.ts).
  let secret = env.SESSION_SECRET || ''
  let ephemeral = false
  if (secret.length < MIN_SECRET_LENGTH && options.dev) {
    if (!ephemeralSecret) ephemeralSecret = randomBytes(32).toString('hex')
    secret = ephemeralSecret
    ephemeral = true
  }

  return {
    appUrl,
    appOrigin: new URL(appUrl).origin,
    environment,
    monitoring: {
      dsn: env.GLITCHTIP_DSN || '',
      tracesSampleRate: parseSampleRate(env.GLITCHTIP_TRACES_SAMPLE_RATE),
      environment,
    },
    oidc,
    session: {
      secret: secret.length >= MIN_SECRET_LENGTH ? secret : '',
      maxAgeSeconds: Math.round(parseSessionDays(env.SESSION_MAX_AGE_DAYS) * 24 * 60 * 60),
      ephemeral,
    },
  }
}

/** A configuração corrente do servidor. */
export function baseEnv(): BaseEnv {
  return readBaseEnv(process.env, { dev: import.meta.dev })
}
