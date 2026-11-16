/**
 * Manda uma notificação de teste aos aparelhos da própria conta. Modelo de
 * envio: `sendPushToOwner` não lança e apaga as inscrições mortas sozinho.
 */
export default defineEventHandler(async (event) => {
  const user = await requireAuthUser(event)
  return sendPushToOwner(user.id, {
    title: 'Notificações ligadas',
    body: 'É assim que os avisos vão aparecer.',
    url: '/painel',
    tag: 'teste',
  })
})
