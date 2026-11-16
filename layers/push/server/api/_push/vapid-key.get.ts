/**
 * Chave pública VAPID, que o navegador precisa para se inscrever. Por rota, e
 * não pela configuração pública do Nuxt: resolvida em execução, como o resto.
 * Vazia quando o push está desligado.
 */
export default defineEventHandler((event) => {
  setResponseHeader(event, 'Cache-Control', 'no-store')
  const config = pushEnv()
  return { publicKey: isPushConfigured(config) ? config.publicKey : '' }
})
