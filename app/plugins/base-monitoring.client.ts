import * as Sentry from '@sentry/vue'
import type { BaseAppConfig } from '../../shared/base-config'
import { createScrubber, MINIMAL_DATA_COLLECTION } from '../../shared/telemetry-scrub'

/**
 * GlitchTip no navegador, pela rota do próprio app (`/api/telemetry`), que
 * troca o DSN de preenchimento abaixo pelo do servidor. O endereço do
 * rastreador não chega ao cliente — nem pelo build, nem pela configuração
 * pública. Pela mesma razão o ambiente vem do servidor, na rota.
 *
 * Erros e logs, só: sem traços, sem sessão (o GlitchTip não aceita), sem
 * replay. Desligado em desenvolvimento.
 */

/** Só o formato importa: a rota descarta o destino e usa o do servidor. */
const PLACEHOLDER_DSN = 'https://cliente@telemetria.invalid/1'

/**
 * Integrações padrão que saem: a sessão do navegador; o `Dedupe`, que
 * descartaria a repetição de um erro (o que precisa acumular para o alerta por
 * frequência); e os rastros padrão, que voltam sem `dom` (o seletor tocado pode
 * trazer conteúdo da tela).
 */
const DROPPED_INTEGRATIONS = new Set(['BrowserSession', 'Dedupe', 'Breadcrumbs'])

export default defineNuxtPlugin({
  name: 'base:monitoring',
  dependsOn: ['base:auth'],
  setup(nuxtApp) {
    if (import.meta.dev) return

    const config = (useAppConfig() as unknown as { base: BaseAppConfig }).base
    const scrubber = createScrubber({
      tokenPathPrefixes: config.telemetry.tokenPathPrefixes,
      tokenQueryPaths: config.telemetry.tokenQueryPaths,
    })
    const service = `${config.project}-web`

    Sentry.init({
      app: nuxtApp.vueApp,
      dsn: PLACEHOLDER_DSN,
      tunnel: '/api/telemetry',
      release: `${config.project}@${useRuntimeConfig().app.buildId}`,
      traceLifecycle: 'static',
      dataCollection: MINIMAL_DATA_COLLECTION,
      // Props de componente podem trazer conteúdo da tela.
      attachProps: false,
      integrations: (defaults) => [
        ...defaults.filter((integration) => !DROPPED_INTEGRATIONS.has(integration.name)),
        Sentry.breadcrumbsIntegration({ dom: false }),
      ],
      beforeSend: (event, hint) => scrubber.scrubEvent(event, hint),
      beforeBreadcrumb: (breadcrumb) => scrubber.scrubBreadcrumb(breadcrumb),
      beforeSendLog: (entry) => scrubber.scrubLog(entry, service),
      initialScope: { tags: { service } },
    })

    // Erros por tela pelo molde da rota (`/convite/:token`), nunca pelo endereço.
    nuxtApp.$router.afterEach((to) => {
      Sentry.setTag('tela', to.matched.at(-1)?.path ?? '(desconhecida)')
    })

    // A pessoa só pelo id, acompanhando a sessão — inclusive ao sair e ao
    // trocar de conta no mesmo navegador.
    const { user } = useAuth()
    watch(
      () => user.value?.id,
      (id) => Sentry.setUser(id ? { id } : null),
      { immediate: true },
    )
  },
})
