/**
 * Middleware nomeado: `definePageMeta({ middleware: 'auth' })` numa página que
 * exige login. Sem sessão, vai ao IdP e volta para a mesma página.
 *
 * Proteção de TELA, para a navegação. Sem rede (sessão desconhecida) a tela
 * abre: ir ao IdP offline só daria página de erro. Os dados continuam protegidos no
 * servidor: toda rota de API do app chama `requireAuthUser(event)`.
 */
export default defineNuxtRouteMiddleware((to) => {
  const { status } = useAuth()
  // `unknown`: sem rede (casca offline). A tela abre e mostra o que tiver;
  // os dados continuam exigindo sessão no servidor.
  if (status.value !== 'anonymous') return
  const params = new URLSearchParams({ returnTo: to.fullPath })
  return navigateTo(`/auth/login?${params}`, { external: true })
})
