import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import type { PushStore, PushSubscriptionRecord } from './push'

interface StoredSubscription extends PushSubscriptionRecord {
  owner: string
}

function isStored(value: unknown): value is StoredSubscription {
  if (!value || typeof value !== 'object') return false
  const row = value as Record<string, unknown>
  return ['owner', 'endpoint', 'p256dh', 'auth'].every((key) => typeof row[key] === 'string')
}

/**
 * `PushStore` num arquivo JSON, para app sem banco:
 *
 *   registerPushStore(createFilePushStore(process.env.PUSH_STORE_FILE || 'data/push.json'))
 *
 * Escrita atômica (arquivo temporário + `rename`) e em fila, então uma queda
 * no meio nunca deixa o arquivo pela metade nem perde uma escrita para outra.
 * O arquivo guarda os endereços das inscrições, que são credenciais: sai com
 * permissão 600, e o diretório precisa ser um volume (o container perde o
 * resto a cada deploy).
 *
 * Um processo só: duas réplicas no mesmo arquivo se sobrescrevem. Mais que
 * isso, use banco (o template traz a tabela).
 */
export function createFilePushStore(file: string): PushStore {
  let rows: StoredSubscription[] | undefined
  let queue: Promise<unknown> = Promise.resolve()

  async function load(): Promise<StoredSubscription[]> {
    if (rows) return rows
    try {
      const parsed: unknown = JSON.parse(await readFile(file, 'utf8'))
      rows = Array.isArray(parsed) ? parsed.filter(isStored) : []
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
      rows = []
    }
    return rows
  }

  function change(next: (current: StoredSubscription[]) => StoredSubscription[]): Promise<void> {
    const run = queue.then(async () => {
      const updated = next(await load())
      await mkdir(dirname(file), { recursive: true })
      const temporary = `${file}.${process.pid}.tmp`
      await writeFile(temporary, JSON.stringify(updated), { mode: 0o600 })
      await rename(temporary, file)
      // Só depois de gravar: se a escrita falhar, a memória segue igual ao disco.
      rows = updated
    })
    queue = run.catch(() => undefined)
    return run
  }

  return {
    save: (owner, subscription) =>
      change((current) => [
        ...current.filter((row) => row.endpoint !== subscription.endpoint),
        {
          owner,
          endpoint: subscription.endpoint,
          p256dh: subscription.p256dh,
          auth: subscription.auth,
        },
      ]),
    remove: (owner, endpoint) =>
      change((current) =>
        current.filter((row) => !(row.endpoint === endpoint && row.owner === owner)),
      ),
    async listForOwner(owner) {
      await queue
      return (await load())
        .filter((row) => row.owner === owner)
        .map(({ endpoint, p256dh, auth }) => ({ endpoint, p256dh, auth }))
    },
    async removeEndpoints(endpoints) {
      if (endpoints.length === 0) return
      const gone = new Set(endpoints)
      await change((current) => current.filter((row) => !gone.has(row.endpoint)))
    },
  }
}
