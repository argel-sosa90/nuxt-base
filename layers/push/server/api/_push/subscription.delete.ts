/**
 * Remove a inscrição deste aparelho. Filtra pelo dono resolvido: quem
 * conhecesse o endpoint de outra pessoa não consegue desinscrevê-la.
 */
export default defineEventHandler(async (event) => {
  const owner = await resolvePushOwner(event)
  const body = (await readBody(event)) as { endpoint?: unknown } | null
  const endpoint = body?.endpoint
  if (typeof endpoint !== 'string' || endpoint.length === 0 || endpoint.length > 1000) {
    throw createError({ statusCode: 400, message: 'Inscrição inválida.' })
  }
  await usePushStore().remove(owner, endpoint)
  setResponseStatus(event, 204)
  return null
})
