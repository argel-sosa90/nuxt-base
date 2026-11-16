import type { AuthUser } from '../../shared/auth'

export type { AuthUser } from '../../shared/auth'

/**
 * Sessão no navegador. O estado vem do servidor no SSR (plugin `base:auth`) e
 * é só leitura aqui: quem decide é o cookie selado, conferido em cada rota.
 */
export function useAuth() {
  const user = useState<AuthUser | null>('base:auth:user', () => null)
  const loggedIn = computed(() => user.value !== null)

  async function refresh(): Promise<AuthUser | null> {
    const response = await useRequestFetch()<{ user: AuthUser | null }>('/api/_auth/session')
    user.value = response.user
    return user.value
  }

  /**
   * Vai ao IdP. Sem `returnTo`, volta para a tela atual. `prompt: 'create'`
   * abre direto o cadastro (nos IdPs que suportam).
   */
  function login(options: { returnTo?: string; prompt?: 'login' | 'create' } = {}) {
    const returnTo = options.returnTo ?? useRouter().currentRoute.value.fullPath
    const params = new URLSearchParams({ returnTo })
    if (options.prompt) params.set('prompt', options.prompt)
    return navigateTo(`/auth/login?${params}`, { external: true })
  }

  /** Encerra a sessão aqui e no IdP. */
  async function logout() {
    const { redirect } = await $fetch<{ redirect: string }>('/auth/logout', { method: 'POST' })
    user.value = null
    return navigateTo(redirect, { external: true })
  }

  return { user: readonly(user), loggedIn, refresh, login, logout }
}
