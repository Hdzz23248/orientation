# syntax=docker/dockerfile:1

# ---------- 构建阶段：安装依赖并产出前端静态产物 ----------
FROM node:22-slim AS build
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

# ---------- 运行阶段：Express 同时托管 /api 与前端 dist ----------
FROM node:22-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app

# 仅安装运行 server 所需的生产依赖（express、dotenv）
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

# 复制构建产物与头像服务
COPY --from=build /app/server ./server
COPY --from=build /app/dist ./dist

USER node
EXPOSE 3001

CMD ["node", "server/index.js"]
