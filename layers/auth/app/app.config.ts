/** Padrões do login. O app sobrescreve em `app.config.ts`, na chave `base.auth`. */
export default defineAppConfig({
  base: {
    telemetry: {
      // Consultado a cada página: dominaria a lista de transações.
      untracedPaths: ['/api/_auth/session'],
    },
    auth: {
      /** Para onde o login volta quando não há `returnTo`. */
      afterLogin: '/',
      /** `post_logout_redirect_uri` (caminho; precisa estar cadastrado no IdP). */
      afterLogout: '/',
      /** Para onde uma falha de login leva, com `?auth_error=<código>`. */
      errorRedirect: '/',
    },
  },
})

declare module 'nuxt/schema' {
  interface BaseAppConfigInput {
    auth?: {
      afterLogin?: string
      afterLogout?: string
      errorRedirect?: string
    }
  }
}
