FROM node:22-bookworm-slim AS build
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build \
  && test -f /app/dist/index.html \
  && npm prune --omit=dev

FROM node:22-bookworm-slim AS runtime
ENV NODE_ENV=production PORT=3000 DATABASE_PATH=/data/baby-care.db DATA_DIR=/data
WORKDIR /app
COPY --from=build /app/package*.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/dist-server ./dist-server
RUN test -f /app/dist/index.html \
  && mkdir -p /data/uploads/avatars \
  && chown -R node:node /data /app
USER node
EXPOSE 3000
VOLUME ["/data"]
CMD ["node", "dist-server/server/index.js"]
