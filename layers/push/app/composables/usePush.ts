/**
 * Inscrição de push deste aparelho.
 *
 * Três estados são normais, nunca erro: navegador sem suporte, permissão
 * negada e servidor sem chave VAPID (`notConfigured`, separado de
 * `unsupported` para não culpar o navegador por falta de configuração). Em
 * nenhum deles a tela pode quebrar.
 *
 * `enable()` MUST ser chamada a partir de um gesto da pessoa, com contexto:
 * pedir permissão na primeira abertura é o caminho mais curto para a negação
 * definitiva, que o navegador depois não deixa pedir de novo.
 */

export type EnablePushResult = 'enabled' | 'denied' | 'unsupported' | 'notConfigured'

export function isPushSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  )
}

export function pushPermission(): NotificationPermission | 'unsupported' {
  return isPushSupported() ? Notification.permission : 'unsupported'
}

async function fetchVapidPublicKey(): Promise<string> {
  try {
    const { publicKey } = await $fetch<{ publicKey: string }>('/api/_push/vapid-key')
    return publicKey
  } catch {
    return ''
  }
}

/** `applicationServerKey` exige os bytes crus, não o base64url. */
function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4)
  const normalized = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(normalized)
  const output = new Uint8Array(new ArrayBuffer(raw.length))
  for (let i = 0; i < raw.length; i++) output[i] = raw.charCodeAt(i)
  return output
}

export function usePush() {
  /** Este aparelho tem inscrição? (`null` enquanto não conferiu) */
  const subscribed = useState<boolean | null>('base:push:subscribed', () => null)
  const permission = useState<NotificationPermission | 'unsupported'>(
    'base:push:permission',
    () => 'default',
  )

  /** Atualiza `subscribed` e `permission` com o estado real do aparelho. */
  async function refresh(): Promise<void> {
    permission.value = pushPermission()
    if (!isPushSupported()) {
      subscribed.value = false
      return
    }
    const registration = await navigator.serviceWorker.getRegistration()
    subscribed.value = Boolean(await registration?.pushManager.getSubscription())
  }

  async function enable(): Promise<EnablePushResult> {
    if (!isPushSupported()) return 'unsupported'

    // Sem chave no servidor não se gasta o único pedido de permissão.
    const publicKey = await fetchVapidPublicKey()
    if (!publicKey) return 'notConfigured'

    const result = await Notification.requestPermission()
    permission.value = result
    if (result !== 'granted') return 'denied'

    try {
      const registration = await navigator.serviceWorker.ready
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      })
      const raw = subscription.toJSON() as { endpoint?: string; keys?: Record<string, string> }
      if (!raw.endpoint || !raw.keys?.p256dh || !raw.keys?.auth) return 'unsupported'
      await $fetch('/api/_push/subscription', {
        method: 'POST',
        body: { endpoint: raw.endpoint, keys: { p256dh: raw.keys.p256dh, auth: raw.keys.auth } },
      })
    } catch (error) {
      // A tela decide o que mostrar (o erro sobe); o GlitchTip fica sabendo,
      // com o tipo e o status — nunca o endereço da inscrição.
      clientLog.warn('push', 'Falha ao ativar notificações', {
        error_type: errorType(error),
        status: (error as { response?: { status?: number } } | null)?.response?.status,
      })
      throw error
    }

    subscribed.value = true
    return 'enabled'
  }

  /**
   * Desinscreve nas DUAS pontas: só o servidor não impede o navegador de
   * receber o que já estava na fila do serviço; só o navegador deixa registro
   * morto no banco. Nunca lança: é chamada no logout.
   */
  async function disable(): Promise<void> {
    if (!isPushSupported()) return
    try {
      const registration = await navigator.serviceWorker.getRegistration()
      const subscription = await registration?.pushManager.getSubscription()
      if (!subscription) return
      const endpoint = subscription.endpoint
      await subscription.unsubscribe().catch(() => undefined)
      // Depois do `unsubscribe`: se a rede falhar aqui, o pior caso é registro
      // morto no banco, que o envio limpa ao receber 404/410.
      await $fetch('/api/_push/subscription', { method: 'DELETE', body: { endpoint } }).catch(
        () => undefined,
      )
    } catch {
      // Sair da conta nunca pode falhar por causa de push.
    } finally {
      subscribed.value = false
    }
  }

  return {
    subscribed: readonly(subscribed),
    permission: readonly(permission),
    refresh,
    enable,
    disable,
  }
}
