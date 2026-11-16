import { and, eq, inArray } from 'drizzle-orm'
import type { PushStore } from '@asolutions/nuxt-base/push/server'
import type { Database } from '../database/client'
import { pushSubscriptions } from '../database/schema'

/**
 * Onde o layer `/push` guarda as inscrições: a tabela `push_subscriptions`. O
 * dono é o id do perfil local (`registerPushOwner` no plugin).
 */
export function createPushStore(db: Database): PushStore {
  return {
    async save(owner, subscription) {
      await db
        .insert(pushSubscriptions)
        .values({ userId: owner, ...subscription })
        .onConflictDoUpdate({
          target: pushSubscriptions.endpoint,
          set: { userId: owner, p256dh: subscription.p256dh, auth: subscription.auth },
        })
    },
    async remove(owner, endpoint) {
      await db
        .delete(pushSubscriptions)
        .where(and(eq(pushSubscriptions.endpoint, endpoint), eq(pushSubscriptions.userId, owner)))
    },
    listForOwner(owner) {
      return db
        .select({
          endpoint: pushSubscriptions.endpoint,
          p256dh: pushSubscriptions.p256dh,
          auth: pushSubscriptions.auth,
        })
        .from(pushSubscriptions)
        .where(eq(pushSubscriptions.userId, owner))
    },
    async removeEndpoints(endpoints) {
      if (endpoints.length === 0) return
      await db.delete(pushSubscriptions).where(inArray(pushSubscriptions.endpoint, endpoints))
    },
  }
}
