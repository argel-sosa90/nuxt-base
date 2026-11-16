# Imagem de produção: a mesma no Dokploy e no `docker compose --profile app up`.

FROM node:24-alpine AS base
WORKDIR /app

# --- dependências (inclui as de desenvolvimento, necessárias para compilar) ---
# `--ignore-scripts`: o `nuxt prepare` do postinstall é redundante com o build.
FROM base AS deps
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts --no-audit --no-fund

# --- build ---
FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NODE_ENV=production
# Versão dos eventos do GlitchTip (`<projeto>@<APP_RELEASE>`): o SHA curto do
# commit, passado pelo workflow reutilizável. O contexto do build não leva o
# `.git`. Sem o argumento, o Nuxt usa um id aleatório.
ARG APP_RELEASE=
RUN npm run build

# --- runtime ---
FROM base AS runtime
# TZ: tudo que decide "hoje" pelo relógio do servidor (vencimentos, avisos)
# erraria das 21h à meia-noite em UTC. A Alpine só resolve o fuso com tzdata.
ENV NODE_ENV=production \
    PORT=3000 \
    HOST=0.0.0.0 \
    TZ=America/Sao_Paulo
RUN apk add --no-cache tzdata

# O .output do Nitro já traz as dependências: nenhum `npm install` aqui.
COPY --from=build /app/.output ./.output
# Lidas do disco na subida (server/plugins/database.ts).
COPY --from=build /app/server/database/migrations ./server/database/migrations

USER node
EXPOSE 3000

# O Dokploy só troca o tráfego para a versão nova quando isto passa; o
# /api/health só responde depois das migrations e confere o banco.
HEALTHCHECK --interval=15s --timeout=5s --start-period=40s --retries=5 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", ".output/server/index.mjs"]
