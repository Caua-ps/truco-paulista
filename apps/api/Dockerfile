# API — build no contexto da raiz do monorepo:
#   docker build -f apps/api/Dockerfile .
FROM node:22-alpine AS build
WORKDIR /repo
COPY package.json package-lock.json ./
COPY packages/game-core/package.json packages/game-core/
COPY apps/api/package.json apps/api/
RUN npm ci
COPY tsconfig.base.json ./
COPY packages/game-core packages/game-core
COPY apps/api apps/api
RUN npm run build --workspace=packages/game-core \
 && npm run prisma:generate --workspace=apps/api \
 && npm run build --workspace=apps/api \
 && npm prune --omit=dev

FROM node:22-alpine
ENV NODE_ENV=production
WORKDIR /repo
COPY --from=build /repo/node_modules node_modules
COPY --from=build /repo/packages/game-core/dist packages/game-core/dist
COPY --from=build /repo/packages/game-core/package.json packages/game-core/
COPY --from=build /repo/apps/api/dist apps/api/dist
COPY --from=build /repo/apps/api/package.json apps/api/
COPY --from=build /repo/apps/api/prisma apps/api/prisma
EXPOSE 3001
# Aplica migrações pendentes e sobe a API.
CMD ["sh", "-c", "npx prisma migrate deploy --schema apps/api/prisma/schema.prisma && node apps/api/dist/main.js"]
