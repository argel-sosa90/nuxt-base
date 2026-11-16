import type { BaseAppConfig } from '../../shared/base-config'
import type { ScrubRules } from '../../shared/telemetry-scrub'
import { createScrubber } from '../../shared/telemetry-scrub'

/** A chave `base` do `app.config.ts` já mesclada com os padrões do layer. */
export function baseAppConfig(): BaseAppConfig {
  // No Nitro o appConfig não é tipado pelos `app.config.ts`.
  return (useAppConfig() as unknown as { base: BaseAppConfig }).base
}

export function scrubRules(): ScrubRules {
  const { telemetry } = baseAppConfig()
  return {
    tokenPathPrefixes: telemetry.tokenPathPrefixes,
    tokenQueryPaths: telemetry.tokenQueryPaths,
  }
}

/** `<projeto>@<buildId>`: a mesma versão no servidor e no navegador. */
export function releaseName(): string {
  return `${baseAppConfig().project}@${useRuntimeConfig().app.buildId}`
}

let cached: { key: string; scrubber: ReturnType<typeof createScrubber> } | undefined

/** O limpador com as regras do app (memorizado enquanto as regras não mudam). */
export function useScrubber() {
  const rules = scrubRules()
  const key = JSON.stringify(rules)
  if (cached?.key !== key) cached = { key, scrubber: createScrubber(rules) }
  return cached.scrubber
}
