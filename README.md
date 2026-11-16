# nuxt-base

Base dos apps pessoais da ASolutions em Nuxt 4. Duas partes neste repositório:

|                            | O que é                                                                                                                           | Como o app recebe                                                   |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| **Layer** (raiz)           | Código comum, versionado: observabilidade no GlitchTip, login OIDC, `/api/health`, cabeçalhos de segurança, conferência de origem | `extends: ['@asolutions/nuxt-base']`; atualização = trocar a versão |
| **Template** (`template/`) | Ponto de partida de um app: Nuxt UI, Drizzle + Postgres, perfil local ligado ao IdP, Dockerfile, compose, CI e deploy no Dokploy  | Copiado uma vez ao criar o projeto                                  |

O que mudar em todos os apps vai para o layer; o que cada app adapta fica no template.

Extraído do family-lists (observabilidade testada em produção) e do plano de
SSO do `zitadel-dokploy`. A diferença principal: o login é **OIDC genérico**, sem
depender de qual IdP será usado.

## Projeto novo

```bash
npx giget@latest gh:argel-sosa90/nuxt-base/template meu-app
```

Depois, em `meu-app/`:

1. Troque `meu-app` pelo slug do projeto em `package.json` (`name`),
   `app/app.config.ts` (`base.project`), `.github/workflows/deploy.yml` (`image`)
   e o título em `nuxt.config.ts`.
2. `cp .env.example .env`, `docker compose up -d db db-test`, `npm install`, `npm run dev`.
3. Siga o [checklist de produção](#checklist-de-produção).

## O que o layer entrega

### Rotas

| Rota                                        | O quê                                                                                           |
| ------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `GET /auth/login?returnTo=/x&prompt=create` | Vai ao IdP (Authorization Code + PKCE, `state`, `nonce`)                                        |
| `GET /auth/callback`                        | Retorno do IdP: valida, busca o `userinfo`, chama o gancho do app, grava a sessão               |
| `POST /auth/logout`                         | Apaga a sessão e devolve `{ redirect }` para o logout no IdP                                    |
| `GET /api/_auth/session`                    | `{ user }` para o navegador                                                                     |
| `GET /api/health`                           | 200 ou 503 conforme as verificações registradas; alvo do Docker, Dokploy e monitor do GlitchTip |
| `POST /api/telemetry`                       | Túnel do navegador ao GlitchTip (o DSN nunca chega ao cliente)                                  |

Toda resposta sai com `X-Content-Type-Options`, `Referrer-Policy: same-origin`, CSP
(`frame-ancestors`, `base-uri`, `object-src`, `form-action`) e HSTS fora de
desenvolvimento. `POST/PUT/PATCH/DELETE` em `/api/**` e `/auth/**` vindo de outra
origem recebe 403 antes de qualquer handler.

### Servidor (auto-import)

```ts
// Rota protegida
const user = await requireAuthUser(event) // 401 sem sessão; `getAuthUser` devolve null

// Log: linha no console + log estruturado no GlitchTip, modelo fixo
log.info('billing', 'Enviados {count} avisos', { count: 3 })

// Falha contornada: evento agrupado por [escopo, tipo do erro] + log
reportFailure('email', error, { message: 'Provedor recusou o envio', context: { status: 429 } })

// Etapa medida dentro da transação da requisição
await measureStep('enviar avisos', 'function', async (step) => {
  step.set('avisos', n)
})

// Trabalho agendado: transação sempre medida, serviço `<projeto>-cron`
await runCronJob('verificar vencimentos', async () => {
  /* ... */
})
await sendHeartbeat(process.env.DUE_DATE_HEARTBEAT_URL) // depois de uma rodada bem-sucedida
await flushMonitoring() // em script curto: os logs vão em lote a cada ~5 s

// Saúde: num plugin do Nitro
registerHealthCheck('database', () => useDatabase().execute(sql`SELECT 1`))

// Limite por chave em memória (ex.: convites por família)
const throttle = createThrottle(10, 60 * 60_000)
throttle.allow(clientAddress(event))
```

Ganchos do Nitro:

```ts
nitroApp.hooks.hook('base:auth:login', async ({ user, claims }) => {
  const profile = await upsertProfile(useDatabase(), user) // perfil local pelo `sub`
  user.id = profile.id // a sessão e o GlitchTip passam a usar o id local
  // throw createError({ statusCode: 403 }) recusa o login (?auth_error=forbidden)
})
nitroApp.hooks.hook('base:auth:logout', ({ user }) => {
  /* ... */
})
```

### Navegador (auto-import)

```ts
const { user, loggedIn, login, logout, refresh } = useAuth()
login({ returnTo: '/painel', prompt: 'create' }) // `create` abre o cadastro do IdP
await logout() // sai aqui e no IdP

definePageMeta({ middleware: 'auth' }) // página que exige login

clientLog.warn('push', 'Inscrição falhou', { error_type: errorType(error) })
```

## Configuração

### `app/app.config.ts` do app

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
    auth: { afterLogin: '/painel', afterLogout: '/', errorRedirect: '/' },
  },
})
```

No Nuxt 4 o arquivo fica em `app/`, não na raiz: na raiz ele é ignorado sem aviso.

### Variáveis de ambiente

Lidas em **execução**, nunca no build: a mesma imagem serve a qualquer ambiente
(o `runtimeConfig` do Nuxt congela valores no build, e foi assim que o login do
family-lists quebrou em produção).

| Variável                       | Padrão                  |                                                                |
| ------------------------------ | ----------------------- | -------------------------------------------------------------- |
| `APP_URL`                      | `http://localhost:3000` | URL pública: origem esperada, `redirect_uri`, cookie `Secure`  |
| `APP_ENV`                      | `production`            | Ambiente dos eventos; alertas filtram por `production`         |
| `GLITCHTIP_DSN`                | vazio                   | Sem ele, nada é enviado e nenhuma conexão é aberta             |
| `GLITCHTIP_TRACES_SAMPLE_RATE` | `0.1`                   | 0 a 1; inválido desliga a medição (com aviso)                  |
| `OIDC_ISSUER`                  | vazio                   | Sem ele (ou sem o client id), o login responde 503             |
| `OIDC_CLIENT_ID`               | vazio                   |                                                                |
| `OIDC_CLIENT_SECRET`           | vazio                   | Vazio = cliente público (só PKCE)                              |
| `OIDC_SCOPES`                  | `openid profile email`  |                                                                |
| `OIDC_REQUIRE_EMAIL_VERIFIED`  | `true`                  | Recusa `email_verified` falso (`?auth_error=email_unverified`) |
| `SESSION_SECRET`               | vazio                   | 32+ caracteres. Em dev, sem ele, um aleatório por subida       |
| `SESSION_MAX_AGE_DAYS`         | `7`                     | Contados do login                                              |

## Login

**IdP a definir.** O layer fala OIDC padrão (descoberta, Code + PKCE, `userinfo`,
RP-initiated logout) pelo [`openid-client`](https://github.com/panva/openid-client),
biblioteca certificada pela OpenID Foundation. Zitadel, Authentik, Keycloak,
Authelia, Pocket ID e Logto servem; trocar de IdP é trocar três variáveis e cadastrar
o app no novo.

No IdP, cadastre um app **Web** (confidencial, `client_secret_basic`) ou **SPA/User
Agent** (público, só PKCE) com:

- Redirect URI: `https://<app>/auth/callback` (e `http://localhost:3000/auth/callback`
  num app de desenvolvimento)
- Post-logout redirect URI: `https://<app>/` (o `auth.afterLogout`)
- Escopos `openid profile email`

No Zitadel do `zitadel-dokploy`, é uma entrada em `bootstrap/<ambiente>.json`:

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

O client secret sai em `bootstrap/out/production.env` e vai para o Infisical como
`OIDC_CLIENT_SECRET` no projeto do app.

**Como a sessão funciona.** Cookie `base-session` selado (h3 `useSession`,
`HttpOnly`, `SameSite=Lax`), só com o usuário (id, `sub`, e-mail, nome). Os tokens do
IdP não são guardados. Consequências:

- Um usuário desativado no IdP continua logado no app até a sessão expirar
  (`SESSION_MAX_AGE_DAYS`). Se isso importar, encurte a sessão ou acrescente
  back-channel logout.
- Trocar o `SESSION_SECRET` desloga todo mundo.
- O vínculo com o perfil local é pelo `sub`, nunca pelo e-mail. Migrar usuários de um
  login antigo vinculando pelo e-mail só é seguro com `email_verified` (o padrão aqui).

## GlitchTip

Mesmas regras do family-lists e do bills-manager:

- **Nada de dado pessoal**: tudo passa por uma limpeza por lista de permissão, igual
  no servidor, no navegador e no túnel. A pessoa é só o id da conta; URLs perdem a
  consulta; tokens em caminho viram `[token]`; URLs externas ficam só com a origem;
  erros de banco viram `PostgresError <SQLSTATE>`, sem os valores.
- **Erro recorrente acumula numa issue**: mensagens fixas, valores em atributos;
  `Dedupe` desligado para o alerta por frequência contar.
- **Status < 500 não é erro**: validação, sessão, inexistente e conflito não geram evento.
- **Serviços** `<projeto>-api`, `<projeto>-cron` e `<projeto>-web` no atributo `service`.
- **Versão** `<projeto>@<sha curto>`, a mesma no servidor e no navegador
  (o workflow reutilizável passa `APP_RELEASE` a todo build).
- **GlitchTip 7**: envio por transação (`traceLifecycle: 'static'`; spans em
  streaming são descartados em silêncio) e sem sessões (não aceitas).

As linhas de contexto do código-fonte (`ContextLines`) vão na pilha: são código, não
dado da requisição. Não escreva segredo em literal no código.

## Checklist de produção

1. **GlitchTip** (org `asolutions`): projeto `<slug>` (plataforma JavaScript), DSN no
   Infisical como `GLITCHTIP_DSN`. Monitor de disponibilidade em
   `https://<app>/api/health`. Para cada cron, um monitor de batimento, com a URL
   numa variável do app. Regras de alerta filtrando `environment:production`.
2. **IdP**: app cadastrado como em [Login](#login).
3. **Infisical**: projeto `<slug>` (envs `prod` e `dev`, tags `critical`,
   `first-start-only`, `rotatable`, `third-party`) com `SESSION_SECRET`,
   `OIDC_CLIENT_SECRET`, `GLITCHTIP_DSN`, `DATABASE_URL`. Identidade `dokploy` como
   Viewer, Vault Provider `<slug>-prod` no Dokploy. No projeto `ci`, pasta `/<repo>`
   com `DOKPLOY_WEBHOOK_URL`.
4. **Dokploy**: banco como serviço Database (`postgres:18`, imagem Debian, volume em
   `/var/lib/postgresql/18/docker`, backup S3 diário). Application com provider
   Docker (`registry.asolutions.dev/<slug>:latest`, credenciais em branco), autodeploy
   desligado, variáveis como referências `${{vault.<slug>-prod.<CHAVE>}}` e as literais
   (`APP_URL`, `APP_ENV=production`, `OIDC_ISSUER`, `OIDC_CLIENT_ID`).
5. **DNS** `A` para a VPS (Cloudflare: sem proxy, para o Let's Encrypt).
6. Push na `main`: o `deploy.yml` testa, publica a imagem e chama o webhook.

## Versões e atualização dos apps

O layer é publicado como `.tgz` numa release do GitHub (`release.yml`, ao criar a
tag `vX.Y.Z` igual ao `version` do `package.json`). O app depende da URL:

```json
"@asolutions/nuxt-base": "https://github.com/argel-sosa90/nuxt-base/releases/download/v0.1.0/asolutions-nuxt-base-0.1.0.tgz"
```

Sem registry e sem token; o `package-lock.json` fixa o hash. Para atualizar um app:
trocar a URL, `npm install`, rodar os testes. Exige o repositório **público** (o
layer não tem segredo nenhum, como o `workflows`). Com o repositório privado, a
alternativa é o GitHub Packages, com um token de leitura no CI e no build da imagem.

Mudança incompatível (rota, variável, nome de função) sobe a versão maior e vai
descrita na release.

## Desenvolvimento do layer

```bash
npm install
npm run dev              # playground em http://localhost:3000
npm test                 # unitários + integração (build de produção do playground)
npm run typecheck
npm run format
```

A integração sobe um IdP OIDC simulado (`oauth2-mock-server`) e um GlitchTip falso,
e percorre login, recusa, logout, eventos, logs, transações e o túnel. O CI também
instala o `template/` contra o layer do commit e roda lint, tipos, testes e build.

## Decisões

- **Nuxt Layer**, e não módulo publicado ou cópia: o código comum é código Nuxt
  comum (rotas, plugins, composables, auto-import), testado num app real, e
  corrigido uma vez para todos.
- **Plugin do Nitro**, e não `@sentry/nuxt`: o SDK oficial lê a configuração antes do
  Nitro (fora das variáveis de execução) e exige `node --import`.
- **Sessão selada em cookie**, e não Better Auth: o layer não precisa de tabelas
  próprias nem de adaptador de banco; o app só guarda o perfil. Com IdP externo, o
  Better Auth seria quase só a camada de sessão.
- **Banco no template, não no layer**: o schema é de cada app; tipar um
  `useDatabase` genérico atravessando layers não compensa.
