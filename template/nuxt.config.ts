// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  // Partes comuns, uma entrada por feature (cada uma traz o núcleo:
  // GlitchTip, /api/health, cabeçalhos de segurança, conferência de origem):
  //   @asolutions/nuxt-base        só o núcleo
  //   @asolutions/nuxt-base/auth   login OIDC
  //   @asolutions/nuxt-base/mail   e-mail pelo Zoho CPaaS
  //   @asolutions/nuxt-base/pwa    PWA instalável, tela offline
  //   @asolutions/nuxt-base/push   Web Push (traz /pwa e /auth)
  // Configuração em app/app.config.ts (chave `base`) e no .env.example.
  extends: ['@asolutions/nuxt-base/push', '@asolutions/nuxt-base/mail'],

  compatibilityDate: '2026-11-01',

  modules: ['@nuxt/eslint', '@nuxt/ui'],

  devtools: { enabled: true },

  css: ['~/assets/css/main.css'],

  // Ícones em public/ com os nomes que o layer declara (icon-192.png,
  // icon-512.png, icon-maskable-512.png, badge-96.png). Não declare `icons` aqui.
  pwa: {
    manifest: {
      name: 'Meu App',
      short_name: 'Meu App',
      description: 'Meu App',
      theme_color: '#16a34a',
    },
  },

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
