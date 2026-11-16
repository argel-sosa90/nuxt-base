<script setup lang="ts">
definePageMeta({ middleware: 'auth' })
const { user } = useAuth()
</script>

<template>
  <main data-test="private">Área de {{ user?.name }}</main>
</template>
