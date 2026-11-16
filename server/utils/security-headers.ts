/**
 * Cabeçalhos de segurança de toda resposta.
 *
 * A CSP só tem as diretivas que não dependem de saber quais scripts e estilos a
 * página carrega (uma `script-src` exigiria nonce por resposta). O que está
 * aqui já fecha: a página em `iframe` de outro site (clickjacking), `<base>`
 * injetada, plugins e formulário enviando para fora.
 *
 * `Referrer-Policy: same-origin`: tokens em caminho de URL (convites, links de
 * ação) não vazam para outro site como referência.
 *
 * Em desenvolvimento: sem HSTS (não prender `localhost` em HTTPS) e
 * `frame-ancestors 'self'`, porque o Nuxt DevTools abre num `iframe` do app.
 */
export function securityHeaders(options: { dev: boolean }): Record<string, string> {
  const csp = [
    `frame-ancestors ${options.dev ? "'self'" : "'none'"}`,
    "base-uri 'self'",
    "object-src 'none'",
    "form-action 'self'",
  ].join('; ')

  return {
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'same-origin',
    'Content-Security-Policy': csp,
    // Um ano, sem `includeSubDomains`: o app não decide pelos outros subdomínios.
    ...(options.dev ? {} : { 'Strict-Transport-Security': 'max-age=31536000' }),
  }
}
