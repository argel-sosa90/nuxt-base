/**
 * Padrões do layer. O app sobrescreve em `app.config.ts`:
 *
 *   export default defineAppConfig({
 *     base: {
 *       project: 'meu-app',
 *       telemetry: { tokenPathPrefixes: ['/convite/', '/api/invites/'] },
 *     },
 *   })
 *
 * O `appConfig` existe no servidor e no navegador, e é o que garante que as
 * regras de limpeza sejam as mesmas nos dois lados. Listas se SOMAM às do
 * layer (merge do `defu`).
 */
export default defineAppConfig({
  base: {
    /** Slug do projeto: nome no GlitchTip, prefixo da versão e dos serviços. */
    project: 'app',
    telemetry: {
      /** Prefixos cujo segmento seguinte é um token (`/convite/` → `/convite/[token]`). */
      tokenPathPrefixes: [] as string[],
      /** Caminhos cuja consulta leva um token e vira `?[token]`. */
      tokenQueryPaths: [] as string[],
      /** Rotas `/api/**` que nunca viram transação, além das do layer. */
      untracedPaths: [] as string[],
      /** Rotas sempre medidas, fora da amostragem (ex.: a disparada pelo cron). */
      alwaysSampledPaths: [] as string[],
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
  interface AppConfigInput {
    base?: {
      project?: string
      telemetry?: {
        tokenPathPrefixes?: string[]
        tokenQueryPaths?: string[]
        untracedPaths?: string[]
        alwaysSampledPaths?: string[]
      }
      auth?: {
        afterLogin?: string
        afterLogout?: string
        errorRedirect?: string
      }
    }
  }
}
