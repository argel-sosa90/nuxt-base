// App mínimo que estende o layer: desenvolvimento (`npm run dev`) e testes de integração.
export default defineNuxtConfig({
  extends: ['..'],
  compatibilityDate: '2026-11-01',
  devtools: { enabled: false },
})
