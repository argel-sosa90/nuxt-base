import { fileURLToPath } from 'node:url'

/**
 * Notificações por Web Push. Uso: `extends: ['@asolutions/nuxt-base/push']`
 * (traz o núcleo e o `/pwa` junto: o push precisa do service worker). Não
 * exige login: o app registra de quem é cada inscrição (`registerPushOwner`)
 * e onde elas ficam (`registerPushStore`). Variáveis `VAPID_*`; ver README.
 */
export default defineNuxtConfig({
  extends: ['../pwa'],

  pwa: {
    // O service worker do `/pwa` mais os handlers de push.
    srcDir: fileURLToPath(new URL('./service-worker', import.meta.url)),
    filename: 'sw.ts',
  },
})
