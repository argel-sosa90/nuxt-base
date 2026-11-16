import { fileURLToPath } from 'node:url'

/**
 * Notificações por Web Push. Uso: `extends: ['@asolutions/nuxt-base/push']`
 * (traz o núcleo, o `/pwa` e o `/auth` junto: o push precisa do service worker
 * e a inscrição é de uma conta). Variáveis `VAPID_*`; o app registra onde as
 * inscrições ficam (`registerPushStore`, ver README).
 */
export default defineNuxtConfig({
  extends: ['../pwa', '../auth'],

  pwa: {
    // O service worker do `/pwa` mais os handlers de push.
    srcDir: fileURLToPath(new URL('./service-worker', import.meta.url)),
    filename: 'sw.ts',
  },
})
