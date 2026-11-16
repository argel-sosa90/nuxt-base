/**
 * Contrato da autenticação entre servidor e navegador. Sem dependências: usado
 * pelos dois lados e pelos testes.
 */

export interface AuthUser {
  /**
   * Id da conta no app. Por padrão é o `sub` do IdP; o app troca pelo id do
   * perfil local no gancho `base:auth:login`. É o único dado da pessoa que
   * vai ao GlitchTip.
   */
  id: string
  /** `sub` do IdP: estável, nunca reaproveitado. É o vínculo com o perfil local. */
  sub: string
  email?: string
  emailVerified: boolean
  name?: string
}

/** Códigos de `?auth_error=` com que uma falha de login volta ao app. */
export type AuthErrorCode =
  'flow_expired' | 'idp_error' | 'access_denied' | 'email_unverified' | 'forbidden' | 'server_error'

/**
 * Destino depois do login: só caminho do próprio app. Recusa URL absoluta,
 * `//host` e `/\host` (que o navegador trata como outra origem) e as rotas de
 * `/auth/` (voltar ao login seria um laço).
 */
export function safeReturnTo(raw: unknown, fallback: string): string {
  if (typeof raw !== 'string' || raw.length === 0 || raw.length > 2048) return fallback
  if (!raw.startsWith('/') || raw.startsWith('//') || raw.startsWith('/\\')) return fallback
  if (/[\u0000-\u001f]/.test(raw)) return fallback
  if (raw === '/auth' || raw.startsWith('/auth/') || raw.startsWith('/auth?')) return fallback
  return raw
}
