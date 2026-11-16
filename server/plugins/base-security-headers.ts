/**
 * Cabeçalhos de segurança em toda resposta, pelo gancho `request` do Nitro: os
 * arquivos de `public/` e `_nuxt/` são servidos ANTES dos middlewares e
 * sairiam sem cabeçalho. Não por `routeRules`, que é resolvido no build.
 */
export default defineNitroPlugin((nitroApp) => {
  const headers = securityHeaders({ dev: import.meta.dev })
  nitroApp.hooks.hook('request', (event) => {
    setResponseHeaders(event, headers)
  })
})
