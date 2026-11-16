/**
 * Verificações de saúde registráveis. O layer não sabe que banco, fila ou
 * serviço o app usa: cada um registra a sua num plugin do Nitro, e
 * `GET /api/health` responde 503 se qualquer uma falhar.
 *
 *   export default defineNitroPlugin(() => {
 *     registerHealthCheck('database', () => useDatabase().execute(sql`SELECT 1`))
 *   })
 */

export type HealthCheck = () => unknown | Promise<unknown>

export interface HealthReport {
  status: 'ok' | 'degraded'
  checks: Record<string, 'ok' | 'fail'>
}

const HEALTH_CHECK_TIMEOUT_MS = 3_000
const checks = new Map<string, HealthCheck>()

export function registerHealthCheck(name: string, check: HealthCheck): void {
  checks.set(name, check)
}

export function unregisterHealthCheck(name: string): void {
  checks.delete(name)
}

async function runCheck(check: HealthCheck): Promise<boolean> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error('timeout')), HEALTH_CHECK_TIMEOUT_MS)
  })
  try {
    await Promise.race([Promise.resolve().then(check), timeout])
    return true
  } catch {
    return false
  } finally {
    clearTimeout(timer)
  }
}

/** Roda todas as verificações em paralelo. Sem nenhuma registrada, está saudável. */
export async function runHealthChecks(): Promise<HealthReport> {
  const entries = await Promise.all(
    [...checks].map(
      async ([name, check]) => [name, (await runCheck(check)) ? 'ok' : 'fail'] as const,
    ),
  )
  const result = Object.fromEntries(entries) as HealthReport['checks']
  const healthy = Object.values(result).every((value) => value === 'ok')
  return { status: healthy ? 'ok' : 'degraded', checks: result }
}
