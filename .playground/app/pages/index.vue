<script setup lang="ts">
const { user, loggedIn, login, logout } = useAuth()
const route = useRoute()
</script>

<template>
  <main>
    <h1>playground</h1>
    <p v-if="route.query.auth_error" data-test="auth-error">Erro: {{ route.query.auth_error }}</p>
    <template v-if="loggedIn">
      <p data-test="user">{{ user?.id }} · {{ user?.email }}</p>
      <button @click="logout()">Sair</button>
    </template>
    <button v-else @click="login({ returnTo: '/privado' })">Entrar</button>
  </main>
</template>
