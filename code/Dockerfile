# syntax=docker/dockerfile:1
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY client/package.json ./client/package.json
COPY server/package.json ./server/package.json
RUN npm ci
COPY client ./client
COPY server ./server
RUN npm run build

# glibc is required by the nvidia-smi binary injected by NVIDIA Container Toolkit.
FROM node:22-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
COPY server/package.json ./server/package.json
RUN npm ci --omit=dev --workspace=server
COPY --from=build /app/server/dist ./dist
COPY --from=build /app/client/dist ./public
USER node
EXPOSE 7777
CMD ["node", "dist/index.js"]
