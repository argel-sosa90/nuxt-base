import { defineConfig } from 'drizzle-kit'

// Migrations em SQL, versionadas e aplicadas na subida do servidor
// (server/plugins/database.ts). Gere com `npm run db:generate`.
export default defineConfig({
  dialect: 'postgresql',
  schema: './server/database/schema.ts',
  out: './server/database/migrations',
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
  strict: true,
  verbose: true,
})
