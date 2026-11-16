export default defineAppConfig({
  base: {
    // Slug do projeto: nome do projeto no GlitchTip, prefixo da versão
    // (`meu-app@<sha>`) e dos serviços (`meu-app-api`, `-cron`, `-web`).
    project: 'meu-app',
    telemetry: {
      // Caminhos cujo segmento seguinte é um token (convites, links de ação):
      // viram `[token]` em tudo que vai ao GlitchTip.
      tokenPathPrefixes: [],
    },
    auth: {
      afterLogin: '/painel',
      afterLogout: '/',
      errorRedirect: '/',
    },
  },
  ui: {
    colors: {
      primary: 'green',
      neutral: 'zinc',
    },
  },
})
