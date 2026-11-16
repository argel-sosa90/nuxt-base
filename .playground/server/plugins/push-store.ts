import type { PushSubscriptionRecord } from '../../../layers/push/server/utils/push'

// Inscrições em memória: o que o app faz com uma tabela (ver template).
const byEndpoint = new Map<string, PushSubscriptionRecord & { owner: string }>()

export default defineNitroPlugin(() => {
  // App com login: a inscrição é da conta da sessão (401 sem sessão).
  registerPushOwner(async (event) => (await requireAuthUser(event)).id)
  registerPushStore({
    async save(owner, subscription) {
      byEndpoint.set(subscription.endpoint, { ...subscription, owner })
    },
    async remove(owner, endpoint) {
      if (byEndpoint.get(endpoint)?.owner === owner) byEndpoint.delete(endpoint)
    },
    async listForOwner(owner) {
      return [...byEndpoint.values()].filter((row) => row.owner === owner)
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
export function insertPushRow(owner: string, row: PushSubscriptionRecord) {
  byEndpoint.set(row.endpoint, { ...row, owner })
}
