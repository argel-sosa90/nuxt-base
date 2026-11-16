import { fileURLToPath } from 'node:url'

/**
 * PWA instalável: manifest, service worker com precache e tela offline.
 * Uso: `extends: ['@asolutions/nuxt-base/pwa']` (traz o núcleo junto).
 *
 * O app define no seu nuxt.config só o que é dele:
 *
 *   pwa: { manifest: { name: 'Meu App', short_name: 'App', theme_color: '#16a34a' } }
 *
 * e põe os ícones em `public/` com os nomes abaixo (o template já traz).
 * Não declare `icons` no app: listas se SOMAM às do layer.
 */
export default defineNuxtConfig({
  extends: ['../..'],

  modules: ['@vite-pwa/nuxt'],

  pwa: {
    registerType: 'autoUpdate',
    // Service worker próprio (`injectManifest`), e não gerado: o `/push`
    // acrescenta os handlers de push, e um app pode ter o seu (ver README).
    strategies: 'injectManifest',
    srcDir: fileURLToPath(new URL('./service-worker', import.meta.url)),
    filename: 'sw.ts',
    // O @vite-pwa/nuxt NÃO tem padrão para isto: sem a lista, o precache sai
    // só com uns JSONs e nenhum JS/CSS do build (defeito já visto no
    // family-lists). `html` pela tela offline, o único HTML de um app SSR.
    injectManifest: {
      globPatterns: ['**/*.{js,css,png,svg,ico,webmanifest,html}'],
    },
    manifest: {
      lang: 'pt-BR',
      display: 'standalone',
      start_url: '/',
      background_color: '#ffffff',
      // `any` e `maskable` em arquivos diferentes: o Android recorta o
      // maskable, que precisa sangrar até a borda com o desenho na zona segura.
      icons: [
        { src: 'icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
        { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
        { src: 'icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
      ],
    },
    // Em `nuxt dev` o service worker fica desligado: a versão de
    // desenvolvimento não tem o precache real. Para testar push em dev, ligue
    // `pwa.devOptions.enabled` no app (com `type: 'module'`).
    devOptions: { enabled: false, type: 'module' },
  },

  // A tela offline é a única rota renderizada no build: `ssr: false` porque
  // não há sessão no build, e `prerender` para existir em `.output/public` e
  // entrar no precache.
  routeRules: {
    '/offline': { ssr: false, prerender: true },
  },

  // A extração de payload só vale para rota prerenderizada com SSR (não há
  // nenhuma) e faria o @vite-pwa/nuxt pôr no precache um padrão que não casa
  // com arquivo nenhum, com aviso em todo build.
  experimental: {
    payloadExtraction: false,
  },
})
