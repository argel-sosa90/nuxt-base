# nuxt-base

Base dos apps pessoais da ASolutions em Nuxt 4. Duas partes neste repositório:

|                               | O que é                                                                                                                                        | Como o app recebe                                            |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| **Layers** (raiz e `layers/`) | Código comum e versionado, uma entrada por feature                                                                                             | `extends` no `nuxt.config.ts`; atualização = trocar a versão |
| **Template** (`template/`)    | Ponto de partida de um app: Nuxt UI, Drizzle + Postgres, perfil local, inscrições de push, ícones, Dockerfile, compose, CI e deploy no Dokploy | Copiado uma vez ao criar o projeto                           |

O que mudar em todos os apps vai para os layers; o que cada app adapta fica no template.
Extraído do family-lists (observabilidade, e-mail, PWA e push, que já rodam em produção
lá) e do plano de SSO do `zitadel-dokploy`.

## Features

Cada app escolhe as suas, como "extras" de um pacote:

```ts
// nuxt.config.ts
extends: ['@asolutions/nuxt-base/push', '@asolutions/nuxt-base/mail']
```

| Entrada                      | O quê                                                                                                                                       | Traz junto              |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------- |
| `@asolutions/nuxt-base`      | **Núcleo**: GlitchTip (erros, logs, desempenho, batimento), `/api/health`, cabeçalhos de segurança, conferência de origem, limite por chave | —                       |
| `@asolutions/nuxt-base/auth` | Login OIDC genérico, sessão em cookie selado, `useAuth`, middleware `auth`                                                                  | núcleo                  |
| `@asolutions/nuxt-base/mail` | E-mail pelo Zoho CPaaS, layout que escapa o conteúdo                                                                                        | núcleo                  |
| `@asolutions/nuxt-base/pwa`  | Manifest, service worker com precache, tela offline, limpeza de cache no logout                                                             | núcleo                  |
| `@asolutions/nuxt-base/push` | Web Push: VAPID, envio, limpeza de inscrições mortas, `usePush`, notificação no service worker                                              | núcleo, `/pwa`, `/auth` |

Uma entrada só, uma versão só: nada de descobrir se o `/push` 1.3 combina com o `/auth`
1.1. As dependências de todas as features vêm no pacote, mas a imagem Docker só leva o
que o código do app usa (o Nitro rastreia os imports): um app sem push não carrega o
`web-push`.

Um `extends` que não resolve **não dá erro**: o build passa sem o layer. O teste
`test/unit/entries.test.ts` confere cada entrada pelo nome do pacote, como um app faria.

## Projeto novo

```bash
npx giget@latest gh:argel-sosa90/nuxt-base/template meu-app
```

Depois, em `meu-app/`:

1. Troque `meu-app`/`Meu App` pelo nome do projeto em `package.json`,
   `app/app.config.ts` (`base.project`, `base.mail.brandName`),
   `.github/workflows/deploy.yml` (`image`) e `nuxt.config.ts` (título e manifest).
   Troque os ícones de `public/`.
2. `cp .env.example .env`, `docker compose up -d db db-test`, `npm install`, `npm run dev`.
   Versione o `package-lock.json` que o `npm install` gera: o Dockerfile e o CI usam
   `npm ci`, que exige o lockfile (e é ele que fixa o hash do pacote da base).
3. Siga o [checklist de produção](#checklist-de-produção).

## Núcleo

### Rotas

| Rota                  | O quê                                                                                                 |
| --------------------- | ----------------------------------------------------------------------------------------------------- |
| `GET /api/health`     | 200 ou 503 conforme as verificações registradas; alvo do Docker, do Dokploy e do monitor do GlitchTip |
| `POST /api/telemetry` | Túnel do navegador ao GlitchTip (o DSN nunca chega ao cliente)                                        |

Toda resposta sai com `X-Content-Type-Options`, `Referrer-Policy: same-origin`, CSP
(`frame-ancestors`, `base-uri`, `object-src`, `form-action`) e HSTS fora de
desenvolvimento. `POST/PUT/PATCH/DELETE` em `/api/**` e `/auth/**` vindo de outra origem
recebe 403 antes de qualquer handler.

### Servidor (auto-import)

```ts
// Log: linha no console + log estruturado no GlitchTip, modelo fixo
log.info('billing', 'Enviados {count} avisos', { count: 3 })

// Falha contornada: evento agrupado por [escopo, tipo do erro] + log
reportFailure('provider', error, { message: 'Provedor recusou', context: { status: 429 } })

// Etapa medida dentro da transação da requisição
await measureStep('montar painel', 'function', async (step) => {
  step.set('contas', n)
})

// Trabalho agendado: transação sempre medida, serviço `<projeto>-cron`
await runCronJob('verificar vencimentos', async () => {
  /* ... */
})
await sendHeartbeat(process.env.DUE_DATE_HEARTBEAT_URL) // depois de uma rodada bem-sucedida
await flushMonitoring() // em script curto: os logs vão em lote a cada ~5 s

// Saúde: num plugin do Nitro
registerHealthCheck('database', () => useDatabase().execute(sql`SELECT 1`))

// Limite por chave em memória
const throttle = createThrottle(10, 60 * 60_000)
if (!throttle.allow(clientAddress(event))) throw createError({ statusCode: 429 })
```

### Navegador (auto-import)

```ts
clientLog.warn('sync', 'Fila não sincronizou', { error_type: errorType(error) })
```

### Configuração (`app/app.config.ts` do app)

```ts
export default defineAppConfig({
  base: {
    project: 'meu-app', // GlitchTip: versão `meu-app@<sha>`, serviços `meu-app-api|cron|web`
    telemetry: {
      tokenPathPrefixes: ['/convite/', '/api/invites/'], // segmento seguinte vira `[token]`
      tokenQueryPaths: ['/nova-senha'], // consulta vira `?[token]`
      untracedPaths: ['/api/realtime'], // nunca viram transação
      alwaysSampledPaths: ['/api/cron/due-dates'], // sempre medidas
    },
  },
})
```

No Nuxt 4 o arquivo fica em `app/`, não na raiz: na raiz ele é ignorado sem aviso.

### GlitchTip

Mesmas regras do family-lists e do bills-manager:

- **Nada de dado pessoal**: tudo passa por uma limpeza por lista de permissão, igual no
  servidor, no navegador e no túnel. A pessoa é só o id da conta; URLs perdem a
  consulta; tokens em caminho viram `[token]`; URLs externas ficam só com a origem;
  erros de banco viram `PostgresError <SQLSTATE>`, sem os valores.
- **Erro recorrente acumula numa issue**: mensagens fixas, valores em atributos;
  `Dedupe` desligado para o alerta por frequência contar.
- **Status < 500 não é erro**: validação, sessão, inexistente e conflito não geram evento.
- **Serviços** `<projeto>-api`, `<projeto>-cron` e `<projeto>-web` no atributo `service`.
- **Versão** `<projeto>@<sha curto>`, a mesma no servidor e no navegador (o workflow
  reutilizável passa `APP_RELEASE` a todo build).
- **GlitchTip 7**: envio por transação (`traceLifecycle: 'static'`; spans em streaming
  são descartados em silêncio) e sem sessões (não aceitas).

As linhas de código-fonte da pilha (`ContextLines`) vão junto: são código, não dado da
requisição. Não escreva segredo em literal no código.

## `/auth`: login

Rotas: `GET /auth/login?returnTo=/x&prompt=create`, `GET /auth/callback`,
`POST /auth/logout` (devolve `{ redirect }` para o logout no IdP) e
`GET /api/_auth/session`.

```ts
// servidor
const user = await requireAuthUser(event) // 401 sem sessão; getAuthUser devolve null

nitroApp.hooks.hook('base:auth:login', async ({ user, claims }) => {
  const profile = await upsertProfile(useDatabase(), user) // perfil local pelo `sub`
  user.id = profile.id // a sessão e o GlitchTip passam a usar o id local
  // throw createError({ statusCode: 403 }) recusa o login (?auth_error=forbidden)
})

// navegador
const { user, status, loggedIn, login, logout } = useAuth()
login({ returnTo: '/painel', prompt: 'create' }) // `create` abre o cadastro do IdP
definePageMeta({ middleware: 'auth' }) // página que exige login
```

**OIDC genérico.** Code + PKCE, `state`, `nonce`, ID token validado, `userinfo` e
RP-initiated logout, pelo [`openid-client`](https://github.com/panva/openid-client)
(certificado pela OpenID Foundation). Trocar de IdP é trocar três variáveis e cadastrar o
app no novo.

No IdP, um app **Web** (confidencial, `client_secret_basic`) ou **SPA** (público, só
PKCE) com redirect `https://<app>/auth/callback`, post-logout redirect `https://<app>/`
(o `auth.afterLogout`) e escopos `openid profile email`. No Zitadel do
`zitadel-dokploy`, uma entrada em `bootstrap/<ambiente>.json`:

```json
{
  "name": "meu-app",
  "envPrefix": "MEU_APP",
  "app": {
    "name": "meu-app-web",
    "type": "web",
    "developmentMode": false,
    "redirectUris": ["https://meu-app.asolutions.dev/auth/callback"],
    "postLogoutRedirectUris": ["https://meu-app.asolutions.dev/"]
  }
}
```

**Sessão.** Cookie `base-session` selado (`HttpOnly`, `SameSite=Lax`), só com o usuário
(id, `sub`, e-mail, nome); os tokens do IdP não são guardados. Consequências:

- Um usuário desativado no IdP continua logado no app até a sessão expirar
  (`SESSION_MAX_AGE_DAYS`, contados do login).
- Trocar o `SESSION_SECRET` desloga todo mundo.
- O vínculo com o perfil local é pelo `sub`, nunca pelo e-mail.

**Offline.** Sem rede, a sessão fica `unknown` e o middleware `auth` deixa a tela abrir
em vez de mandar ao IdP (que daria página de erro). Os dados continuam protegidos no
servidor.

**Logout no aparelho.** Antes de sair, `useAuth().logout()` chama o gancho
`base:auth:logout` no navegador: o `/push` desinscreve o aparelho e o `/pwa` apaga os
caches de dados, para a próxima pessoa no mesmo navegador não receber nem ver o que era
da anterior. Um app com dados locais próprios usa o mesmo gancho.

## `/mail`: e-mail (Zoho CPaaS)

```ts
await sendTemplatedMail({
  to: invite.email,
  reference: `convite:${invite.id}`, // vai ao CPaaS e aos logs: nunca e-mail nem token
  subject: 'Você foi convidado',
  title: 'Você foi convidado',
  paragraphs: [`${inviter} convidou você para a família ${family}.`], // texto, escapado
  button: { label: 'Aceitar convite', url: appLink(`/convite/${token}`) },
  note: 'O link vale por 7 dias.',
})
```

`sendTemplatedMail` e `sendMail` nunca lançam: devolvem `false` e registram a falha no
GlitchTip sem o destinatário (o corpo da resposta do provedor, que pode repeti-lo, só vai
ao console). Rastreamento de abertura e de cliques desligado (os links levam token). Sem
`ZOHO_CPAAS_API_KEY` ou `MAIL_FROM_ADDRESS`, o e-mail fica desligado.

Marca no `app.config.ts`: `base.mail.brandName`, `brandColor`, `footer`.

## `/pwa`: app instalável

- Service worker próprio (`injectManifest`): precache do build, tela `/offline` (o único
  HTML de um app SSR) para navegação sem rede, atualização automática.
- `<link rel="manifest">` em toda página, já no HTML do servidor (no family-lists era um
  `<VitePwaManifest />` que precisava ser lembrado).
- O app declara só nome e cor (`pwa.manifest` no `nuxt.config.ts`) e põe em `public/`:
  `icon-192.png`, `icon-512.png`, `icon-maskable-512.png` e `badge-96.png`. Não declare
  `icons`: listas se somam às do layer.
- Sem cache de dados por padrão (privacidade entre contas). Para ler offline, escreva um
  service worker no app que importe `setupCore` de `@asolutions/nuxt-base/sw` e
  acrescente as rotas, e aponte `pwa.srcDir`/`pwa.filename` para ele. Os caches de dados
  são apagados no logout.
- Em `nuxt dev` o service worker fica desligado; para testar, `pwa.devOptions.enabled`.

## `/push`: notificações

```ts
// servidor: onde as inscrições ficam (o template traz a tabela e o store)
registerPushStore(createPushStore(useDatabase()))

// enviar: nunca lança; apaga as inscrições que o serviço diz não existirem (404/410)
await sendPushToUser(user.id, {
  title: 'Conta vence hoje',
  body: 'Luz',
  url: '/contas/1',
  tag: 'conta-1',
})

// navegador, a partir de um gesto da pessoa
const push = usePush()
const result = await push.enable() // 'enabled' | 'denied' | 'unsupported' | 'notConfigured'
await push.disable()
```

Rotas: `GET /api/_push/vapid-key`, `POST` e `DELETE /api/_push/subscription` (exigem
login; a inscrição é sempre da conta da sessão). Só aceita inscrições de serviços de push
conhecidos (Google, Mozilla, Apple, Microsoft), em https: o servidor faz POST no endereço
que o navegador manda, e sem isso uma conta faria o servidor chamar um endereço interno.
O endereço da inscrição é credencial e nunca vai a log nem ao GlitchTip.

Para um service worker próprio, importe `setupPush` de `@asolutions/nuxt-base/sw/push`.

## Variáveis de ambiente

Lidas em **execução**, nunca no build: a mesma imagem serve a qualquer ambiente (o
`runtimeConfig` do Nuxt congela valores no build, e foi assim que o login do
family-lists quebrou em produção).

| Variável                                | Feature | Padrão                              |                                                     |
| --------------------------------------- | ------- | ----------------------------------- | --------------------------------------------------- |
| `APP_URL`                               | núcleo  | `http://localhost:3000`             | URL pública: origem esperada, links, `redirect_uri` |
| `APP_ENV`                               | núcleo  | `production`                        | Ambiente dos eventos                                |
| `GLITCHTIP_DSN`                         | núcleo  | vazio                               | Sem ele, nada é enviado                             |
| `GLITCHTIP_TRACES_SAMPLE_RATE`          | núcleo  | `0.1`                               | 0 a 1; inválido desliga a medição                   |
| `OIDC_ISSUER`, `OIDC_CLIENT_ID`         | `/auth` | vazio                               | Sem eles, o login responde 503                      |
| `OIDC_CLIENT_SECRET`                    | `/auth` | vazio                               | Vazio = cliente público (só PKCE)                   |
| `OIDC_SCOPES`                           | `/auth` | `openid profile email`              |                                                     |
| `OIDC_REQUIRE_EMAIL_VERIFIED`           | `/auth` | `true`                              | Recusa e-mail não verificado                        |
| `SESSION_SECRET`                        | `/auth` | vazio                               | 32+ caracteres; em dev, um aleatório por subida     |
| `SESSION_MAX_AGE_DAYS`                  | `/auth` | `7`                                 |                                                     |
| `ZOHO_CPAAS_API_KEY`                    | `/mail` | vazio                               | Sem ela, e-mail desligado                           |
| `ZOHO_CPAAS_URL`                        | `/mail` | `https://cpaas.zoho.com/v1.1/email` |                                                     |
| `MAIL_FROM_ADDRESS`, `MAIL_FROM_NAME`   | `/mail` | vazio                               |                                                     |
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` | `/push` | vazio                               | Sem elas, push desligado                            |
| `VAPID_SUBJECT`                         | `/push` | `APP_URL` se https                  | `mailto:` ou URL https                              |
| `PUSH_ALLOWED_HOSTS`                    | `/push` | vazio                               | Serviços de push extras, separados por vírgula      |

## Checklist de produção

1. **GlitchTip** (org `asolutions`): projeto `<slug>`, DSN no Infisical como
   `GLITCHTIP_DSN`. Monitor de disponibilidade em `https://<app>/api/health`. Para cada
   cron, um monitor de batimento. Regras de alerta filtrando `environment:production`.
2. **IdP** (`/auth`): app cadastrado como na seção de login.
3. **Zoho CPaaS** (`/mail`): agente de envio do app, domínio do remetente verificado.
4. **VAPID** (`/push`): `npx web-push generate-vapid-keys`; a privada é `critical` (trocar
   invalida todas as inscrições).
5. **Infisical**: projeto `<slug>` (envs `prod`/`dev`, tags) com `SESSION_SECRET`,
   `OIDC_CLIENT_SECRET`, `GLITCHTIP_DSN`, `DATABASE_URL`, `ZOHO_CPAAS_API_KEY`,
   `VAPID_PRIVATE_KEY`. Identidade `dokploy` como Viewer, Vault Provider `<slug>-prod`.
   No projeto `ci`, pasta `/<repo>` com `DOKPLOY_WEBHOOK_URL`.
6. **Dokploy**: banco como serviço Database (`postgres:18`, volume em
   `/var/lib/postgresql/18/docker`, backup S3 diário); application com provider Docker
   (`registry.asolutions.dev/<slug>:latest`), autodeploy desligado, segredos como
   referências `${{vault.<slug>-prod.<CHAVE>}}` e o resto literal.
7. **DNS** `A` para a VPS (Cloudflare: sem proxy, para o Let's Encrypt).
8. Push na `main`: o `deploy.yml` testa, publica a imagem e chama o webhook.

## Versões e atualização dos apps

O pacote é publicado como `.tgz` numa release do GitHub (`release.yml`, ao criar a tag
`vX.Y.Z` igual ao `version` do `package.json`). O app depende da URL:

```json
"@asolutions/nuxt-base": "https://github.com/argel-sosa90/nuxt-base/releases/download/v0.1.0/asolutions-nuxt-base-0.1.0.tgz"
```

Sem registry e sem token; o `package-lock.json` fixa o hash. Para atualizar um app:
trocar a URL, `npm install`, rodar os testes. Exige o repositório **público** (não há
segredo nenhum aqui, como no `workflows`); privado, a alternativa é o GitHub Packages,
com token de leitura no CI e no build da imagem.

Mudança incompatível (rota, variável, nome de função) sobe a versão maior e vai descrita
na release.

## Desenvolvimento

```bash
npm install
npx playwright install chromium  # testes do PWA
npm run dev                      # playground (todas as features) em http://localhost:3000
npm test                         # unitários + integração
npm run typecheck
npm run format
```

A integração compila o playground em produção e o testa contra um IdP OIDC simulado
(`oauth2-mock-server`), um GlitchTip falso, um Zoho CPaaS falso e serviços de push falsos
(HTTPS com certificado gerado no teste), e abre o app no Chromium: precache, tela offline,
push entregue pelo DevTools e limpeza de cache no logout. O CI também instala o
`template/` contra o pacote do commit e roda lint, tipos, testes e build.

## Decisões

- **Layers por feature num pacote só**, e não um pacote por feature: uma versão, uma
  release, sem matriz de compatibilidade.
- **Plugin do Nitro**, e não `@sentry/nuxt`: o SDK oficial lê a configuração antes do
  Nitro (fora das variáveis de execução) e exige `node --import`.
- **Sessão selada em cookie**, e não Better Auth: com IdP externo, o app não precisa de
  tabelas de autenticação, só do perfil.
- **Banco e inscrições de push no template**, não nos layers: o schema é de cada app.
