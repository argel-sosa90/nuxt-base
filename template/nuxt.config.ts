// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  // Observabilidade (GlitchTip), login OIDC, /api/health, cabeçalhos de
  // segurança e conferência de origem vêm do layer. Configuração em
  // app/app.config.ts (chave `base`) e nas variáveis do .env.example.
  extends: ['@asolutions/nuxt-base'],

  compatibilityDate: '2026-11-01',

  modules: ['@nuxt/eslint', '@nuxt/ui'],

  devtools: { enabled: true },

  css: ['~/assets/css/main.css'],

  eslint: {
    config: {
      // Formatação é do Prettier; o ESLint cuida de correção.
      stylistic: false,
    },
  },

  // Ícones só do bundle local: sem chamada à API pública do Iconify.
  icon: {
    fallbackToApi: false,
    clientBundle: { scan: true },
  },

  app: {
    head: {
      htmlAttrs: { lang: 'pt-BR' },
      title: 'Meu App',
      meta: [
        { name: 'viewport', content: 'width=device-width, initial-scale=1, viewport-fit=cover' },
      ],
    },
  },
})
