import { fileURLToPath } from 'node:url'
import { relative } from 'node:path'
import { loadNuxtConfig } from '@nuxt/kit'
import { describe, expect, it } from 'vitest'

/**
 * Cada entrada do pacote carrega os layers certos. Importante porque um
 * `extends` que não resolve NÃO dá erro: o build passa sem o layer. As
 * fixtures estendem pelo nome do pacote, o que exercita o `exports` do
 * package.json (auto-referência do Node), como um app faria.
 */
const root = fileURLToPath(new URL('../..', import.meta.url))

async function layersOf(entry: string): Promise<string[]> {
  const options = await loadNuxtConfig({
    cwd: fileURLToPath(new URL(`../fixtures/entries/${entry}`, import.meta.url)),
  })
  return options._layers
    .map((layer) => relative(root, layer.cwd) || '.')
    .filter((path) => !path.startsWith('test/'))
    .sort()
}

describe('entradas do pacote', () => {
  it.each([
    ['core', ['.']],
    ['auth', ['.', 'layers/auth']],
    ['mail', ['.', 'layers/mail']],
    ['pwa', ['.', 'layers/pwa']],
    ['push', ['.', 'layers/auth', 'layers/push', 'layers/pwa']],
  ])('%s', async (entry, expected) => {
    expect(await layersOf(entry)).toEqual(expected)
  })
})
