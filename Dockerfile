FROM oven/bun:alpine@sha256:da816670775f4c2b4e990b6b1847cf5540dcdc721a42033dd331ce7a88ba6a3b

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV DATABASE_URL=""

COPY package.json bun.lock tsconfig.json ./
RUN bun install --frozen-lockfile --production
COPY src ./src
COPY PLAN.md ./PLAN.md

EXPOSE 3000

CMD ["bun", "run", "src/server.ts"]
