export default defineAppConfig({
  base: {
    pwa: {
      /** Texto da tela offline do layer. */
      offlineMessage: 'Sem conexão. Abrindo o que está salvo no aparelho...',
    },
  },
})

declare module 'nuxt/schema' {
  interface BaseAppConfigInput {
    pwa?: {
      offlineMessage?: string
    }
  }
}
