FROM node:22-bookworm-slim
WORKDIR /app
COPY services/ai-phone-02-worker/package.json ./
COPY scripts ./scripts
COPY services/ai-phone-02-worker/worker.mjs ./
USER node
CMD ["node","worker.mjs"]
