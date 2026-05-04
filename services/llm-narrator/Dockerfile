# syntax=docker/dockerfile:1.6

FROM node:20-slim AS builder
WORKDIR /app

RUN corepack enable

COPY pnpm-workspace.yaml package.json ./
COPY packages/contracts ./packages/contracts
COPY services/llm-narrator ./services/llm-narrator

RUN pnpm install --frozen-lockfile=false
RUN pnpm --filter @hamilton/contracts build
RUN pnpm --filter @hamilton/llm-narrator build

FROM node:20-slim
WORKDIR /app
COPY --from=builder /app /app
ENTRYPOINT ["node", "services/llm-narrator/dist/index.js"]
