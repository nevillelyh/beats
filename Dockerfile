FROM oven/bun:alpine@sha256:26d8996560ca94eab9ce48afc0c7443825553c9a851f40ae574d47d20906826d

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
