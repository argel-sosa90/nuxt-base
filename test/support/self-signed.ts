import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

/**
 * Certificado autoassinado para 127.0.0.1 (o `web-push` só fala HTTPS) e um
 * bundle de CAs para `NODE_EXTRA_CA_CERTS` do servidor do app: o certificado
 * mais o bundle que o ambiente já usava, se houver.
 */
export function selfSignedCertificate(): { key: string; cert: string; caBundle: string } {
  const dir = mkdtempSync(join(tmpdir(), 'nuxt-base-tls-'))
  const keyPath = join(dir, 'key.pem')
  const certPath = join(dir, 'cert.pem')
  execFileSync(
    'openssl',
    [
      'req',
      '-x509',
      '-newkey',
      'ec',
      '-pkeyopt',
      'ec_paramgen_curve:prime256v1',
      '-nodes',
      '-keyout',
      keyPath,
      '-out',
      certPath,
      '-days',
      '1',
      '-subj',
      '/CN=127.0.0.1',
      '-addext',
      'subjectAltName=IP:127.0.0.1',
    ],
    { stdio: 'ignore' },
  )
  const cert = readFileSync(certPath, 'utf8')
  const previous = process.env.NODE_EXTRA_CA_CERTS
  const caBundle = join(dir, 'ca-bundle.pem')
  writeFileSync(
    caBundle,
    cert + (previous && existsSync(previous) ? `\n${readFileSync(previous, 'utf8')}` : ''),
  )
  return { key: readFileSync(keyPath, 'utf8'), cert, caBundle }
}
