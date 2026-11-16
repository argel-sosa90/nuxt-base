import { useDatabase } from '../database/client'
import { createPushStore } from '../utils/push-store'

export default defineNitroPlugin(() => {
  if (import.meta.prerender) return
  registerPushStore(createPushStore(useDatabase()))
})
