/** Só para o teste: envia ao canal, como o webhook de um app faria. */
export default defineEventHandler(async (event) => {
  const { channel } = (await readBody(event)) as { channel: string }
  return sendPushToOwner(channel, { title: 'Alerta', body: 'Teste', url: '/' })
})
