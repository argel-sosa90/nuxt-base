/**
 * Carrega a sessão antes da primeira renderização: no SSR, com o cookie da
 * requisição; numa página sem SSR, no navegador.
 */
export default defineNuxtPlugin({
  name: 'base:auth',
  async setup(nuxtApp) {
    if (import.meta.client && nuxtApp.payload.serverRendered) return
    try {
      await useAuth().refresh()
    } catch {
      // Sem a sessão a página abre como visitante; a rota protegida pede login.
    }
  },
})
