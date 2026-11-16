const STATE_CHANGING = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])

/**
 * Recusa requisição que altera estado vinda de outra origem (CSRF), antes de
 * qualquer handler ler o corpo ou tocar o banco. Vale para `/api/**` e
 * `/auth/**`. A origem esperada sai de `APP_URL`.
 *
 * 403 com a causa no log: quem configurar `APP_URL` errado acha o motivo.
 */
export default defineEventHandler((event) => {
  if (!STATE_CHANGING.has(event.method)) return
  if (!event.path.startsWith('/api/') && !event.path.startsWith('/auth/')) return

  const origin = getRequestHeader(event, 'origin')
  const expected = baseEnv().appOrigin
  if (isAllowedOrigin(origin, expected)) return

  log.warn(
    'origin',
    '{method} {path} recusado: origem "{origin}", esperada "{expected}". ' +
      'Se a origem recebida é o domínio real do app, APP_URL está errada.',
    { method: event.method, path: event.path.split('?')[0], origin, expected },
  )
  throw createError({
    statusCode: 403,
    statusMessage: 'Forbidden',
    message: 'Requisição recusada: origem não permitida.',
  })
})
