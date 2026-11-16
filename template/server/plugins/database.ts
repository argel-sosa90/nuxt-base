import { sql } from 'drizzle-orm'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import { useDatabase } from '../database/client'

/**
 * Migrations na subida e verificação de saúde do banco.
 *
 * No Dokploy não há passo de deploy para rodar `drizzle-kit migrate` (e ele é
 * devDependency): o container novo migra ao subir, e o healthcheck só passa
 * depois. Idempotente (`__drizzle_migrations`). `RUN_MIGRATIONS=false`
 * desliga, para aplicar à mão.
 *
 * O prerender do build sobe uma instância Nitro sem DATABASE_URL: nada aqui.
 */
export default defineNitroPlugin(async () => {
  if (import.meta.prerender) return

  registerHealthCheck('database', () => useDatabase().execute(sql`SELECT 1`))

  if (process.env.RUN_MIGRATIONS === 'false') return
  try {
    await migrate(useDatabase(), {
      migrationsFolder: process.env.MIGRATIONS_DIR || './server/database/migrations',
    })
    log.info('migrate', 'Migrations aplicadas')
  } catch (error) {
    // Subir com o banco no formato errado só troca uma falha clara aqui por
    // erros incompreensíveis na primeira requisição.
    reportFailure('migrate', error, { message: 'Falha ao aplicar as migrations' })
    throw error
  }
})
