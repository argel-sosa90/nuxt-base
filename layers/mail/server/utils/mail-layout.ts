import { mailEnv, sendMail } from './mail'

/**
 * Layout de e-mail transacional: HTML com estilos inline (o que os clientes de
 * e-mail aceitam) e a versão em texto, montados das mesmas partes.
 *
 * Seguro por padrão: parágrafos e título são TEXTO, escapados aqui — nome de
 * família, de quem convidou, título de item vêm de gente e não podem virar HTML.
 */

export interface EmailButton {
  label: string
  url: string
}

export interface EmailContent {
  title: string
  /** Texto puro; cada item é um parágrafo. */
  paragraphs: string[]
  button?: EmailButton
  /** Texto pequeno depois do botão (validade do link, por exemplo). */
  note?: string
}

export interface EmailBrand {
  name: string
  color: string
  footer: string
}

export function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

/** Só `https:`, `http:` e `mailto:` viram link; o resto não entra no e-mail. */
function safeUrl(url: string): string {
  try {
    const parsed = new URL(url)
    if (['https:', 'http:', 'mailto:'].includes(parsed.protocol)) return parsed.href
  } catch {
    // inválida
  }
  throw new Error('URL de botão inválida')
}

export function renderEmail(
  content: EmailContent,
  brand: EmailBrand,
): { html: string; text: string } {
  const color = /^#[0-9a-f]{3,8}$/i.test(brand.color) ? brand.color : '#16a34a'
  const button = content.button
    ? { label: content.button.label, url: safeUrl(content.button.url) }
    : undefined
  const footer = [brand.name, brand.footer].filter(Boolean).join(' — ')

  const paragraphs = content.paragraphs
    .map(
      (text) =>
        `<p style="margin:0 0 16px;font-size:15px;line-height:1.5;color:#334155">${escapeHtml(text)}</p>`,
    )
    .join('\n      ')
  const buttonHtml = button
    ? `<p style="margin:24px 0">
        <a href="${escapeHtml(button.url)}"
           style="display:inline-block;padding:12px 20px;border-radius:8px;background:${color};color:#fff;text-decoration:none;font-weight:600">${escapeHtml(button.label)}</a>
      </p>`
    : ''
  const noteHtml = content.note
    ? `<p style="margin:0;font-size:13px;color:#64748b">${escapeHtml(content.note)}</p>`
    : ''

  const html = `<!doctype html>
<html lang="pt-BR">
  <body style="margin:0;background:#f8fafc;font-family:system-ui,-apple-system,'Segoe UI',sans-serif">
    <div style="max-width:520px;margin:0 auto;padding:32px 24px">
      <h1 style="margin:0 0 16px;font-size:20px;color:#0f172a">${escapeHtml(content.title)}</h1>
      ${paragraphs}
      ${buttonHtml}
      ${noteHtml}
      <p style="margin-top:32px;font-size:12px;color:#64748b">${escapeHtml(footer)}</p>
    </div>
  </body>
</html>`

  const text = [
    content.title,
    '',
    ...content.paragraphs.flatMap((p) => [p, '']),
    ...(button ? [`${button.label}: ${button.url}`, ''] : []),
    ...(content.note ? [content.note, ''] : []),
    footer,
  ].join('\n')

  return { html, text }
}

/** A marca do `app.config.ts` (`base.mail`), com o remetente como nome padrão. */
export function mailBrand(): EmailBrand {
  const config = (
    useAppConfig() as unknown as {
      base: { mail: { brandName: string; brandColor: string; footer: string } }
    }
  ).base.mail
  return {
    name: config.brandName || mailEnv().fromName,
    color: config.brandColor,
    footer: config.footer,
  }
}

/**
 * Monta e envia um e-mail com o layout padrão:
 *
 *   await sendTemplatedMail({
 *     to, reference: `convite:${invite.id}`, subject: 'Você foi convidado',
 *     title: 'Você foi convidado',
 *     paragraphs: [`${inviter} convidou você para ${family}.`],
 *     button: { label: 'Aceitar convite', url: appLink(`/convite/${token}`) },
 *   })
 */
export function sendTemplatedMail(
  options: EmailContent & { to: string; subject: string; reference?: string },
): Promise<boolean> {
  const { html, text } = renderEmail(options, mailBrand())
  return sendMail({
    to: options.to,
    subject: options.subject,
    reference: options.reference,
    html,
    text,
  })
}
