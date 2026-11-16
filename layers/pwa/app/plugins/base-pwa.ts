/**
 * Link do manifest em toda página (sem ele o navegador não oferece instalar;
 * no family-lists era um `<VitePwaManifest />` que precisava ser lembrado no
 * `app.vue`) e limpeza dos caches de dados no logout.
 */
export default defineNuxtPlugin((nuxtApp) => {
  useHead({ link: [{ rel: 'manifest', href: '/manifest.webmanifest' }] })

  if (import.meta.server) return
  nuxtApp.hook('base:auth:logout', async () => {
    try {
      const registration = await navigator.serviceWorker?.getRegistration()
      registration?.active?.postMessage({ type: 'base:clear-runtime-caches' })
    } catch {
      // Sair nunca pode falhar por causa do service worker.
    }
  })
})
