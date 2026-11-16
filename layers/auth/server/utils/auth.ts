import type { H3Event } from 'h3'
import * as oidc from 'openid-client'
import type { AuthAppConfig, AuthUser } from '../../shared/auth'
import { authEnv } from './auth-env'

/**
 * Autenticação por OIDC genérico (Authorization Code + PKCE) com sessão em
 * cookie selado (h3 `useSession`, AES-256 + HMAC).
 *
 * Genérico de propósito: o IdP é só configuração (`OIDC_ISSUER`,
 * `OIDC_CLIENT_ID`, `OIDC_CLIENT_SECRET`). Zitadel, Authentik, Keycloak,
 * Authelia, Pocket ID ou Logto servem igual; trocar de IdP é trocar variáveis
 * e cadastrar o app lá.
 *
 * O app mantém só o perfil local, ligado ao `sub`, pelo gancho
 * `base:auth:login` (ver README).
 */

export type { AuthUser } from '../../shared/auth'

export interface AuthLoginContext {
  event: H3Event
  /** Claims do ID token mesclados com o `userinfo`. Dados de terceiro: valide. */
  claims: Record<string, unknown>
  /** O usuário que vai para a sessão. O gancho pode trocar `id` e os demais campos. */
  user: AuthUser
}

declare module 'nitropack/types' {
  interface NitroRuntimeHooks {
    /**
     * Depois de o IdP autenticar e antes de a sessão ser gravada. Crie ou
     * atualize o perfil local pelo `sub` e ponha o id dele em `ctx.user.id`.
     * Lançar `createError({ statusCode: 403 })` recusa o login.
     */
    'base:auth:login': (ctx: AuthLoginContext) => void | Promise<void>
    /** Depois de a sessão local ser apagada no logout. */
    'base:auth:logout': (ctx: { event: H3Event; user: AuthUser | null }) => void | Promise<void>
  }
}

export const SESSION_COOKIE = 'base-session'
const FLOW_COOKIE = 'base-oidc-flow'
/** Tempo para a pessoa concluir o login no IdP. */
const FLOW_MAX_AGE_SECONDS = 10 * 60

interface SessionData {
  user?: AuthUser
  loginAt?: number
}

interface FlowData {
  verifier?: string
  state?: string
  nonce?: string
  returnTo?: string
}

export class AuthNotConfiguredError extends Error {
  override name = 'AuthNotConfiguredError'
  constructor(reason: string) {
    super(`Autenticação não configurada: ${reason}`)
  }
}

/** Configuração do login, ou erro dizendo o que falta. */
export function authSettings() {
  const env = authEnv()
  if (!env.oidc) throw new AuthNotConfiguredError('defina OIDC_ISSUER e OIDC_CLIENT_ID')
  if (!env.session.secret) {
    throw new AuthNotConfiguredError('SESSION_SECRET ausente ou com menos de 32 caracteres')
  }
  return {
    oidc: env.oidc,
    secret: env.session.secret,
    maxAgeSeconds: env.session.maxAgeSeconds,
    appUrl: env.appUrl,
    secure: env.appUrl.startsWith('https://'),
    redirectUri: `${env.appUrl}/auth/callback`,
  }
}

type AuthSettings = ReturnType<typeof authSettings>

// ---------------------------------------------------------------------------
// Descoberta do IdP (memorizada; uma falha não fica em cache)
// ---------------------------------------------------------------------------

const discoveries = new Map<string, Promise<oidc.Configuration>>()

export function oidcConfiguration(settings: AuthSettings): Promise<oidc.Configuration> {
  const { issuer, clientId, clientSecret } = settings.oidc
  const key = `${issuer}|${clientId}|${clientSecret}`
  let pending = discoveries.get(key)
  if (!pending) {
    pending = oidc
      .discovery(
        new URL(issuer),
        clientId,
        undefined,
        clientSecret ? oidc.ClientSecretBasic(clientSecret) : oidc.None(),
        // HTTP só para IdP local (desenvolvimento e testes).
        issuer.startsWith('http://') ? { execute: [oidc.allowInsecureRequests] } : undefined,
      )
      .catch((error: unknown) => {
        discoveries.delete(key)
        throw error
      })
    discoveries.set(key, pending)
  }
  return pending
}

// ---------------------------------------------------------------------------
// Sessões
// ---------------------------------------------------------------------------

function sessionConfig(settings: AuthSettings) {
  return {
    name: SESSION_COOKIE,
    password: settings.secret,
    maxAge: settings.maxAgeSeconds,
    // Só pelo cookie; o h3 também aceitaria a sessão num cabeçalho.
    sessionHeader: false as const,
    cookie: {
      httpOnly: true,
      secure: settings.secure,
      sameSite: 'lax' as const,
      path: '/',
      maxAge: settings.maxAgeSeconds,
    },
  }
}

function flowConfig(settings: AuthSettings) {
  return {
    name: FLOW_COOKIE,
    password: settings.secret,
    maxAge: FLOW_MAX_AGE_SECONDS,
    sessionHeader: false as const,
    // `lax`: o retorno do IdP é uma navegação de topo (GET), que leva o cookie.
    cookie: {
      httpOnly: true,
      secure: settings.secure,
      sameSite: 'lax' as const,
      path: '/auth',
      maxAge: FLOW_MAX_AGE_SECONDS,
    },
  }
}

export function useAuthSession(event: H3Event, settings = authSettings()) {
  return useSession<SessionData>(event, sessionConfig(settings))
}

export function useAuthFlow(event: H3Event, settings = authSettings()) {
  return useSession<FlowData>(event, flowConfig(settings))
}

/**
 * O usuário da requisição, ou `null`. Não cria cookie para quem não tem
 * sessão (o `useSession` do h3 criaria). Também anota o id no GlitchTip.
 */
export async function getAuthUser(event: H3Event): Promise<AuthUser | null> {
  const cached = event.context.authUser as AuthUser | null | undefined
  if (cached !== undefined) return cached
  let user: AuthUser | null = null
  if (getCookie(event, SESSION_COOKIE)) {
    try {
      const session = await useAuthSession(event)
      user = session.data.user ?? null
    } catch (error) {
      if (!(error instanceof AuthNotConfiguredError)) throw error
    }
  }
  event.context.authUser = user
  if (user) setMonitoringUser(event, user.id)
  return user
}

/** O usuário da requisição, ou 401. Para rotas de API que exigem login. */
export async function requireAuthUser(event: H3Event): Promise<AuthUser> {
  const user = await getAuthUser(event)
  if (!user) {
    throw createError({
      statusCode: 401,
      statusMessage: 'Unauthorized',
      message: 'Login necessário.',
    })
  }
  return user
}

// ---------------------------------------------------------------------------
// Claims → usuário
// ---------------------------------------------------------------------------

function stringClaim(claims: Record<string, unknown>, key: string): string | undefined {
  const value = claims[key]
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

/**
 * `email_verified` pode vir como booleano ou como texto (`"true"`): alguns IdPs
 * mandam string no `userinfo`.
 */
export function userFromClaims(claims: Record<string, unknown>): AuthUser {
  const sub = stringClaim(claims, 'sub')
  if (!sub) throw new Error('Claim sub ausente')
  const verified = claims.email_verified
  const name =
    stringClaim(claims, 'name') ??
    ([stringClaim(claims, 'given_name'), stringClaim(claims, 'family_name')]
      .filter(Boolean)
      .join(' ') ||
      stringClaim(claims, 'preferred_username'))
  return {
    id: sub,
    sub,
    email: stringClaim(claims, 'email')?.toLowerCase(),
    emailVerified: verified === true || verified === 'true',
    ...(name ? { name } : {}),
  }
}

/** A chave `base.auth` do `app.config.ts`, com os padrões do layer. */
export function authAppConfig(): AuthAppConfig {
  return (useAppConfig() as unknown as { base: { auth: AuthAppConfig } }).base.auth
}
