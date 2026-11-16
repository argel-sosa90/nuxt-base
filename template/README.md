# Meu App

Criado a partir do [nuxt-base](https://github.com/argel-sosa90/nuxt-base). GlitchTip,
`/api/health`, segurança, login OIDC, e-mail (Zoho CPaaS), PWA e push vêm dos layers
`@asolutions/nuxt-base/*`; a documentação deles está no README de lá.

## Desenvolvimento

```bash
cp .env.example .env
docker compose up -d db db-test
npm install
npm run dev
```

Login local: suba o Zitadel do `zitadel-dokploy` (`http://localhost:8088`), cadastre o
app com redirect `http://localhost:3000/auth/callback` e preencha `OIDC_*` no `.env`.
Usuários de teste: `ana.teste@example.com` e `bruno.teste@example.com`.

O service worker fica desligado em `nuxt dev`. Para testar o PWA e o push, use
`docker compose --profile app up --build` (a imagem de produção) ou ligue
`pwa.devOptions.enabled` no `nuxt.config.ts`.

| Comando                                                 |                                                   |
| ------------------------------------------------------- | ------------------------------------------------- |
| `npm test`                                              | Testes (banco `db-test`)                          |
| `npm run lint` / `npm run typecheck` / `npm run format` |                                                   |
| `npm run db:generate`                                   | Migration a partir de `server/database/schema.ts` |
| `docker compose --profile app up --build`               | O app com a imagem de produção                    |

As migrations rodam na subida do servidor; `RUN_MIGRATIONS=false` desliga.

## Estrutura

| Caminho                          |                                                                                            |
| -------------------------------- | ------------------------------------------------------------------------------------------ |
| `app/app.config.ts`              | `base.project` (slug no GlitchTip), caminhos com token, destinos do login, marca do e-mail |
| `server/database/schema.ts`      | `users` (perfil local, ligado ao IdP pelo `sub`) e `push_subscriptions`                    |
| `server/plugins/auth-profile.ts` | No login, cria/atualiza o perfil e põe o id local na sessão                                |
| `server/plugins/database.ts`     | Migrations na subida e verificação de saúde do banco                                       |
| `server/plugins/push-store.ts`   | Diz ao layer `/push` onde ficam as inscrições                                              |
| `server/api/me.get.ts`           | Modelo de rota protegida (`requireAuthUser`)                                               |
| `server/api/push/test.post.ts`   | Modelo de envio de push (`sendPushToOwner`)                                                |
| `app/pages/painel.vue`           | Página protegida, com o botão de notificações (`usePush`)                                  |
| `public/`                        | Ícones do PWA (troque pelos do app, mantendo os nomes)                                     |

## Tirar uma feature

| Feature        | No `extends` do `nuxt.config.ts`    | Apague também                                                                                                                                             |
| -------------- | ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Push           | troque `/push` por `/pwa` e `/auth` | `server/plugins/push-store.ts`, `server/utils/push-store.ts`, `server/api/push/`, o botão em `painel.vue`, a tabela `push_subscriptions` (nova migration) |
| PWA (e push)   | troque `/push` por `/auth`          | o que é do push, `pwa` no `nuxt.config.ts`, os ícones que não usar                                                                                        |
| E-mail         | tire `/mail`                        | `base.mail` no `app.config.ts`                                                                                                                            |
| Login (e push) | troque `/push` por `/pwa`           | `auth-profile.ts`, `me.get.ts`, `painel.vue`, `base.auth`                                                                                                 |

## Deploy

Push na `main`: `deploy.yml` roda os testes, publica `registry.asolutions.dev/meu-app` e
chama o webhook do Dokploy (workflow reutilizável de `argel-sosa90/workflows`).
Configuração única: checklist de produção no README do nuxt-base.
