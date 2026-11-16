import * as oidc from 'openid-client'

/**
 * Encerra a sessão local e devolve a URL de logout do IdP (RP-initiated
 * logout), para onde o navegador deve ir. Sem isso, "Sair" seguido de
 * "Entrar" logaria de novo direto, e outra pessoa no mesmo aparelho entraria
 * na conta anterior.
 *
 * POST (a conferência de origem barra o logout forçado por outro site) que
 * responde `{ redirect }`; o `useAuth().logout()` faz a navegação.
 */
export default defineEventHandler(async (event) => {
  setResponseHeader(event, 'Cache-Control', 'no-store')
  const afterLogout = baseAppConfig().auth.afterLogout
  const user = await getAuthUser(event)

  let settings
  try {
    settings = authSettings()
  } catch {
    deleteCookie(event, SESSION_COOKIE, { path: '/' })
    return { redirect: afterLogout }
  }

  const session = await useAuthSession(event, settings)
  await session.clear()
  event.context.authUser = null
  await useNitroApp().hooks.callHook('base:auth:logout', { event, user })

  try {
    const config = await oidcConfiguration(settings)
    if (!config.serverMetadata().end_session_endpoint) return { redirect: afterLogout }
    const url = oidc.buildEndSessionUrl(config, {
      client_id: settings.oidc.clientId,
      post_logout_redirect_uri: new URL(afterLogout, settings.appUrl).href,
    })
    return { redirect: url.href }
  } catch (error) {
    reportFailure('auth', error, { message: 'Logout no IdP indisponível' })
    return { redirect: afterLogout }
  }
})
