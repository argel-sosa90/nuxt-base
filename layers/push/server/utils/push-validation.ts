import type { PushSubscriptionRecord } from './push'

/** Corpo de `POST /api/_push/subscription` (o `toJSON()` da inscrição do navegador). */
export function parseSubscriptionBody(body: unknown): PushSubscriptionRecord | null {
  if (!body || typeof body !== 'object') return null
  const { endpoint, keys } = body as {
    endpoint?: unknown
    keys?: { p256dh?: unknown; auth?: unknown }
  }
  if (typeof endpoint !== 'string' || endpoint.length > 1000) return null
  if (!keys || typeof keys !== 'object') return null
  const { p256dh, auth } = keys
  if (typeof p256dh !== 'string' || typeof auth !== 'string') return null
  if (!p256dh || !auth || p256dh.length > 500 || auth.length > 500) return null
  return { endpoint, p256dh, auth }
}
