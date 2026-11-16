<script setup lang="ts">
definePageMeta({ middleware: 'auth' })

const { logout } = useAuth()
const { data: me } = await useFetch('/api/me')

const push = usePush()
const toast = useToast()
onMounted(() => push.refresh())

const PUSH_MESSAGES: Record<string, string> = {
  denied: 'As notificações estão bloqueadas nas configurações do navegador.',
  unsupported:
    'Este navegador não recebe notificações. No iPhone, instale o app na tela de início.',
  notConfigured: 'As notificações não estão disponíveis agora.',
}

async function togglePush() {
  if (push.subscribed.value) {
    await push.disable()
    return
  }
  try {
    const result = await push.enable()
    if (result === 'enabled') await $fetch('/api/push/test', { method: 'POST' })
    else toast.add({ title: PUSH_MESSAGES[result], color: 'warning' })
  } catch {
    toast.add({ title: 'Não foi possível ligar as notificações.', color: 'error' })
  }
}
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
    <div>
      <UButton
        :icon="push.subscribed.value ? 'i-lucide-bell-off' : 'i-lucide-bell'"
        variant="outline"
        @click="togglePush"
      >
        {{ push.subscribed.value ? 'Desligar notificações' : 'Ligar notificações' }}
      </UButton>
    </div>
  </UContainer>
</template>
