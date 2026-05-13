# Glama-compatible Dockerfile for livostyle-catalog-mcp
# Multi-stage build for minimal image size
FROM node:22-alpine AS builder
WORKDIR /app
COPY package*.json tsconfig.json ./
COPY src/ ./src/
RUN npm ci --quiet && npm run build

FROM node:22-alpine
WORKDIR /app
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package.json ./
COPY --from=builder /app/node_modules ./node_modules
# Healthcheck: just check binary works (sends initialize, expects response)
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"healthcheck","version":"1"}}}' \
    | timeout 8 node /app/dist/index.js > /dev/null 2>&1 || exit 1
ENTRYPOINT ["node", "/app/dist/index.js"]
