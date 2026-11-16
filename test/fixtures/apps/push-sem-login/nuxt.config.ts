// App sem login e sem banco: só o `/push` (que traz o núcleo e o `/pwa`).
export default defineNuxtConfig({
  extends: ['../../../../layers/push'],
  pwa: {
    manifest: { name: 'Sem login', short_name: 'Sem login', theme_color: '#16a34a' },
  },
  compatibilityDate: '2026-11-01',
  devtools: { enabled: false },
})
