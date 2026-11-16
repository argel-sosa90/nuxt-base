import { randomBytes } from 'node:crypto'
import { parseBoolean, readBaseEnv, type Env } from '../../../../server/utils/base-env'

/** Configuração do login, lida em execução (ver server/utils/base-env.ts do núcleo). */

export interface OidcEnv {
  issuer: string
  clientId: string
  /** Vazio: cliente público (só PKCE). Com valor: `client_secret_basic`. */
  clientSecret: string
  scopes: string
  requireEmailVerified: boolean
}

export interface AuthEnv {
  appUrl: string
  /** `null` quando o login não está configurado. */
  oidc: OidcEnv | null
  session: {
    secret: string
    maxAgeSeconds: number
    /** O segredo foi gerado nesta subida (só em desenvolvimento). */
    ephemeral: boolean
  }
}

export const DEFAULT_SESSION_DAYS = 7
export const DEFAULT_SCOPES = 'openid profile email'
const MIN_SECRET_LENGTH = 32

export function parseSessionDays(raw: string | undefined): number {
  const days = Number(raw)
  return Number.isFinite(days) && days > 0 ? days : DEFAULT_SESSION_DAYS
}

let ephemeralSecret: string | undefined

export function readAuthEnv(env: Env = process.env, options: { dev?: boolean } = {}): AuthEnv {
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
    appUrl: readBaseEnv(env).appUrl,
    oidc,
    session: {
      secret: secret.length >= MIN_SECRET_LENGTH ? secret : '',
      maxAgeSeconds: Math.round(parseSessionDays(env.SESSION_MAX_AGE_DAYS) * 24 * 60 * 60),
      ephemeral,
    },
  }
}

export function authEnv(): AuthEnv {
  return readAuthEnv(process.env, { dev: import.meta.dev })
}
