/**
 * Limite de envios por chave numa janela deslizante, em memória. Para rotas que
 * disparam algo caro ou abusável (e-mail, encaminhamento ao GlitchTip) num app
 * de um processo só: perder a contagem num reinício é aceitável.
 *
 * Cada chamada apaga as chaves sem envio na janela; sem isso uma chave que
 * enviou uma vez ficaria no mapa para sempre.
 */
export function createThrottle(limit: number, windowMs: number) {
  const sends = new Map<string, number[]>()

  function prune(now: number): void {
    const windowStart = now - windowMs
    for (const [key, times] of sends) {
      const recent = times.filter((at) => at > windowStart)
      if (recent.length === 0) sends.delete(key)
      else if (recent.length !== times.length) sends.set(key, recent)
    }
  }

  return {
    /** Registra um envio e diz se ele cabe no limite; recusado não conta. */
    allow(key: string, now = Date.now()): boolean {
      prune(now)
      const recent = sends.get(key) ?? []
      if (recent.length >= limit) return false
      sends.set(key, [...recent, now])
      return true
    },
    /** Quantas chaves têm envio dentro da janela (testes). */
    size(now = Date.now()): number {
      prune(now)
      return sends.size
    },
  }
}
