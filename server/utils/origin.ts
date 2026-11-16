/**
 * Decide se o cabeçalho `Origin` de uma requisição que altera estado é aceitável.
 *
 * Ausência passa, de propósito: navegador sempre manda `Origin` em
 * `POST`/`PUT`/`PATCH`/`DELETE`, inclusive de mesma origem; quem não manda não
 * é navegador e não carrega o cookie de uma vítima — o único ataque que esta
 * conferência barra. Também deixa scripts de cron chamarem a API.
 *
 * Presente e diferente é recusado, sem exceções: outro subdomínio do mesmo
 * domínio é "same-site" para o cookie `SameSite=Lax`, e é dele que esta regra
 * protege. `Origin: null` cai aqui também.
 */
export function isAllowedOrigin(origin: string | null | undefined, expected: string): boolean {
  if (origin === null || origin === undefined) return true
  return origin === expected
}
