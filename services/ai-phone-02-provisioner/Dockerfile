FROM node:22-bookworm-slim
WORKDIR /app
COPY services/ai-phone-02-provisioner/package.json ./package.json
RUN npm install --omit=dev
COPY services/ai-phone-02-provisioner/provision.mjs ./provision.mjs
USER node
EXPOSE 10000
CMD ["node","provision.mjs"]
