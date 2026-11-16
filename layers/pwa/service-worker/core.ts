/// <reference lib="webworker" />
import {
  cleanupOutdatedCaches,
  createHandlerBoundToURL,
  precacheAndRoute,
} from 'workbox-precaching'
import { NavigationRoute, registerRoute } from 'workbox-routing'

/**
 * Partes do service worker do layer, para montar o `sw.ts` do `/pwa`, o do
 * `/push` ou o de um app com cache próprio (importe de
 * `@asolutions/nuxt-base/sw`).
 *
 * O manifesto de precache entra como argumento: o @vite-pwa/nuxt procura o
 * texto literal `self.__WB_MANIFEST` no `sw.ts` para injetar a lista, e ele
 * precisa estar lá, não aqui.
 */

type Manifest = Parameters<typeof precacheAndRoute>[0]

export const OFFLINE_URL = '/offline'
/** Mensagem que a página manda no logout (ver plugin `base-pwa.client.ts`). */
export const CLEAR_RUNTIME_CACHES = 'base:clear-runtime-caches'

export interface CoreOptions {
  /**
   * Navegações que NÃO caem na tela offline. Requisição de dados sem rede
   * precisa falhar como falha de rede, e não voltar HTML com status 200.
   */
  navigationDenylist?: RegExp[]
}

export function setupCore(
  sw: ServiceWorkerGlobalScope,
  manifest: Manifest,
  options: CoreOptions = {},
): void {
  precacheAndRoute(manifest)
  cleanupOutdatedCaches()

  // Tela offline: `/offline`, e NÃO `/`. O fallback exige URL no precache, e
  // num app SSR só existe HTML do que foi prerenderizado. Apontar para uma URL
  // fora do precache lança `non-precached-url` e aborta o script inteiro.
  registerRoute(
    new NavigationRoute(createHandlerBoundToURL(OFFLINE_URL), {
      denylist: options.navigationDenylist ?? [/^\/api\//, /^\/auth\//],
    }),
  )

  // `autoUpdate`: a versão nova assume sem esperar todas as abas fecharem.
  sw.skipWaiting()
  sw.addEventListener('activate', (event) => event.waitUntil(sw.clients.claim()))

  // Troca de conta no aparelho: apaga os caches de dados (tudo que não é o
  // precache do build), para a próxima pessoa não ver o que era da anterior.
  sw.addEventListener('message', (event) => {
    if ((event.data as { type?: string } | null)?.type !== CLEAR_RUNTIME_CACHES) return
    event.waitUntil(clearRuntimeCaches())
  })
}

export async function clearRuntimeCaches(): Promise<void> {
  const names = await caches.keys()
  await Promise.all(
    names.filter((name) => !name.startsWith('workbox-precache')).map((name) => caches.delete(name)),
  )
}
