/// <reference lib="webworker" />
import { notificationFromPayload, safeTargetPath } from '../shared/push'

/**
 * Handlers de push do service worker. Importe de `@asolutions/nuxt-base/sw/push`
 * num service worker próprio do app.
 */
export function setupPush(sw: ServiceWorkerGlobalScope): void {
  sw.addEventListener('push', (event) => {
    let raw: unknown
    try {
      raw = event.data?.json()
    } catch {
      // Payload malformado não derruba o handler: sem título não há o que mostrar.
      return
    }
    const notification = notificationFromPayload(raw)
    if (!notification) return
    event.waitUntil(sw.registration.showNotification(notification.title, notification.options))
  })

  // Tocar leva à tela do assunto, reaproveitando uma janela do app aberta: abrir
  // uma aba nova a cada toque termina em dez abas do mesmo app. A autorização
  // é do servidor, ao carregar a tela.
  sw.addEventListener('notificationclick', (event) => {
    event.notification.close()
    const path = safeTargetPath((event.notification.data as { url?: unknown } | null)?.url)
    event.waitUntil(openPath(sw, path))
  })
}

async function openPath(sw: ServiceWorkerGlobalScope, path: string): Promise<void> {
  const windows = await sw.clients.matchAll({ type: 'window', includeUncontrolled: true })
  for (const client of windows) {
    if ('focus' in client) {
      await client.focus()
      // `navigate` falha em janela que o service worker não controla; o foco
      // sozinho ainda é melhor que outra aba.
      await client.navigate(path).catch(() => undefined)
      return
    }
  }
  await sw.clients.openWindow(path)
}
