import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as schema from './schema'

export type Database = ReturnType<typeof createDatabase>

export function createDatabase(url: string) {
  const client = postgres(url, {
    // Um processo só por container: pool pequeno, para não esgotar o Postgres
    // compartilhado da VPS. Duas conexões ficam abertas: com pouco tráfego,
    // abrir conexão a cada requisição custa ~200 ms.
    max: 10,
    min: 2,
    idle_timeout: 20,
    // Renova cada conexão a cada meia hora (reinício do banco, troca de rede).
    max_lifetime: 60 * 30,
    connect_timeout: 10,
  })
  return drizzle(client, { schema })
}

// O HMR do Nitro reavalia este módulo a cada alteração em desenvolvimento; sem
// o cache em globalThis, cada recarga abriria um pool novo.
const globalCache = globalThis as typeof globalThis & { __appDb?: Database }

export function useDatabase(): Database {
  if (globalCache.__appDb) return globalCache.__appDb
  const url = process.env.DATABASE_URL
  if (!url) throw new Error('DATABASE_URL não está definida. Copie .env.example para .env.')
  globalCache.__appDb = createDatabase(url)
  return globalCache.__appDb
}
