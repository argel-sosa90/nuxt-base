import type { H3Event } from 'h3'
import * as oidc from 'openid-client'
import type { AuthErrorCode } from '../../../shared/auth'

/**
 * Retorno do IdP: troca o código por tokens (com PKCE, `state` e `nonce`
 * conferidos e o ID token validado pelo `openid-client`), busca o `userinfo`,
 * chama o gancho `base:auth:login` do app e grava a sessão.
 *
 * Os tokens do IdP NÃO ficam guardados: a sessão é do app. Por isso um usuário
 * desativado no IdP continua logado até a sessão expirar (`SESSION_MAX_AGE_DAYS`).
 */

function failure(event: H3Event, code: AuthErrorCode) {
  const target = new URL(authAppConfig().errorRedirect, 'http://x')
  target.searchParams.set('auth_error', code)
  return sendRedirect(event, `${target.pathname}${target.search}`, 302)
}

export default defineEventHandler(async (event) => {
  setResponseHeader(event, 'Cache-Control', 'no-store')

  let settings
  try {
    settings = authSettings()
  } catch (error) {
    if (error instanceof AuthNotConfiguredError) {
      log.error('auth', error.message)
      throw createError({ statusCode: 503, message: 'Login indisponível.' })
    }
    throw error
  }

  const flow = await useAuthFlow(event, settings)
  const { verifier, state, nonce, returnTo } = flow.data
  await flow.clear()
  if (!verifier || !state || !nonce) return failure(event, 'flow_expired')

  const query = getQuery(event)
  if (typeof query.error === 'string') {
    // Recusa no IdP (a pessoa cancelou, ou o IdP negou): prevista, só log.
    log.warn('auth', 'IdP devolveu erro {error}', { error: query.error.slice(0, 64) })
    return failure(event, query.error === 'access_denied' ? 'access_denied' : 'idp_error')
  }

  let claims: Record<string, unknown>
  try {
    const config = await oidcConfiguration(settings)
    // A URL pública, e não a vista pelo Nitro: atrás do Traefik ela chega
    // como http e o `redirect_uri` não bateria.
    const currentUrl = new URL(event.path, settings.appUrl)
    const tokens = await oidc.authorizationCodeGrant(config, currentUrl, {
      pkceCodeVerifier: verifier,
      expectedState: state,
      expectedNonce: nonce,
      idTokenExpected: true,
    })
    const idClaims = tokens.claims() as Record<string, unknown> | undefined
    if (!idClaims) throw new Error('ID token ausente')
    claims = { ...idClaims }
    // O Zitadel (e outros) só põe e-mail e nome no ID token se configurado;
    // o `userinfo` sempre traz. Falha aqui não impede o login.
    try {
      const info = await oidc.fetchUserInfo(config, tokens.access_token, String(idClaims.sub))
      claims = { ...claims, ...info, sub: idClaims.sub }
    } catch (error) {
      reportFailure('auth', error, { message: 'userinfo do IdP falhou' })
    }
  } catch (error) {
    if (error instanceof oidc.AuthorizationResponseError) {
      log.warn('auth', 'IdP devolveu erro {error}', { error: error.error })
      return failure(event, error.error === 'access_denied' ? 'access_denied' : 'idp_error')
    }
    reportFailure('auth', error, { message: 'Troca do código de login falhou' })
    return failure(event, 'idp_error')
  }

  let user
  try {
    user = userFromClaims(claims)
  } catch (error) {
    reportFailure('auth', error, { message: 'Claims do IdP inválidas' })
    return failure(event, 'idp_error')
  }

  if (settings.oidc.requireEmailVerified && !user.emailVerified) {
    log.warn('auth', 'Login recusado: e-mail não verificado', { sub: user.sub })
    return failure(event, 'email_unverified')
  }

  try {
    await useNitroApp().hooks.callHook('base:auth:login', { event, claims, user })
  } catch (error) {
    const status = (error as { statusCode?: unknown }).statusCode
    if (typeof status === 'number' && status < 500) {
      log.warn('auth', 'Login recusado pelo app ({status})', { status, sub: user.sub })
      return failure(event, 'forbidden')
    }
    reportFailure('auth', error, { message: 'Gancho base:auth:login falhou' })
    return failure(event, 'server_error')
  }

  // Sessão nova a cada login: nada da anterior sobrevive.
  const session = await useAuthSession(event, settings)
  await session.clear()
  await session.update({ user, loginAt: Date.now() })
  event.context.authUser = user
  setMonitoringUser(event, user.id)
  log.info('auth', 'Login concluído', { user_id: user.id })

  return sendRedirect(event, returnTo || authAppConfig().afterLogin, 302)
})
