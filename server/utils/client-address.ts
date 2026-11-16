import type { H3Event } from 'h3'

/**
 * O endereço de quem enviou. Atrás do Traefik (Dokploy), o último valor de
 * `X-Forwarded-For` é o que ELE acrescentou; os anteriores vêm do cliente e não
 * valem como identidade.
 */
export function clientAddress(event: H3Event): string {
  const forwarded = getRequestHeader(event, 'x-forwarded-for')
  const last = forwarded?.split(',').pop()?.trim()
  return last || event.node.req.socket.remoteAddress || 'desconhecido'
}
