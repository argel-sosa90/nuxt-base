import * as Sentry from '@sentry/vue'

/**
 * A pessoa no GlitchTip do navegador só pelo id, acompanhando a sessão —
 * inclusive ao sair e ao trocar de conta no mesmo navegador.
 */
export default defineNuxtPlugin({
  name: 'base:auth-monitoring',
  dependsOn: ['base:auth', 'base:monitoring'],
  setup() {
    if (import.meta.dev) return
    const { user } = useAuth()
    watch(
      () => user.value?.id,
      (id) => Sentry.setUser(id ? { id } : null),
      { immediate: true },
    )
  },
})
