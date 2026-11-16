// App mínimo que estende o layer: desenvolvimento (`npm run dev`) e testes de integração.
export default defineNuxtConfig({
  extends: ['../layers/auth', '../layers/push', '../layers/mail'],
  pwa: {
    manifest: { name: 'Playground', short_name: 'Playground', theme_color: '#16a34a' },
  },
  compatibilityDate: '2026-11-01',
  devtools: { enabled: false },
})
