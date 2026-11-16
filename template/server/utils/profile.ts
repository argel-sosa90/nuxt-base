import { eq } from 'drizzle-orm'
import type { Database } from '../database/client'
import { users, type User } from '../database/schema'

export interface IdentityClaims {
  sub: string
  email?: string
  name?: string
}

/**
 * Cria ou atualiza o perfil local pelo `sub` do IdP, num comando só (corrida
 * entre dois logins simultâneos não duplica). Nome e e-mail seguem o IdP.
 */
export async function upsertProfile(db: Database, identity: IdentityClaims): Promise<User> {
  const now = new Date()
  const [profile] = await db
    .insert(users)
    .values({
      idpSubject: identity.sub,
      email: identity.email ?? null,
      name: identity.name ?? null,
      lastLoginAt: now,
    })
    .onConflictDoUpdate({
      target: users.idpSubject,
      set: { email: identity.email ?? null, name: identity.name ?? null, lastLoginAt: now },
    })
    .returning()
  return profile!
}

export async function findProfile(db: Database, id: string): Promise<User | undefined> {
  const [profile] = await db.select().from(users).where(eq(users.id, id)).limit(1)
  return profile
}
