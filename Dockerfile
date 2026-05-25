FROM oven/bun:alpine@sha256:5acc90a93e91ff07bf72aa90a7c9f0fa189765aec90b47bdbf2152d2196383c0

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV DATABASE_URL=""

COPY package.json tsconfig.json ./
COPY src ./src
COPY scripts ./scripts
COPY PLAN.md ./PLAN.md

EXPOSE 3000

CMD ["bun", "run", "src/server.ts"]
