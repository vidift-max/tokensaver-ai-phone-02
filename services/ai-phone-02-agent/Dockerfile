FROM node:22-bookworm-slim
WORKDIR /app
COPY services/ai-phone-02-agent/package.json ./
RUN npm install --omit=dev
COPY services/ai-phone-02-agent/server.mjs ./
USER node
ENV PORT=8090
EXPOSE 8090
CMD ["node","server.mjs"]
