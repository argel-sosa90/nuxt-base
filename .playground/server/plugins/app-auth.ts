// O que um app faz no gancho: liga o `sub` ao perfil local e pode recusar.
export default defineNitroPlugin((nitroApp) => {
  nitroApp.hooks.hook('base:auth:login', ({ user }) => {
    if (user.email === 'bloqueado@example.com') {
      throw createError({ statusCode: 403, message: 'Conta bloqueada' })
    }
    user.id = `local-${user.sub}`
  })
  registerHealthCheck('playground', () => {
    if (process.env.PLAYGROUND_UNHEALTHY === '1') throw new Error('indisponível')
  })
})
