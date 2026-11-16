import { useDatabase } from '../database/client'
import { findProfile } from '../utils/profile'

/** O perfil da pessoa logada. Modelo de rota protegida: `requireAuthUser` primeiro. */
export default defineEventHandler(async (event) => {
  const user = await requireAuthUser(event)
  const profile = await findProfile(useDatabase(), user.id)
  if (!profile) throw createError({ statusCode: 401, message: 'Sessão sem perfil.' })
  return {
    id: profile.id,
    email: profile.email,
    name: profile.name,
    createdAt: profile.createdAt.toISOString(),
  }
})
