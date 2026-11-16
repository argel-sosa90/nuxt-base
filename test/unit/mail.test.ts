import { describe, expect, it, vi } from 'vitest'
import { deliverMail, readMailEnv } from '../../layers/mail/server/utils/mail'
import { escapeHtml, renderEmail } from '../../layers/mail/server/utils/mail-layout'

const config = readMailEnv({
  ZOHO_CPAAS_API_KEY: 'chave',
  MAIL_FROM_ADDRESS: 'nao-responda@example.com',
  MAIL_FROM_NAME: 'Meu App',
})
const message = {
  to: 'ana@example.com',
  subject: 'Oi',
  text: 't',
  html: '<p>h</p>',
  reference: 'teste:1',
}

describe('readMailEnv', () => {
  it('URL padrão do CPaaS e remetente', () => {
    expect(config).toEqual({
      apiKey: 'chave',
      url: 'https://cpaas.zoho.com/v1.1/email',
      fromAddress: 'nao-responda@example.com',
      fromName: 'Meu App',
    })
  })
})

describe('deliverMail', () => {
  it('monta o pedido do CPaaS sem rastreamento de cliques', async () => {
    const fetchMock = vi.fn(async () => Response.json({ request_id: 'r1' }))
    const info = vi.spyOn(console, 'info').mockImplementation(() => undefined)
    expect(await deliverMail(config, message, fetchMock as unknown as typeof fetch)).toBe(true)
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://cpaas.zoho.com/v1.1/email')
    expect((init.headers as Record<string, string>).Authorization).toBe('Zoho-enczapikey chave')
    expect(JSON.parse(init.body as string)).toEqual({
      from: { address: 'nao-responda@example.com', name: 'Meu App' },
      to: [{ email_address: { address: 'ana@example.com' } }],
      subject: 'Oi',
      textbody: 't',
      htmlbody: '<p>h</p>',
      track_opens: false,
      track_clicks: false,
      client_reference: 'teste:1',
    })
    info.mockRestore()
  })

  it('sem configuração, recusa ou erro de rede: false, sem lançar', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const fetchMock = vi.fn()
    expect(await deliverMail(readMailEnv({}), message, fetchMock as unknown as typeof fetch)).toBe(
      false,
    )
    expect(fetchMock).not.toHaveBeenCalled()
    const reject = async () => new Response('{"to":"ana@example.com"}', { status: 400 })
    expect(await deliverMail(config, message, reject as unknown as typeof fetch)).toBe(false)
    const offline = async () => {
      throw new TypeError('fetch failed')
    }
    expect(await deliverMail(config, message, offline as unknown as typeof fetch)).toBe(false)
    expect(error).toHaveBeenCalledTimes(3)
    error.mockRestore()
  })
})

describe('renderEmail', () => {
  const brand = { name: 'Meu App', color: '#123456', footer: 'Ignore se não foi você.' }

  it('escapa o que vem de gente, no HTML', () => {
    const { html, text } = renderEmail(
      {
        title: 'Convite de <b>Ana</b>',
        paragraphs: ['Família "Silva" & cia <script>alert(1)</script>'],
        button: { label: 'Aceitar', url: 'https://app.example.com/convite/x?a=1&b=2' },
        note: 'Vale 7 dias.',
      },
      brand,
    )
    expect(html).not.toContain('<script>')
    expect(html).toContain('Convite de &lt;b&gt;Ana&lt;/b&gt;')
    expect(html).toContain('href="https://app.example.com/convite/x?a=1&amp;b=2"')
    expect(html).toContain('background:#123456')
    expect(text).toBe(
      [
        'Convite de <b>Ana</b>',
        '',
        'Família "Silva" & cia <script>alert(1)</script>',
        '',
        'Aceitar: https://app.example.com/convite/x?a=1&b=2',
        '',
        'Vale 7 dias.',
        '',
        'Meu App — Ignore se não foi você.',
      ].join('\n'),
    )
  })

  it('recusa link que não é http(s) ou mailto', () => {
    expect(() =>
      renderEmail(
        { title: 't', paragraphs: [], button: { label: 'x', url: 'javascript:alert(1)' } },
        brand,
      ),
    ).toThrow()
  })

  it('escapeHtml', () => {
    expect(escapeHtml(`<a href="x">'&'</a>`)).toBe(
      '&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;',
    )
  })
})
