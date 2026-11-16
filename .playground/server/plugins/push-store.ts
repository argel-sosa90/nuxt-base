import type { PushSubscriptionRecord } from '../../../layers/push/server/utils/push'

// Inscrições em memória: o que o app faz com uma tabela (ver template).
const byEndpoint = new Map<string, PushSubscriptionRecord & { userId: string }>()

export default defineNitroPlugin(() => {
  registerPushStore({
    async save(userId, subscription) {
      byEndpoint.set(subscription.endpoint, { ...subscription, userId })
    },
    async remove(userId, endpoint) {
      if (byEndpoint.get(endpoint)?.userId === userId) byEndpoint.delete(endpoint)
    },
    async listForUser(userId) {
      return [...byEndpoint.values()].filter((row) => row.userId === userId)
    },
    async removeEndpoints(endpoints) {
      for (const endpoint of endpoints) byEndpoint.delete(endpoint)
    },
  })
})

/** Só para os testes: o estado do store. */
export function pushRows() {
  return [...byEndpoint.values()]
}
export function insertPushRow(userId: string, row: PushSubscriptionRecord) {
  byEndpoint.set(row.endpoint, { ...row, userId })
}
