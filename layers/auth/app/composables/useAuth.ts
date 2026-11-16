import type { AuthUser } from '../../shared/auth'

export type { AuthUser } from '../../shared/auth'

/**
 * - `authenticated` / `anonymous`: o servidor respondeu.
 * - `unknown`: não deu para perguntar (sem rede, numa tela aberta pela casca
 *   offline do PWA). Não é "sem login": mandar ao IdP sem rede só troca a tela
 *   por uma página de erro do navegador.
 */
export type AuthStatus = 'authenticated' | 'anonymous' | 'unknown'

/**
 * Sessão no navegador. O estado vem do servidor no SSR (plugin `base:auth`) e
 * é só leitura aqui: quem decide é o cookie selado, conferido em cada rota.
 */
export function useAuth() {
  const user = useState<AuthUser | null>('base:auth:user', () => null)
  const status = useState<AuthStatus>('base:auth:status', () => 'unknown')
  const loggedIn = computed(() => user.value !== null)

  /** Pergunta ao servidor. Sem resposta, o estado vira `unknown` e o erro sobe. */
  async function refresh(): Promise<AuthUser | null> {
    try {
      const response = await useRequestFetch()<{ user: AuthUser | null }>('/api/_auth/session')
      user.value = response.user
      status.value = response.user ? 'authenticated' : 'anonymous'
      return user.value
    } catch (error) {
      status.value = 'unknown'
      throw error
    }
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

  /**
   * Encerra a sessão aqui e no IdP. Antes, o gancho `base:auth:logout` deixa
   * cada feature limpar o que é da conta neste aparelho (o push desinscreve
   * o dispositivo; um app com cache offline apaga os dados da conta).
   */
  async function logout() {
    await useNuxtApp().callHook('base:auth:logout')
    const { redirect } = await $fetch<{ redirect: string }>('/auth/logout', { method: 'POST' })
    user.value = null
    status.value = 'anonymous'
    return navigateTo(redirect, { external: true })
  }

  return { user: readonly(user), status: readonly(status), loggedIn, refresh, login, logout }
}
