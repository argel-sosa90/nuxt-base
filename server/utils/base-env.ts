/**
 * Configuração do núcleo, lida de `process.env` em EXECUÇÃO — nunca assada no
 * build (ver nuxt.config.ts). Funções puras sobre um objeto de ambiente, para
 * os testes não dependerem do Nitro. Cada sub-layer tem a sua (`authEnv`,
 * `mailEnv`, `pushEnv`).
 */

export type Env = Record<string, string | undefined>

export interface BaseEnv {
  /** URL pública do app (`APP_URL`): origem esperada, links absolutos, redirect URIs. */
  appUrl: string
  appOrigin: string
  /** `APP_ENV`: ambiente dos eventos; as regras de alerta filtram por `production`. */
  environment: string
  monitoring: {
    dsn: string
    tracesSampleRate: number
    environment: string
  }
}

/** Amostragem quando a variável não existe: uma requisição em cada dez. */
export const DEFAULT_TRACES_SAMPLE_RATE = 0.1

/**
 * Fração das requisições medidas. Valor fora de 0–1, ou que não é número,
 * DESLIGA a medição em vez de cair no padrão: quem escreveu algo quis mudar a
 * amostragem, e medir mais do que pediu ocupa a instância compartilhada.
 */
export function parseSampleRate(raw: string | undefined): number {
  if (raw === undefined || raw.trim() === '') return DEFAULT_TRACES_SAMPLE_RATE
  const rate = Number(raw)
  if (Number.isFinite(rate) && rate >= 0 && rate <= 1) return rate
  console.warn(
    `[base] GLITCHTIP_TRACES_SAMPLE_RATE="${raw}" fora de 0–1; medição de desempenho desligada`,
  )
  return 0
}

export function parseBoolean(raw: string | undefined, fallback: boolean): boolean {
  if (raw === undefined || raw.trim() === '') return fallback
  return !['false', '0', 'no', 'off'].includes(raw.trim().toLowerCase())
}

export function readBaseEnv(env: Env = process.env): BaseEnv {
  const appUrl = (env.APP_URL || 'http://localhost:3000').replace(/\/+$/, '')
  const environment = env.APP_ENV || 'production'
  return {
    appUrl,
    appOrigin: new URL(appUrl).origin,
    environment,
    monitoring: {
      dsn: env.GLITCHTIP_DSN || '',
      tracesSampleRate: parseSampleRate(env.GLITCHTIP_TRACES_SAMPLE_RATE),
      environment,
    },
  }
}

/** A configuração corrente do servidor. */
export function baseEnv(): BaseEnv {
  return readBaseEnv(process.env)
}
