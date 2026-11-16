import * as Sentry from '@sentry/node'
import type { H3Event } from 'h3'
import {
  createScrubber,
  MINIMAL_DATA_COLLECTION,
  type ScrubRules,
} from '../../shared/telemetry-scrub'

/**
 * GlitchTip no servidor: erros, logs estruturados, desempenho e batimento.
 *
 * Um lugar só para o SDK: rotas e utilitários do app chamam `log`,
 * `reportFailure` e `measureStep`, e os testes deles não precisam conhecer o
 * `@sentry/node`. Sem `GLITCHTIP_DSN` (desenvolvimento, testes, instalação sem
 * rastreador), tudo aqui só escreve no console e nenhuma conexão é aberta.
 *
 * Particularidades do GlitchTip 7 que moldam a configuração:
 * - spans em streaming (padrão do SDK 11) são aceitos e descartados em
 *   silêncio: `traceLifecycle: 'static'` manda por transação;
 * - sessões não são aceitas: as integrações que as enviam saem.
 */

export type ServiceKind = 'api' | 'cron' | 'web'

/** Atributo que força a amostragem de uma transação. */
const ALWAYS_SAMPLE = 'base.always_sample'

/** Rotas que nunca viram transação: dominariam a lista sem dizer nada. */
const DEFAULT_UNTRACED = ['/api/telemetry', '/api/health', '/api/_auth/session']

export interface MonitoringOptions {
  dsn: string
  environment: string
  /** Slug do projeto (`appConfig.base.project`). */
  project: string
  release: string
  tracesSampleRate: number
  scrub?: ScrubRules
  untracedPaths?: readonly string[]
  alwaysSampledPaths?: readonly string[]
  /** Só para testes: um transporte que guarda os envelopes em memória. */
  transport?: Sentry.NodeOptions['transport']
}

interface State {
  active: boolean
  project: string
  untraced: Set<string>
  alwaysSampled: Set<string>
}

const state: State = {
  active: false,
  project: 'app',
  untraced: new Set(DEFAULT_UNTRACED),
  alwaysSampled: new Set(),
}

/** `<projeto>-api`, `<projeto>-cron`, `<projeto>-web`: o filtro por serviço do GlitchTip. */
export function serviceName(kind: ServiceKind, project = state.project): string {
  return `${project}-${kind}`
}

/** Se o rastreador foi inicializado neste processo. */
export function isMonitoringActive(): boolean {
  return state.active
}

/**
 * Integrações padrão que saem:
 * - `ProcessSession`: sessões, que o GlitchTip não aceita;
 * - `LocalVariables`: guardaria as variáveis de cada quadro da pilha;
 * - `Console`: rastros de console, que a limpeza descartaria de qualquer jeito;
 * - `Dedupe`: descartaria justamente o erro recorrente, que precisa acumular
 *   ocorrências para o alerta por frequência funcionar;
 * - `Http` e `NodeFetch` voltam configuradas logo abaixo.
 */
const DROPPED_INTEGRATIONS = new Set([
  'ProcessSession',
  'LocalVariables',
  'Console',
  'Dedupe',
  'Http',
  'NodeFetch',
])

export function initMonitoring(options: MonitoringOptions): boolean {
  state.project = options.project
  state.untraced = new Set([...DEFAULT_UNTRACED, ...(options.untracedPaths ?? [])])
  state.alwaysSampled = new Set(options.alwaysSampledPaths ?? [])
  if (!options.dsn) return false

  const scrubber = createScrubber(options.scrub)
  const service = serviceName('api')
  const rate = options.tracesSampleRate

  Sentry.init({
    dsn: options.dsn,
    release: options.release,
    environment: options.environment,
    serverName: service,
    traceLifecycle: 'static',
    dataCollection: MINIMAL_DATA_COLLECTION,
    // 0 desliga a medição de vez, sem nem criar spans gravando.
    ...(rate > 0
      ? {
          tracesSampler: ({ attributes, inheritOrSampleWith }) =>
            attributes?.[ALWAYS_SAMPLE] ? 1 : inheritOrSampleWith(rate),
        }
      : {}),
    // Nenhum cabeçalho de trace sai para serviços de terceiros.
    tracePropagationTargets: [],
    integrations: (defaults) => [
      ...defaults.filter((integration) => !DROPPED_INTEGRATIONS.has(integration.name)),
      // O isolamento por requisição fica; a transação é aberta à mão
      // (`traceRequest`), o corpo nunca é lido, e chamadas de saída (push,
      // e-mail, IdP) não viram rastro nem span.
      Sentry.httpIntegration({
        disableIncomingRequestSpans: true,
        sessions: false,
        maxRequestBodySize: 'none',
        breadcrumbs: false,
        ignoreOutgoingRequests: () => true,
      }),
      Sentry.nativeNodeFetchIntegration({ breadcrumbs: false, spans: false }),
      // Spans de banco vêm da integração `PostgresJs` (padrão), com o texto
      // parametrizado e sem os valores (`databaseQueryData: false`).
    ],
    beforeSend: (event, hint) => scrubber.scrubEvent(event, hint),
    beforeBreadcrumb: (breadcrumb) => scrubber.scrubBreadcrumb(breadcrumb),
    beforeSendTransaction: (event) => scrubber.scrubTransaction(event),
    beforeSendSpan: Sentry.withStaticSpan((span) => scrubber.scrubSpanJson(span)),
    beforeSendLog: (entry) => scrubber.scrubLog(entry, service),
    initialScope: { tags: { service } },
    ...(options.transport ? { transport: options.transport } : {}),
  })

  state.active = true
  return true
}

/** Fecha o cliente, entregando o que estiver pendente (até `timeoutMs`). */
export async function closeMonitoring(timeoutMs = 2_000): Promise<void> {
  if (!state.active) return
  state.active = false
  await Sentry.close(timeoutMs)
}

/** Entrega o que estiver na fila sem fechar o cliente (scripts curtos, cron). */
export async function flushMonitoring(timeoutMs = 2_000): Promise<void> {
  if (state.active) await Sentry.flush(timeoutMs)
}

// ---------------------------------------------------------------------------
// Registrador
// ---------------------------------------------------------------------------

export type LogAttributes = Record<string, string | number | boolean | null | undefined>

/** `{nome}` na mensagem vira o valor do atributo, só na linha do console. */
export function interpolate(message: string, attributes: LogAttributes): string {
  return message.replace(/\{(\w+)\}/g, (whole, name: string) =>
    name in attributes ? String(attributes[name]) : whole,
  )
}

function definedAttributes(attributes: LogAttributes): Record<string, string | number | boolean> {
  const out: Record<string, string | number | boolean> = {}
  for (const [key, value] of Object.entries(attributes)) {
    if (value !== undefined && value !== null) out[key] = value
  }
  return out
}

/**
 * A mensagem como o SDK espera uma mensagem parametrizada: o corpo sai com os
 * valores (é o que a tela de logs do GlitchTip mostra), e o MODELO fica fixo em
 * `sentry.message.template`, com os valores em `sentry.message.parameter.N`.
 */
function parameterized(message: string, attributes: LogAttributes): string {
  const strings: string[] = []
  const values: unknown[] = []
  let last = 0
  for (const match of message.matchAll(/\{(\w+)\}/g)) {
    const name = match[1]!
    if (!(name in attributes)) continue
    strings.push(message.slice(last, match.index))
    values.push(attributes[name])
    last = match.index + match[0].length
  }
  if (values.length === 0) return message
  strings.push(message.slice(last))
  const template = Object.assign([...strings], { raw: [...strings] }) as TemplateStringsArray
  return Sentry.logger.fmt(template, ...values) as unknown as string
}

type Level = 'info' | 'warn' | 'error'

function emit(level: Level, scope: string, message: string, attributes: LogAttributes = {}) {
  console[level](`[${scope}] ${interpolate(message, attributes)}`)
  if (!state.active) return
  Sentry.logger[level](parameterized(message, attributes), {
    scope,
    ...definedAttributes(attributes),
  })
}

/**
 * Registrador do servidor: a linha `[scope] mensagem` no console, com os
 * atributos interpolados, e um log estruturado de modelo FIXO no GlitchTip.
 * Nunca ponha dado pessoal nos atributos: só ids, códigos e contagens. Debug
 * não existe aqui de propósito: não é enviado.
 */
export const log = {
  info: (scope: string, message: string, attributes?: LogAttributes) =>
    emit('info', scope, message, attributes),
  warn: (scope: string, message: string, attributes?: LogAttributes) =>
    emit('warn', scope, message, attributes),
  error: (scope: string, message: string, attributes?: LogAttributes) =>
    emit('error', scope, message, attributes),
}

// ---------------------------------------------------------------------------
// Falhas tratadas
// ---------------------------------------------------------------------------

export interface ReportOptions {
  /** Mensagem fixa do ponto, sem valores: vira a mensagem do log enviado. */
  message: string
  /**
   * Os argumentos da linha de console. É o único lugar do que só pode ficar no
   * container (o corpo de resposta de um provedor, que pode repetir o destinatário).
   * Sem ele, o console recebe `[scope] message` e o erro.
   */
  line?: unknown[]
  /** Só ids, códigos e contagens: vai ao evento e ao log. */
  context?: LogAttributes
  /** Serviço do evento e do log, quando não é o da API (`serviceName('cron')`). */
  service?: string
}

/**
 * Registra uma falha que o servidor captura e contorna, sem mudar o que a
 * operação faz depois: a linha de log de sempre e um evento com impressão
 * digital `[scope, tipo do erro]` — um provedor que recusa com 429 e depois com
 * 503 cai na mesma issue, com o status no contexto.
 */
export function reportFailure(scope: string, error: unknown, options: ReportOptions): void {
  console.error(...(options.line ?? [`[${scope}] ${options.message}:`, error]))
  if (!state.active) return

  const exception = error instanceof Error ? error : new Error(options.message)
  const context = definedAttributes(options.context ?? {})

  Sentry.withScope((sentryScope) => {
    sentryScope.setTag('scope', scope)
    if (options.service) sentryScope.setTag('service', options.service)
    if (Object.keys(context).length > 0) sentryScope.setContext('falha', context)
    sentryScope.setFingerprint([scope, exception.name])
    Sentry.captureException(exception)
  })
  Sentry.logger.error(options.message, {
    scope,
    error_type: exception.name,
    ...context,
    ...(options.service ? { service: options.service } : {}),
  })
}

// ---------------------------------------------------------------------------
// Requisições
// ---------------------------------------------------------------------------

interface MonitoringContext {
  span?: Sentry.Span
  userId?: string
}

function monitoringContext(event: H3Event): MonitoringContext {
  const context = event.context as { monitoring?: MonitoringContext }
  context.monitoring ??= {}
  return context.monitoring
}

/** Anota a conta da requisição: eventos e transações levam o id — e só o id. */
export function setMonitoringUser(event: H3Event, userId: string | undefined): void {
  if (!state.active || !userId) return
  monitoringContext(event).userId = userId
  Sentry.getIsolationScope().setUser({ id: userId })
}

export function isTracedPath(path: string): boolean {
  return path.startsWith('/api/') && !state.untraced.has(path.replace(/\/+$/, ''))
}

/**
 * Nome da transação pela rota casada, com marcadores no lugar dos valores:
 * `GET /api/lists/{listId}`. Com o id real, a mesma rota viraria uma linha por
 * registro.
 */
export function transactionName(method: string, matchedPath: string | undefined): string {
  if (!matchedPath) return `${method} /api/(desconhecida)`
  const path = matchedPath
    .replace(/\*\*:(\w+)/g, '{...$1}')
    .replace(/\*\*/g, '{...}')
    .replace(/:(\w+)/g, '{$1}')
  return `${method} ${path}`
}

function matchedPath(event: H3Event): string | undefined {
  return (event.context.matchedRoute as { path?: string } | undefined)?.path
}

function statusOf(error: unknown): number {
  const status = (error as { statusCode?: unknown } | null)?.statusCode
  return typeof status === 'number' ? status : 500
}

/**
 * Executa o tratamento de uma requisição num escopo isolado e, se a rota é
 * medida, dentro de uma transação `http.server`: os spans abertos durante o
 * tratamento ficam aninhados nela. Sem rastreador, só chama o handler.
 */
export function traceRequest<T>(event: H3Event, handler: () => Promise<T>): Promise<T> {
  if (!state.active) return handler()
  const path = event.path.split('?')[0] ?? ''
  if (!path.startsWith('/api/')) return handler()

  return Sentry.withIsolationScope(() => {
    if (!isTracedPath(path)) return handler()

    const method = event.method
    return Sentry.startSpan(
      {
        name: `${method} /api/(desconhecida)`,
        op: 'http.server',
        forceTransaction: true,
        attributes: {
          'sentry.source': 'route',
          'http.request.method': method,
          ...(state.alwaysSampled.has(path) ? { [ALWAYS_SAMPLE]: true } : {}),
        },
      },
      async (span) => {
        monitoringContext(event).span = span
        let status = 200
        try {
          const result = await handler()
          status = event.node.res.statusCode
          return result
        } catch (error) {
          status = statusOf(error)
          throw error
        } finally {
          const name = transactionName(method, matchedPath(event))
          span.updateName(name)
          Sentry.getCurrentScope().setTransactionName(name)
          Sentry.setHttpStatus(span, status)
        }
      },
    )
  })
}

/**
 * Gancho `error` do Nitro: registra o erro inesperado. Status menor que 500 é
 * resposta prevista (validação, sessão, inexistente, conflito) e não gera evento.
 */
export function captureServerError(error: unknown, event?: H3Event): void {
  if (!state.active) return
  const status = statusOf(error)
  if (status < 500) return

  // O h3 embrulha o erro não tratado num `H3Error`; interessa o original.
  const wrapped = error as { unhandled?: boolean; cause?: unknown }
  const original = wrapped?.unhandled && wrapped.cause instanceof Error ? wrapped.cause : error

  Sentry.withScope((scope) => {
    if (event) {
      const context = monitoringContext(event)
      const route = matchedPath(event)
      const name = transactionName(event.method, route)
      scope.setTag('route', route ? name.slice(event.method.length + 1) : '(desconhecida)')
      scope.setTag('method', event.method)
      scope.setTransactionName(name)
      if (context.userId) scope.setUser({ id: context.userId })
      const url = event.path
      scope.addEventProcessor((sentryEvent) => ({
        ...sentryEvent,
        request: { url, method: event.method },
      }))
      if (context.span) {
        Sentry.withActiveSpan(context.span, () => Sentry.captureException(original))
        return
      }
    }
    Sentry.captureException(original)
  })
}

// ---------------------------------------------------------------------------
// Etapas medidas
// ---------------------------------------------------------------------------

type SpanData = Record<string, string | number | boolean>

/** O que uma etapa pode anotar sobre si: contagens, host, status — nunca valores. */
export interface StepRecorder {
  set: (key: string, value: string | number | boolean | undefined) => void
}

const NOOP_RECORDER: StepRecorder = { set: () => undefined }

/**
 * Mede uma etapa como span aninhado na transação corrente, de nome fixo; o que
 * varia vai em atributos pelo `recorder`. Sem rastreador, ou fora de uma
 * transação amostrada, só executa.
 */
export function measureStep<T>(
  name: string,
  op: 'function' | 'http.client' | 'db' | 'queue.process',
  fn: (recorder: StepRecorder) => Promise<T>,
  attributes: SpanData = {},
): Promise<T> {
  if (!state.active) return fn(NOOP_RECORDER)
  return Sentry.startSpan({ name, op, attributes }, (span) =>
    fn({
      set: (key, value) => {
        if (value !== undefined) span.setAttribute(key, value)
      },
    }),
  )
}

/**
 * Para trabalho que continua depois da resposta: um span que termina depois da
 * sua transação se perde no envio por transação, então esse trabalho abre a SUA
 * transação, no mesmo trace de quem o originou (capturado aqui, na chamada).
 */
export function detachedTransaction(name: string): <T>(fn: () => Promise<T>) => Promise<T> {
  if (!state.active) return (fn) => fn()
  const trace = Sentry.getTraceData()
  return (fn) =>
    Sentry.continueTrace({ sentryTrace: trace['sentry-trace'], baggage: trace.baggage }, () =>
      Sentry.startSpan({ name, op: 'function', forceTransaction: true }, () => fn()),
    )
}

/**
 * Executa um trabalho agendado como transação sempre medida, com os logs e
 * eventos marcados com o serviço `<projeto>-cron`.
 */
export function runCronJob<T>(name: string, fn: () => Promise<T>): Promise<T> {
  if (!state.active) return fn()
  const service = serviceName('cron')
  return Sentry.withIsolationScope((scope) => {
    scope.setTag('service', service)
    return Sentry.startSpan(
      { name, op: 'function', forceTransaction: true, attributes: { [ALWAYS_SAMPLE]: true } },
      () => fn(),
    )
  })
}

// ---------------------------------------------------------------------------
// Batimento
// ---------------------------------------------------------------------------

const HEARTBEAT_TIMEOUT_MS = 5_000

/**
 * POST na URL de um monitor de batimento do GlitchTip, depois de uma rodada
 * bem-sucedida: a ausência do sinal no intervalo gera o alerta. Falha vira
 * aviso, nunca erro — não pode transformar em falha uma rodada que deu certo.
 */
export async function sendHeartbeat(
  url: string | undefined,
  fetchImpl: typeof fetch = fetch,
): Promise<boolean> {
  if (!url) return false
  try {
    const response = await fetchImpl(url, {
      method: 'POST',
      signal: AbortSignal.timeout(HEARTBEAT_TIMEOUT_MS),
    })
    if (!response.ok) throw new Error(`status ${response.status}`)
    return true
  } catch (error) {
    log.warn('heartbeat', 'Batimento não entregue: {reason}', {
      reason: error instanceof Error ? error.message : String(error),
    })
    return false
  }
}
