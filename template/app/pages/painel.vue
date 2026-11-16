<script setup lang="ts">
definePageMeta({ middleware: 'auth' })

const { logout } = useAuth()
const { data: me } = await useFetch('/api/me')
</script>

<template>
  <UContainer class="py-16 flex flex-col gap-6">
    <div class="flex items-center justify-between">
      <h1 class="text-2xl font-semibold">Olá, {{ me?.name ?? me?.email }}</h1>
      <UButton variant="ghost" icon="i-lucide-log-out" @click="logout()">Sair</UButton>
    </div>
    <p class="text-muted">
      Conta criada em {{ me && new Date(me.createdAt).toLocaleDateString('pt-BR') }}.
    </p>
  </UContainer>
</template>
