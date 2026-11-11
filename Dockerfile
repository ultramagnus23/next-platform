# Public booking sandbox. One long-running Node process, because the demo data lives in memory.
FROM node:22-alpine
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --legacy-peer-deps
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1 \
    PUBLIC_SANDBOX=true \
    BOOKING_DEMO_MODE=true \
    NEXTAUTH_SECRET=sandbox-not-a-secret \
    NEXTAUTH_URL=http://localhost:3000 \
    AUTH_TRUST_HOST=true
RUN npm run build
ENV NODE_ENV=production
EXPOSE 3000
CMD ["sh", "-c", "npx next start -p ${PORT:-3000}"]
