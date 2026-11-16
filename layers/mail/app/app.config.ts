/** Padrões do e-mail. O app sobrescreve em `app.config.ts`, na chave `base.mail`. */
export default defineAppConfig({
  base: {
    mail: {
      /** Nome no rodapé e no layout. Vazio: usa `MAIL_FROM_NAME`. */
      brandName: '',
      /** Cor do botão. */
      brandColor: '#16a34a',
      /** Rodapé de todo e-mail. */
      footer: 'Se você não esperava este e-mail, pode ignorá-lo.',
    },
  },
})

declare module 'nuxt/schema' {
  interface BaseAppConfigInput {
    mail?: {
      brandName?: string
      brandColor?: string
      footer?: string
    }
  }
}
