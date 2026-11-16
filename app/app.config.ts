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
  },
})

declare module 'nuxt/schema' {
  /** A chave `base`; cada sub-layer acrescenta a sua parte a esta interface. */
  interface BaseAppConfigInput {
    project?: string
    telemetry?: {
      tokenPathPrefixes?: string[]
      tokenQueryPaths?: string[]
      untracedPaths?: string[]
      alwaysSampledPaths?: string[]
    }
  }
  interface AppConfigInput {
    base?: BaseAppConfigInput
  }
}

declare module '#app' {
  interface RuntimeNuxtHooks {
    /**
     * No navegador, antes do logout (`useAuth().logout()`): cada feature limpa
     * o que é da conta neste aparelho. Não deve lançar: sair nunca pode falhar.
     */
    'base:auth:logout': () => void | Promise<void>
  }
}
