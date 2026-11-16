import { and, eq, inArray } from 'drizzle-orm'
import type { PushStore } from '@asolutions/nuxt-base/push/server'
import type { Database } from '../database/client'
import { pushSubscriptions } from '../database/schema'

/** Onde o layer `/push` guarda as inscrições: a tabela `push_subscriptions`. */
export function createPushStore(db: Database): PushStore {
  return {
    async save(userId, subscription) {
      await db
        .insert(pushSubscriptions)
        .values({ userId, ...subscription })
        .onConflictDoUpdate({
          target: pushSubscriptions.endpoint,
          set: { userId, p256dh: subscription.p256dh, auth: subscription.auth },
        })
    },
    async remove(userId, endpoint) {
      await db
        .delete(pushSubscriptions)
        .where(and(eq(pushSubscriptions.endpoint, endpoint), eq(pushSubscriptions.userId, userId)))
    },
    listForUser(userId) {
      return db
        .select({
          endpoint: pushSubscriptions.endpoint,
          p256dh: pushSubscriptions.p256dh,
          auth: pushSubscriptions.auth,
        })
        .from(pushSubscriptions)
        .where(eq(pushSubscriptions.userId, userId))
    },
    async removeEndpoints(endpoints) {
      if (endpoints.length === 0) return
      await db.delete(pushSubscriptions).where(inArray(pushSubscriptions.endpoint, endpoints))
    },
  }
}
