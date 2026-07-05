FROM node:24-alpine

WORKDIR /app
ENV NODE_ENV=development

COPY package.json package-lock.json* ./
COPY apps/web/package.json apps/web/package.json
COPY packages/shared/package.json packages/shared/package.json
COPY services/gateway/package.json services/gateway/package.json
COPY services/trip-service/package.json services/trip-service/package.json
COPY services/seat-service/package.json services/seat-service/package.json
COPY services/booking-service/package.json services/booking-service/package.json
COPY services/ai-service/package.json services/ai-service/package.json
COPY services/mcp-server/package.json services/mcp-server/package.json
COPY workers/analytics-worker/package.json workers/analytics-worker/package.json
COPY workers/ticket-worker/package.json workers/ticket-worker/package.json
COPY workers/email-worker/package.json workers/email-worker/package.json

RUN npm ci

COPY . .

EXPOSE 3000 4000 4010 4020 4050 4100 50051
