/**
 * Limpeza de tudo que vai ao GlitchTip — eventos, rastros, logs e transações —,
 * a MESMA no servidor, no navegador e na rota de encaminhamento.
 *
 * Por lista de permissão: o que sai é montado a partir dos campos conhecidos,
 * e não do evento inteiro menos o que se lembrou de tirar. Um campo novo que o
 * SDK passe a mandar numa versão futura fica de fora até alguém olhar para ele.
 *
 * Sem importar o SDK: os tipos aqui são só a forma que a limpeza lê, e o
 * arquivo pode ser testado e carregado nos dois lados sem puxar `@sentry/*`.
 *
 * Extraído do family-lists (add-observability). O que era específico do app —
 * os caminhos que levam token — virou configuração (`ScrubRules`).
 */

type Dict = Record<string, unknown>

/**
 * O que o SDK coleta, nos dois lados: o mínimo. Na versão 11 o padrão é
 * coletar tudo — cabeçalhos, cookies, corpos, consulta de URL, parâmetros de
 * consulta SQL, variáveis locais da pilha. A limpeza abaixo é a segunda
 * barreira.
 */
export const MINIMAL_DATA_COLLECTION = {
  userInfo: false,
  cookies: false,
  httpHeaders: false,
  httpBodies: [] as never[],
  urlQueryParams: false,
  graphQL: { document: false, variables: false },
  genAI: { inputs: false, outputs: false },
  mcp: { inputs: false, outputs: false },
  databaseQueryData: false,
  queues: false,
  stackFrameVariables: false,
}

/** Marcador que substitui um token em caminho ou consulta. */
export const TOKEN_MARKER = '[token]'

export interface ScrubRules {
  /**
   * Prefixos de caminho cujo segmento seguinte é um token
   * (`/convite/` → `/convite/[token]`). Vale para telas e rotas de API.
   */
  tokenPathPrefixes?: readonly string[]
  /**
   * Caminhos cuja consulta leva um token e vira `?[token]` em vez de sumir —
   * o que importa ali é saber que o link trazia um.
   */
  tokenQueryPaths?: readonly string[]
}

export interface PostgresErrorInfo {
  code: string
  table_name?: string
  constraint_name?: string
}

export interface ScrubHint {
  originalException?: unknown
}

const ABSOLUTE_URL = /^([a-z][a-z0-9+.-]*:\/\/[^/?#]*)(.*)$/i

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// ---------------------------------------------------------------------------
// Erros de banco (driver `postgres`, embrulhado pelo Drizzle e pelo h3)
// ---------------------------------------------------------------------------

interface FoundPostgresError {
  info: PostgresErrorInfo
  /** A mensagem original, que pode trazer o valor da coluna — só para achá-la no evento. */
  message: string
}

function findPostgres(error: unknown): FoundPostgresError | null {
  let current: unknown = error
  for (let depth = 0; depth < 6 && current && typeof current === 'object'; depth++) {
    const candidate = current as Dict
    const code = candidate.code
    if (
      (candidate.name === 'PostgresError' || 'severity_local' in candidate) &&
      typeof code === 'string' &&
      /^[0-9A-Z]{5}$/.test(code)
    ) {
      return {
        info: {
          code,
          ...(typeof candidate.table_name === 'string' ? { table_name: candidate.table_name } : {}),
          ...(typeof candidate.constraint_name === 'string'
            ? { constraint_name: candidate.constraint_name }
            : {}),
        },
        message: typeof candidate.message === 'string' ? candidate.message : '',
      }
    }
    current = candidate.cause
  }
  return null
}

/** O `PostgresError` do driver, onde quer que esteja na cadeia de `cause`. */
export function findPostgresError(error: unknown): PostgresErrorInfo | null {
  return findPostgres(error)?.info ?? null
}

/** A mensagem do Drizzle: `Failed query: <sql>\nparams: <valores>`. */
function isDrizzleQueryMessage(value: unknown): boolean {
  return typeof value === 'string' && value.startsWith('Failed query:')
}

// ---------------------------------------------------------------------------
// Campos permitidos
// ---------------------------------------------------------------------------

const EVENT_FIELDS = [
  'event_id',
  'timestamp',
  'start_timestamp',
  'type',
  'level',
  'platform',
  'logger',
  'release',
  'dist',
  'environment',
  'server_name',
  'sdk',
  'tags',
  'fingerprint',
  'transaction',
  'contexts',
  'exception',
  'message',
  'breadcrumbs',
  'user',
  'request',
  'modules',
  'spans',
  'measurements',
] as const

/**
 * Contextos que podem sair. `falha` é o de `reportError` (ids, códigos e
 * contagens) e `postgres` o de erro de banco; o resto é do SDK e descreve a
 * máquina, não a pessoa. `vue` perde os props do componente.
 */
const CONTEXT_FIELDS = new Set([
  'trace',
  'os',
  'runtime',
  'app',
  'device',
  'culture',
  'cloud_resource',
  'browser',
  'vue',
  'falha',
  'postgres',
])

/** Atributos que guardam uma URL ou um caminho de requisição. */
const URL_KEYS = new Set([
  'url',
  'url.full',
  'url.path',
  'path',
  'http.url',
  'http.target',
  'server.url',
])

interface ExceptionValue {
  type?: string
  value?: string
  stacktrace?: { frames?: Dict[] }
  [key: string]: unknown
}

export type Scrubber = ReturnType<typeof createScrubber>

/**
 * Monta as funções de limpeza com as regras do app. As mesmas regras precisam
 * chegar aos três lugares (servidor, navegador, rota de encaminhamento): por
 * isso vêm de `appConfig.base.telemetry`, que existe nos dois lados.
 */
export function createScrubber(rules: ScrubRules = {}) {
  const tokenInPath = (rules.tokenPathPrefixes ?? []).map(
    (prefix) => new RegExp(`^(${escapeRegExp(prefix.endsWith('/') ? prefix : `${prefix}/`)})[^/]+`),
  )
  const tokenInQuery = new Set(rules.tokenQueryPaths ?? [])

  /** Troca o token de um caminho pelo marcador e descarta consulta e fragmento. */
  function scrubPath(path: string): string {
    const match = /^([^?#]*)(\?[^#]*)?/.exec(path)
    let pathname = match?.[1] ?? ''
    const query = match?.[2]
    for (const pattern of tokenInPath) {
      pathname = pathname.replace(pattern, `$1${TOKEN_MARKER}`)
    }
    if (query && query.length > 1 && tokenInQuery.has(pathname)) {
      return `${pathname}?${TOKEN_MARKER}`
    }
    return pathname
  }

  /** `scrubPath` aplicado a uma URL absoluta ou a um caminho. */
  function scrubUrl(url: string): string {
    const absolute = ABSOLUTE_URL.exec(url)
    if (!absolute) return scrubPath(url)
    return `${absolute[1]}${scrubPath(absolute[2] || '/')}`
  }

  /**
   * URL de uma requisição feita pelo app. Para a própria API o caminho ajuda;
   * para qualquer outro lugar fica só a origem — o endereço de uma inscrição de
   * push é uma credencial, e o caminho de um provedor externo não diz nada útil.
   */
  function scrubRequestUrl(url: string): string {
    const absolute = ABSOLUTE_URL.exec(url)
    const path = absolute ? absolute[2] || '/' : url
    if (path.startsWith('/api/')) return scrubUrl(url)
    return absolute ? absolute[1]! : '[externo]'
  }

  /** Texto que contém URLs (descrição de span, mensagem de rastro ou de exceção). */
  function scrubUrlsIn(text: string): string {
    return text.replace(/[a-z][a-z0-9+.-]*:\/\/[^\s"']+/gi, (url) => scrubRequestUrl(url))
  }

  function scrubAttributes(attributes: Dict): Dict {
    const out: Dict = {}
    for (const [key, value] of Object.entries(attributes)) {
      // Parâmetros de consulta SQL; o texto parametrizado (`$1`) pode ficar.
      if (/param/i.test(key) && key.startsWith('db')) continue
      if (key === 'url.query' || key === 'http.query' || key === 'http.request.body') continue
      if (key.startsWith('user.') && key !== 'user.id') continue
      if (typeof value === 'string' && URL_KEYS.has(key)) {
        out[key] = ABSOLUTE_URL.test(value) ? scrubRequestUrl(value) : scrubPath(value)
      } else {
        out[key] = value
      }
    }
    return out
  }

  function scrubSpanData(data: Dict): Dict {
    const out: Dict = { ...data }
    for (const nested of ['data', 'attributes']) {
      const value = out[nested]
      if (value && typeof value === 'object') out[nested] = scrubAttributes(value as Dict)
    }
    return out
  }

  function scrubUser(user: unknown): Dict | undefined {
    const id = (user as Dict | undefined)?.id
    return typeof id === 'string' || typeof id === 'number' ? { id: String(id) } : undefined
  }

  function scrubRequest(request: unknown): Dict | undefined {
    if (!request || typeof request !== 'object') return undefined
    const { url, method } = request as Dict
    const out: Dict = {}
    if (typeof url === 'string') out.url = scrubUrl(url)
    if (typeof method === 'string') out.method = method
    return out
  }

  function scrubContexts(contexts: unknown): Dict | undefined {
    if (!contexts || typeof contexts !== 'object') return undefined
    const out: Dict = {}
    for (const [key, value] of Object.entries(contexts as Dict)) {
      if (!CONTEXT_FIELDS.has(key)) continue
      if (key === 'vue' && value && typeof value === 'object') {
        const { componentName, lifecycleHook } = value as Dict
        out.vue = { componentName, lifecycleHook }
      } else if (key === 'trace' && value && typeof value === 'object') {
        out.trace = scrubSpanData(value as Dict)
      } else {
        out[key] = value
      }
    }
    return out
  }

  function scrubExceptions(exception: unknown, postgres: FoundPostgresError | null): unknown {
    const values = (exception as { values?: ExceptionValue[] } | undefined)?.values
    if (!Array.isArray(values)) return exception

    const kept = values
      // O `DrizzleQueryError` some e fica a causa dele: a mensagem traz os
      // parâmetros da consulta. Se ele for o único, sobra sem a mensagem.
      .filter((value, _index, all) => !(isDrizzleQueryMessage(value.value) && all.length > 1))
      .map((value) => {
        const copy: ExceptionValue = { ...value }
        if (isDrizzleQueryMessage(copy.value)) copy.value = 'Failed query'
        if (typeof copy.value === 'string') copy.value = scrubUrlsIn(copy.value)
        // Pelo nome ou pela mensagem do erro achado na cadeia: a mensagem
        // original pode trazer o valor da coluna (`Key (email)=(...)`).
        if (copy.type === 'PostgresError' || (postgres && copy.value === postgres.message)) {
          copy.value = `PostgresError ${postgres?.info.code ?? ''}`.trim()
        }
        if (copy.stacktrace?.frames) {
          copy.stacktrace = {
            ...copy.stacktrace,
            frames: copy.stacktrace.frames.map(({ vars: _vars, ...frame }) => frame),
          }
        }
        return copy
      })
    return { ...(exception as Dict), values: kept }
  }

  /**
   * Sem `console` (a mensagem pode ter qualquer coisa) e sem `ui.*` (o seletor
   * do elemento tocado pode trazer `aria-label` com conteúdo). Ficam navegação
   * e requisições, com os caminhos limpos.
   */
  function scrubBreadcrumb<T extends object>(breadcrumb: T): T | null {
    const source = breadcrumb as Dict
    const category = typeof source.category === 'string' ? source.category : ''
    if (category === 'console' || category.startsWith('ui.')) return null

    const out: Dict = { ...source }
    if (typeof out.message === 'string') out.message = scrubUrlsIn(out.message)
    if (out.data && typeof out.data === 'object') {
      const data: Dict = {}
      for (const [key, value] of Object.entries(out.data as Dict)) {
        if (typeof value !== 'string') {
          if (typeof value === 'number' || typeof value === 'boolean') data[key] = value
          continue
        }
        if (key === 'url') data.url = scrubRequestUrl(value)
        else if (key === 'from' || key === 'to') data[key] = scrubUrl(value)
        else if (key === 'method') data.method = value
      }
      out.data = data
    }
    return out as T
  }

  /** Um span no formato de transação (`withStaticSpan`). */
  function scrubSpanJson<T extends object>(span: T): T {
    const out = scrubSpanData(span as Dict)
    if (typeof out.description === 'string') out.description = scrubUrlsIn(out.description)
    return out as T
  }

  /**
   * Limpa um evento de erro (`beforeSend`). Erros de banco ganham mensagem fixa
   * e impressão digital `['postgres', SQLSTATE, rota]`.
   */
  function scrubEvent<T extends object>(event: T, hint?: ScrubHint): T {
    const source = event as Dict
    const out: Dict = {}
    for (const field of EVENT_FIELDS) {
      if (source[field] !== undefined) out[field] = source[field]
    }

    const postgres = findPostgres(hint?.originalException)

    out.user = scrubUser(source.user)
    out.request = scrubRequest(source.request)
    out.contexts = scrubContexts(source.contexts)
    out.exception = scrubExceptions(source.exception, postgres)
    if (typeof out.transaction === 'string') out.transaction = scrubPath(out.transaction)
    if (Array.isArray(out.breadcrumbs)) {
      out.breadcrumbs = (out.breadcrumbs as Dict[]).map(scrubBreadcrumb).filter(Boolean)
    }
    if (Array.isArray(out.spans)) out.spans = (out.spans as Dict[]).map(scrubSpanJson)

    if (postgres) {
      const tags = (out.tags ?? {}) as Dict
      const route = tags.route ?? tags.scope ?? '(sem rota)'
      out.contexts = { ...(out.contexts as Dict), postgres: postgres.info }
      out.fingerprint = ['postgres', postgres.info.code, String(route)]
    }

    return Object.fromEntries(Object.entries(out).filter(([, value]) => value !== undefined)) as T
  }

  /**
   * Uma transação (`beforeSendTransaction`). Sem o método no `request`: o
   * GlitchTip exibe `request.method` + nome, e o nome já começa pelo verbo.
   */
  function scrubTransaction<T extends object>(event: T): T {
    const out = scrubEvent(event) as Dict
    const request = out.request as Dict | undefined
    if (request) {
      const { method: _method, ...rest } = request
      out.request = rest
    }
    return out as T
  }

  /**
   * Um log estruturado (`beforeSendLog`). Acrescenta o `service` do lado, sem
   * sobrescrever um explícito: o filtro por serviço do GlitchTip lê esse atributo.
   */
  function scrubLog<T extends { attributes?: Dict }>(log: T, service: string): T {
    const attributes = scrubAttributes(log.attributes ?? {})
    return { ...log, attributes: { service, ...attributes } }
  }

  return {
    scrubPath,
    scrubUrl,
    scrubRequestUrl,
    scrubEvent,
    scrubTransaction,
    scrubBreadcrumb,
    scrubSpanJson,
    scrubLog,
  }
}
