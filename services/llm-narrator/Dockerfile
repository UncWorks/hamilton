# syntax=docker/dockerfile:1.6

FROM node:20-slim AS builder
WORKDIR /app

RUN corepack enable

COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY packages/contracts/package.json ./packages/contracts/
COPY services/llm-narrator/package.json ./services/llm-narrator/
RUN pnpm install --frozen-lockfile --filter @hamilton/llm-narrator...

COPY packages/contracts ./packages/contracts
COPY services/llm-narrator ./services/llm-narrator
RUN pnpm --filter @hamilton/contracts build
RUN pnpm --filter @hamilton/llm-narrator build

FROM node:20-slim
WORKDIR /app
COPY --from=builder /app /app
ENTRYPOINT ["node", "services/llm-narrator/dist/index.js"]
