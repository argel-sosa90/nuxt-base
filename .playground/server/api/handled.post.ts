export default defineEventHandler(() => {
  reportFailure('provider', new Error('recusado'), {
    message: 'Provedor recusou o envio',
    context: { status: 429 },
  })
  log.info('provider', 'Enviados {count} avisos', { count: 3 })
  return { ok: true }
})
