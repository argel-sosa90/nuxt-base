import * as Sentry from '@sentry/vue'

/**
 * Registrador do navegador: falhas que a tela contorna sem avisar quem usa
 * (inscrição de push, sincronização, reconexão) viram um log de mensagem FIXA
 * no GlitchTip, com os valores em atributos — só ids, códigos e contagens.
 *
 * Não muda nada na tela nem no console. Sem o rastreador ligado
 * (desenvolvimento, testes), não faz nada. Só `warn` e `error`.
 */

export type ClientLogAttributes = Record<string, string | number | boolean | null | undefined>

function emit(
  level: 'warn' | 'error',
  scope: string,
  message: string,
  attributes: ClientLogAttributes,
) {
  if (!Sentry.getClient()) return
  const defined: Record<string, string | number | boolean> = {}
  for (const [key, value] of Object.entries(attributes)) {
    if (value !== undefined && value !== null) defined[key] = value
  }
  Sentry.logger[level](message, { scope, ...defined })
}

/** Nome do tipo de um erro capturado, para ir como atributo — nunca a mensagem. */
export function errorType(error: unknown): string {
  // Pelo `name`, e não por `instanceof Error`: um `DOMException` não é `Error`
  // em todo navegador.
  const name = (error as { name?: unknown } | null)?.name
  return typeof name === 'string' && name ? name : typeof error
}

export const clientLog = {
  warn: (scope: string, message: string, attributes: ClientLogAttributes = {}) =>
    emit('warn', scope, message, attributes),
  error: (scope: string, message: string, attributes: ClientLogAttributes = {}) =>
    emit('error', scope, message, attributes),
}
