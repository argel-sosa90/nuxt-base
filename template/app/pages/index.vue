<script setup lang="ts">
const { loggedIn, login } = useAuth()
const route = useRoute()

const AUTH_ERRORS: Record<string, string> = {
  email_unverified: 'Confirme o seu e-mail antes de entrar.',
  access_denied: 'O login foi cancelado.',
  forbidden: 'Esta conta não tem acesso.',
  flow_expired: 'O login demorou demais. Tente de novo.',
}
const authError = computed(() => {
  const code = route.query.auth_error
  if (typeof code !== 'string') return null
  return AUTH_ERRORS[code] ?? 'Não foi possível entrar agora. Tente de novo.'
})
</script>

<template>
  <UContainer class="py-16 flex flex-col items-center gap-6 text-center">
    <h1 class="text-3xl font-semibold">Meu App</h1>
    <UAlert v-if="authError" color="error" variant="subtle" :title="authError" class="max-w-md" />
    <UButton v-if="loggedIn" to="/painel" size="lg">Abrir o painel</UButton>
    <div v-else class="flex gap-3">
      <UButton size="lg" @click="login({ returnTo: '/painel' })">Entrar</UButton>
      <UButton
        size="lg"
        variant="outline"
        @click="login({ returnTo: '/painel', prompt: 'create' })"
      >
        Criar conta
      </UButton>
    </div>
  </UContainer>
</template>
