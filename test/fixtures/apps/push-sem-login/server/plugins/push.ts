/**
 * O que um app sem login faz: agrupa os aparelhos por um canal (aqui, um
 * cabeçalho com um código aleatório que o app gerou) e guarda as inscrições
 * num arquivo.
 */
const CHANNEL = /^[\w-]{32,64}$/

export default defineNitroPlugin(() => {
  registerPushOwner((event) => {
    const channel = getRequestHeader(event, 'x-push-channel') ?? ''
    if (!CHANNEL.test(channel)) throw createError({ statusCode: 400, message: 'Canal inválido.' })
    return channel
  })
  registerPushStore(createFilePushStore(process.env.PUSH_STORE_FILE || 'data/push.json'))
})
