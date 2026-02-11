FROM oven/bun:alpine

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV DB_PATH=/data/rpms.sqlite

COPY package.json tsconfig.json ./
COPY src ./src
COPY scripts ./scripts
COPY PLAN.md ./PLAN.md

RUN mkdir -p /data

EXPOSE 3000

CMD ["bun", "run", "src/server.ts"]
