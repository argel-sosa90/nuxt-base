import { insertPushRow, pushRows } from '../plugins/push-store'

/**
 * Só para os testes de integração: põe inscrições direto no store (o endereço
 * do serviço de push falso é http local, que a rota de inscrição recusa) e
 * dispara um envio à conta da sessão.
 */
export default defineEventHandler(async (event) => {
  const user = await requireAuthUser(event)
  const body = (await readBody(event)) as {
    insert?: { endpoint: string; p256dh: string; auth: string }[]
  }
  for (const row of body.insert ?? []) insertPushRow(user.id, row)
  const report = await sendPushToUser(user.id, { title: 'Olá', body: 'Teste', url: '/privado' })
  return { report, rows: pushRows().map((row) => row.endpoint) }
})
