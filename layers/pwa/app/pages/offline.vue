<script setup lang="ts">
/**
 * Tela offline: o único HTML que existe estaticamente num app SSR, e por isso
 * o único que o service worker pode servir sem rede. A navegação que falha
 * recebe esta página; o endereço na barra continua o pedido, e o roteador do
 * Nuxt monta aquela página no cliente. Esta tela aparece por um instante, ou
 * fica, se alguém abrir `/offline` direto.
 *
 * Para trocar o visual, crie `app/pages/offline.vue` no app (ele vence o do layer).
 */
definePageMeta({ layout: false })
const message = (useAppConfig() as unknown as { base: { pwa: { offlineMessage: string } } }).base
  .pwa.offlineMessage
</script>

<template>
  <div
    style="
      min-height: 100dvh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 16px;
      text-align: center;
      font-family: system-ui, sans-serif;
      color: #64748b;
    "
  >
    <p>{{ message }}</p>
  </div>
</template>
