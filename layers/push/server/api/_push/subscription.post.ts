import { parseSubscriptionBody } from '../../utils/push-validation'

/**
 * Inscreve este aparelho sob o dono que o app resolve (`registerPushOwner`):
 * a conta da sessão num app com login — nunca um id do corpo. Reinscrever o
 * mesmo aparelho atualiza a inscrição (upsert pelo endpoint), e é isso que a
 * transfere para a conta que acabou de entrar quando duas pessoas usam o
 * mesmo navegador.
 */
export default defineEventHandler(async (event) => {
  const owner = await resolvePushOwner(event)
  const subscription = parseSubscriptionBody(await readBody(event))
  if (!subscription) throw createError({ statusCode: 400, message: 'Inscrição inválida.' })
  if (!isPushConfigured()) throw createError({ statusCode: 503, message: 'Push desligado.' })
  if (!isAllowedPushEndpoint(subscription.endpoint, pushEnv().allowedHosts)) {
    log.warn('push', 'Inscrição recusada: serviço de push desconhecido ({host})', {
      host: pushHost(subscription.endpoint),
    })
    throw createError({ statusCode: 400, message: 'Serviço de push não reconhecido.' })
  }
  await usePushStore().save(owner, subscription)
  setResponseStatus(event, 204)
  return null
})
