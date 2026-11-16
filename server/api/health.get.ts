/**
 * Alvo do healthcheck do Docker/Dokploy e do monitor de disponibilidade do
 * GlitchTip. 503 se alguma verificação registrada falhar: um app que responde
 * mas não alcança o banco não está saudável. Sem sessão, sem medição.
 */
export default defineEventHandler(async (event) => {
  const report = await runHealthChecks()
  if (report.status !== 'ok') setResponseStatus(event, 503)
  setResponseHeader(event, 'Cache-Control', 'no-store')
  return report
})
