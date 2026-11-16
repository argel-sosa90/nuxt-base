/**
 * Middleware nomeado: `definePageMeta({ middleware: 'auth' })` numa página que
 * exige login. Sem sessão, vai ao IdP e volta para a mesma página.
 *
 * Proteção de TELA, para a navegação. Os dados continuam protegidos no
 * servidor: toda rota de API do app chama `requireAuthUser(event)`.
 */
export default defineNuxtRouteMiddleware((to) => {
  const { loggedIn } = useAuth()
  if (loggedIn.value) return
  const params = new URLSearchParams({ returnTo: to.fullPath })
  return navigateTo(`/auth/login?${params}`, { external: true })
})
