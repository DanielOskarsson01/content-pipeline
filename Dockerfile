# Content Pipeline - Production Dockerfile
# Build: docker build -t content-pipeline .
# Run: docker run -p 3000:3000 --env-file .env content-pipeline

FROM node:20-alpine AS base

# Install dependencies for native modules
RUN apk add --no-cache libc6-compat

WORKDIR /app

# Install dependencies
FROM base AS deps
COPY package.json package-lock.json ./
RUN npm ci --only=production

# Production image
FROM base AS runner

WORKDIR /app

# Create non-root user for security
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 pipeline

# Copy dependencies
COPY --from=deps /app/node_modules ./node_modules

# Copy application code
COPY server.js ./
COPY routes ./routes
COPY services ./services
COPY workers ./workers
COPY modules ./modules
COPY middleware ./middleware
COPY utils ./utils
COPY public ./public

# Set ownership
RUN chown -R pipeline:nodejs /app

USER pipeline

# Environment
ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/health || exit 1

CMD ["node", "server.js"]
