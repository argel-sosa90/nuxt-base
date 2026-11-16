/**
 * Manda uma notificação de teste aos aparelhos da própria conta. Modelo de
 * envio: `sendPushToUser` não lança e apaga as inscrições mortas sozinho.
 */
export default defineEventHandler(async (event) => {
  const user = await requireAuthUser(event)
  return sendPushToUser(user.id, {
    title: 'Notificações ligadas',
    body: 'É assim que os avisos vão aparecer.',
    url: '/painel',
    tag: 'teste',
  })
})
