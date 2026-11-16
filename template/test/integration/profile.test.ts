import { sql } from 'drizzle-orm'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { createDatabase } from '../../server/database/client'
import { upsertProfile } from '../../server/utils/profile'

/** Contra o Postgres de teste (`docker compose up -d db-test`, ou o serviço do CI). */
const url = process.env.TEST_DATABASE_URL
if (!url) throw new Error('Defina TEST_DATABASE_URL (veja .env.example)')
const db = createDatabase(url)

beforeAll(async () => {
  await migrate(db, { migrationsFolder: './server/database/migrations' })
})
beforeEach(async () => {
  await db.execute(sql`TRUNCATE users CASCADE`)
})
afterAll(async () => {
  await db.$client.end()
})

describe('upsertProfile', () => {
  it('cria no primeiro login e reaproveita o mesmo perfil nos seguintes', async () => {
    const first = await upsertProfile(db, { sub: 'sub-1', email: 'ana@example.com', name: 'Ana' })
    const second = await upsertProfile(db, {
      sub: 'sub-1',
      email: 'ana@novo.example.com',
      name: 'Ana S.',
    })
    expect(second.id).toBe(first.id)
    expect(second.email).toBe('ana@novo.example.com')
    expect(second.name).toBe('Ana S.')
    expect(second.createdAt).toEqual(first.createdAt)
  })

  it('o vínculo é o sub, não o e-mail', async () => {
    const ana = await upsertProfile(db, { sub: 'sub-1', email: 'mesmo@example.com' })
    const outra = await upsertProfile(db, { sub: 'sub-2', email: 'mesmo@example.com' })
    expect(outra.id).not.toBe(ana.id)
  })
})
