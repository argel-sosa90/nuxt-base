/**
 * Liga o GlitchTip no servidor.
 *
 * `00.` no nome: o Nitro roda os plugins em ordem alfabética (os do layer antes
 * dos do app), e este precisa vir antes de qualquer outro que possa falhar na
 * subida, como as migrations.
 *
 * Plugin do Nitro, e não `@sentry/nuxt`: o arquivo de configuração daquele SDK
 * roda antes do Nitro e exige `node --import`. Aqui a configuração é a de
 * execução, como todo o resto.
 *
 * O prerender do build sobe uma instância Nitro própria; um cliente do
 * rastreador ali só atrasaria o fim do build.
 */
export default defineNitroPlugin((nitroApp) => {
  if (import.meta.prerender) return

  const { monitoring } = baseEnv()
  const config = baseAppConfig()
  const started = initMonitoring({
    ...monitoring,
    project: config.project,
    release: releaseName(),
    scrub: scrubRules(),
    untracedPaths: config.telemetry.untracedPaths,
    alwaysSampledPaths: config.telemetry.alwaysSampledPaths,
  })
  if (!started) return

  // O h3 1.x chama `app.handler` a cada requisição; envolvê-lo põe o
  // tratamento inteiro dentro da transação.
  const handler = nitroApp.h3App.handler
  nitroApp.h3App.handler = (event) => traceRequest(event, () => handler(event))

  nitroApp.hooks.hook('error', (error, { event }) => captureServerError(error, event))
  nitroApp.hooks.hook('close', () => closeMonitoring())
})
