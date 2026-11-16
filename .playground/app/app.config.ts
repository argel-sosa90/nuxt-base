export default defineAppConfig({
  base: {
    project: 'playground',
    telemetry: {
      tokenPathPrefixes: ['/convite/', '/api/invites/'],
    },
    auth: {
      errorRedirect: '/',
    },
  },
})
