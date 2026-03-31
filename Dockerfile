FROM node:20-slim AS builder

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .
RUN npm run build

# ─── Runner ───────────────────────────────────────────────────
FROM node:20-slim AS runner

WORKDIR /app

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY scripts ./scripts
COPY misc ./misc

EXPOSE 4321

CMD ["sh", "-c", "node scripts/seed.js && node ./dist/server/entry.mjs"]
