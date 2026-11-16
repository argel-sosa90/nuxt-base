/**
 * No logout, o aparelho deixa de receber as notificações da conta que saiu:
 * sem isto, a próxima pessoa no mesmo navegador veria os avisos da anterior.
 */
export default defineNuxtPlugin((nuxtApp) => {
  nuxtApp.hook('base:auth:logout', () => usePush().disable())
})
