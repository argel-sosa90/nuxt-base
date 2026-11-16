/** Forma da chave `base` do `app.config.ts` (padrões em app.config.ts do layer). */
export interface BaseAppConfig {
  project: string
  telemetry: {
    tokenPathPrefixes: string[]
    tokenQueryPaths: string[]
    untracedPaths: string[]
    alwaysSampledPaths: string[]
  }
}
