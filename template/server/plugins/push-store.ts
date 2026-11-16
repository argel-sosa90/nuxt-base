import { useDatabase } from '../database/client'
import { createPushStore } from '../utils/push-store'

export default defineNitroPlugin(() => {
  if (import.meta.prerender) return
  // A inscrição é da conta da sessão (401 sem login).
  registerPushOwner(async (event) => (await requireAuthUser(event)).id)
  registerPushStore(createPushStore(useDatabase()))
})
