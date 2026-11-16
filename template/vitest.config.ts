import { existsSync } from 'node:fs'
import { defineConfig } from 'vitest/config'

// Os testes leem `process.env` (TEST_DATABASE_URL), que o Vite não carrega.
if (existsSync('.env')) process.loadEnvFile('.env')

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    environment: 'node',
    // Banco compartilhado: arquivos em série.
    fileParallelism: false,
  },
})
