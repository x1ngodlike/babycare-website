FROM node:22-bookworm-slim AS build
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*
COPY package*.json ./
# npm ci：国内网络走 npmmirror 镜像（含 sharp/esbuild 二进制与 node-gyp 头文件），
# 用 BuildKit 缓存卷复用下载缓存（第二次构建秒级），并跳过 audit/fund 网络请求。
# 注意：disturl 是 node-gyp 配置项，须写入 .npmrc 而非 npm config set。
# npm ci 会下载 Biome 全部平台包（构建只用 linux-x64），属一次性浪费。
RUN --mount=type=cache,target=/root/.npm \
    npm config set registry https://registry.npmmirror.com \
    && printf '\ndisturl=https://npmmirror.com/mirrors/node\n' >> /root/.npmrc \
    && npm ci --no-audit --no-fund
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
