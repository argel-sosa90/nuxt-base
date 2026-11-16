# Meu App

Criado a partir do [nuxt-base](https://github.com/argel-sosa90/nuxt-base). Login,
GlitchTip, `/api/health`, cabeçalhos de segurança e conferência de origem vêm do
layer `@asolutions/nuxt-base`; a documentação deles está no README de lá.

## Desenvolvimento

```bash
cp .env.example .env
docker compose up -d db db-test
npm install
npm run dev
```

Login local: suba o Zitadel do `zitadel-dokploy` (`http://localhost:8088`), cadastre
o app com redirect `http://localhost:3000/auth/callback` e preencha `OIDC_*` no
`.env`. Usuários de teste: `ana.teste@example.com` e `bruno.teste@example.com`.

| Comando                                                 |                                                   |
| ------------------------------------------------------- | ------------------------------------------------- |
| `npm test`                                              | Testes (banco `db-test`)                          |
| `npm run lint` / `npm run typecheck` / `npm run format` |                                                   |
| `npm run db:generate`                                   | Migration a partir de `server/database/schema.ts` |
| `docker compose --profile app up --build`               | O app com a imagem de produção                    |

As migrations rodam na subida do servidor; `RUN_MIGRATIONS=false` desliga.

## Estrutura

| Caminho                          |                                                                           |
| -------------------------------- | ------------------------------------------------------------------------- |
| `app/app.config.ts`              | `base.project` (slug no GlitchTip), caminhos com token, destinos do login |
| `server/database/schema.ts`      | Tabelas. `users` é o perfil local, ligado ao IdP pelo `sub`               |
| `server/plugins/auth-profile.ts` | No login, cria/atualiza o perfil e põe o id local na sessão               |
| `server/plugins/database.ts`     | Migrations na subida e verificação de saúde do banco                      |
| `server/api/me.get.ts`           | Modelo de rota protegida (`requireAuthUser`)                              |
| `app/pages/painel.vue`           | Modelo de página protegida (`middleware: 'auth'`)                         |

## Deploy

Push na `main`: `deploy.yml` roda os testes, publica
`registry.asolutions.dev/meu-app` e chama o webhook do Dokploy (workflow reutilizável
de `argel-sosa90/workflows`). Configuração única: checklist de produção no README do
nuxt-base.
