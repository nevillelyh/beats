FROM oven/bun:alpine@sha256:4de475389889577f346c636f956b42a5c31501b654664e9ae5726f94d7bb5349

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV DB_PATH=/data/beats.sqlite

COPY package.json tsconfig.json ./
COPY src ./src
COPY scripts ./scripts
COPY PLAN.md ./PLAN.md

RUN mkdir -p /data

EXPOSE 3000

CMD ["bun", "run", "src/server.ts"]
