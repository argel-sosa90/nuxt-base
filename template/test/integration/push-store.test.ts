import { sql } from 'drizzle-orm'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { createDatabase } from '../../server/database/client'
import { createPushStore } from '../../server/utils/push-store'
import { upsertProfile } from '../../server/utils/profile'

const url = process.env.TEST_DATABASE_URL
if (!url) throw new Error('Defina TEST_DATABASE_URL (veja .env.example)')
const db = createDatabase(url)
const store = createPushStore(db)
const device = { endpoint: 'https://fcm.googleapis.com/fcm/send/a', p256dh: 'p', auth: 'a' }

beforeAll(async () => {
  await migrate(db, { migrationsFolder: './server/database/migrations' })
})
beforeEach(async () => {
  await db.execute(sql`TRUNCATE users CASCADE`)
})
afterAll(async () => {
  await db.$client.end()
})

describe('push store', () => {
  it('o mesmo aparelho passa para a conta que entrou, sem duplicar', async () => {
    const ana = await upsertProfile(db, { sub: 'ana' })
    const bruno = await upsertProfile(db, { sub: 'bruno' })
    await store.save(ana.id, device)
    await store.save(bruno.id, { ...device, auth: 'b' })
    expect(await store.listForUser(ana.id)).toEqual([])
    expect(await store.listForUser(bruno.id)).toEqual([{ ...device, auth: 'b' }])
  })

  it('só remove a inscrição da própria conta', async () => {
    const ana = await upsertProfile(db, { sub: 'ana' })
    const bruno = await upsertProfile(db, { sub: 'bruno' })
    await store.save(ana.id, device)
    await store.remove(bruno.id, device.endpoint)
    expect(await store.listForUser(ana.id)).toHaveLength(1)
    await store.remove(ana.id, device.endpoint)
    expect(await store.listForUser(ana.id)).toEqual([])
  })

  it('apaga as mortas em lote', async () => {
    const ana = await upsertProfile(db, { sub: 'ana' })
    await store.save(ana.id, device)
    await store.save(ana.id, { ...device, endpoint: 'https://fcm.googleapis.com/fcm/send/b' })
    await store.removeEndpoints([device.endpoint])
    expect((await store.listForUser(ana.id)).map((s) => s.endpoint)).toEqual([
      'https://fcm.googleapis.com/fcm/send/b',
    ])
  })
})
