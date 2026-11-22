FROM node:22-alpine AS client
WORKDIR /app/client
COPY client/package*.json ./
RUN npm ci
COPY client/ ./
RUN npm run build

FROM node:22-alpine
RUN apk add --no-cache postgresql16-client
WORKDIR /app/server
COPY server/package*.json ./
RUN npm ci --omit=dev
COPY server/ ./
COPY --from=client /app/client/dist /app/client/dist
ENV NODE_ENV=production PORT=4000
EXPOSE 4000
CMD ["sh", "-c", "npx knex migrate:latest && node scripts/bootstrap.js && node src/index.js"]
