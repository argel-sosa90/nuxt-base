/**
 * Nuxt Layer com as partes comuns dos apps da ASolutions. O app o usa com
 * `extends: ['@asolutions/nuxt-base']` e configura o resto em `app.config.ts`
 * (chave `base`) e em variáveis de ambiente lidas em EXECUÇÃO (ver README).
 *
 * Nada de `runtimeConfig` aqui, de propósito: o Nuxt congela o runtimeConfig
 * no build, e um valor lido de `process.env` no build da máquina de quem
 * desenvolve acabava assado na imagem (foi assim que o login do family-lists
 * quebrou em produção). O layer lê `process.env` na hora de usar.
 */
export default defineNuxtConfig({
  // Versão dos eventos do GlitchTip: `<projeto>@<buildId>`, igual no servidor e
  // no cliente. O SHA curto chega pelo build arg `APP_RELEASE`, que o workflow
  // reutilizável passa a todo build; sem ele fica o id aleatório do Nuxt.
  ...(process.env.APP_RELEASE ? { buildId: process.env.APP_RELEASE } : {}),

  typescript: {
    strict: true,
  },
})
