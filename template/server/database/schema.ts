import { pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'

/**
 * Perfil local da pessoa. A identidade (senha, MFA, recuperação, verificação
 * de e-mail) é do IdP; aqui fica só o vínculo pelo `sub` e o que o app
 * precisa. As tabelas do domínio apontam para `users.id`, nunca para o `sub`.
 */
export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  // `sub` do IdP: estável e nunca reaproveitado. É o vínculo, não o e-mail.
  idpSubject: text('idp_subject').notNull().unique(),
  // Cópias do IdP, atualizadas a cada login (para exibir e enviar e-mail).
  email: text('email'),
  name: text('name'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  lastLoginAt: timestamp('last_login_at', { withTimezone: true }).notNull().defaultNow(),
})

export type User = typeof users.$inferSelect
