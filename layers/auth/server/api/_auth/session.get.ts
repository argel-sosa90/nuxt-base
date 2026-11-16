/**
 * O usuário da sessão, para o navegador (`useAuth`). `{ user: null }` sem login.
 * Nunca devolve token: a sessão inteira fica no servidor, selada no cookie.
 */
export default defineEventHandler(async (event) => {
  setResponseHeader(event, 'Cache-Control', 'no-store')
  return { user: await getAuthUser(event) }
})
