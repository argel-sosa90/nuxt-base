import * as oidc from 'openid-client'
import { safeReturnTo } from '../../../shared/auth'

/**
 * Inicia o login: guarda verificador PKCE, `state`, `nonce` e o destino num
 * cookie selado de 10 minutos e redireciona ao IdP.
 *
 * `?returnTo=/caminho` volta para lá depois (só caminhos do app).
 * `?prompt=create` pede ao IdP a tela de cadastro (Zitadel e outros suportam).
 */
const ALLOWED_PROMPTS = new Set(['login', 'create', 'select_account', 'consent'])

export default defineEventHandler(async (event) => {
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

  const query = getQuery(event)
  const returnTo = safeReturnTo(query.returnTo, baseAppConfig().auth.afterLogin)
  const prompt =
    typeof query.prompt === 'string' && ALLOWED_PROMPTS.has(query.prompt) ? query.prompt : undefined

  let config
  try {
    config = await oidcConfiguration(settings)
  } catch (error) {
    reportFailure('auth', error, { message: 'Descoberta do IdP falhou' })
    throw createError({ statusCode: 503, message: 'Login indisponível.' })
  }

  const verifier = oidc.randomPKCECodeVerifier()
  const state = oidc.randomState()
  const nonce = oidc.randomNonce()

  const flow = await useAuthFlow(event, settings)
  await flow.clear()
  await flow.update({ verifier, state, nonce, returnTo })

  const url = oidc.buildAuthorizationUrl(config, {
    redirect_uri: settings.redirectUri,
    scope: settings.oidc.scopes,
    response_type: 'code',
    code_challenge: await oidc.calculatePKCECodeChallenge(verifier),
    code_challenge_method: 'S256',
    state,
    nonce,
    ...(prompt ? { prompt } : {}),
  })

  setResponseHeader(event, 'Cache-Control', 'no-store')
  return sendRedirect(event, url.href, 302)
})
