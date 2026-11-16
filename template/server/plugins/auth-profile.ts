import { useDatabase } from '../database/client'
import { upsertProfile } from '../utils/profile'

/**
 * Liga o login do IdP ao perfil local: a sessão passa a levar `users.id`, que é
 * o id usado pelas tabelas do app e o único dado da pessoa que vai ao GlitchTip.
 *
 * Para recusar alguém (lista de convidados, conta bloqueada), lance
 * `createError({ statusCode: 403 })` aqui: a pessoa volta com
 * `?auth_error=forbidden`.
 */
export default defineNitroPlugin((nitroApp) => {
  nitroApp.hooks.hook('base:auth:login', async ({ user }) => {
    const profile = await upsertProfile(useDatabase(), user)
    user.id = profile.id
  })
})
