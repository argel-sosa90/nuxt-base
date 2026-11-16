/** Contrato do push entre servidor e service worker. Sem dependências. */

export interface PushMessage {
  title: string
  body?: string
  /**
   * Caminho do app aberto ao tocar (`/listas/42`). Só caminho da mesma origem;
   * qualquer outra coisa abre a raiz.
   */
  url?: string
  /** Notificações com a mesma `tag` se substituem em vez de empilhar. */
  tag?: string
  /** Ícone pequeno (silhueta, só o alfa conta). Padrão: `/badge-96.png`. */
  badge?: string
}

export const DEFAULT_BADGE = '/badge-96.png'

/** Caminho seguro para abrir: relativo à origem, sem `//host` nem `/\host`. */
export function safeTargetPath(url: unknown): string {
  if (
    typeof url !== 'string' ||
    !url.startsWith('/') ||
    url.startsWith('//') ||
    url.startsWith('/\\')
  ) {
    return '/'
  }
  return url
}

/**
 * Payload recebido → argumentos de `showNotification`, ou `null` se não há o
 * que mostrar. Tolerante: um service worker novo pode receber payload de uma
 * versão anterior do servidor.
 */
export function notificationFromPayload(raw: unknown): {
  title: string
  options: { body?: string; tag?: string; badge: string; data: { url: string } }
} | null {
  if (!raw || typeof raw !== 'object') return null
  const message = raw as Partial<PushMessage>
  if (typeof message.title !== 'string' || message.title.length === 0) return null
  return {
    title: message.title,
    options: {
      ...(typeof message.body === 'string' ? { body: message.body } : {}),
      ...(typeof message.tag === 'string' ? { tag: message.tag } : {}),
      badge: typeof message.badge === 'string' ? message.badge : DEFAULT_BADGE,
      data: { url: safeTargetPath(message.url) },
    },
  }
}
