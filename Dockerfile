# Multi-stage Dockerfile for @DevilsDev/rag-pipeline-utils
# Production-ready container with security hardening and optimization
# Version: 2.0.0
# Author: Ali Kahwaji

# ================================
# Stage 1: Base Dependencies
# ================================
FROM node:20-alpine AS base

# Install security updates and required packages
RUN apk update && apk upgrade && \
    apk add --no-cache \
    dumb-init \
    curl \
    ca-certificates && \
    rm -rf /var/cache/apk/*

# Create non-root user for security
RUN addgroup -g 1001 -S nodejs && \
    adduser -S ragpipeline -u 1001 -G nodejs

# Set working directory
WORKDIR /app

# ================================
# Stage 2: Dependencies
# ================================
FROM base AS deps

# Copy package files
COPY package*.json ./
COPY .npmrc* ./

# Install all dependencies (including dev for build)
RUN npm ci --include=dev --frozen-lockfile && \
    npm cache clean --force

# ================================
# Stage 3: Build
# ================================
FROM deps AS build

# Copy source code
COPY . .

# Run security audit and tests
RUN npm run security:audit:critical || true
RUN npm run lint
RUN npm test -- --passWithNoTests

# Build documentation if needed
RUN npm run build:docs || true

# Remove dev dependencies and clean up
RUN npm prune --omit=dev && \
    npm cache clean --force

# ================================
# Stage 4: Production Runtime
# ================================
FROM base AS runtime

# Set environment variables
ENV NODE_ENV=production
ENV RAG_PIPELINE_ENV=production
ENV RAG_LOG_LEVEL=info
ENV RAG_ENABLE_METRICS=true
ENV RAG_HEALTH_CHECK_PORT=3001

# Copy built application from build stage
COPY --from=build --chown=ragpipeline:nodejs /app/node_modules ./node_modules
COPY --from=build --chown=ragpipeline:nodejs /app/package*.json ./
COPY --from=build --chown=ragpipeline:nodejs /app/bin ./bin
COPY --from=build --chown=ragpipeline:nodejs /app/src ./src
COPY --from=build --chown=ragpipeline:nodejs /app/.ragrc.schema.json ./
COPY --from=build --chown=ragpipeline:nodejs /app/examples ./examples
# Copy documentation if it exists (optional)
RUN mkdir -p ./docs

# Create necessary directories
RUN mkdir -p /app/logs /app/data /app/tmp && \
    chown -R ragpipeline:nodejs /app

# Switch to non-root user
USER ragpipeline

# Expose health check port
EXPOSE 3001

# Add health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:3001/health || exit 1

# Set entrypoint with dumb-init for proper signal handling
ENTRYPOINT ["/usr/bin/dumb-init", "--"]

# Default command
CMD ["node", "./bin/cli.js", "--help"]

# ================================
# Stage 5: Development
# ================================
FROM deps AS development

# Copy source code
COPY . .

# Install development tools
RUN npm install -g nodemon

# Set development environment
ENV NODE_ENV=development
ENV RAG_PIPELINE_ENV=development
ENV RAG_LOG_LEVEL=debug

# Switch to non-root user
USER ragpipeline

# Expose development ports
EXPOSE 3000 3001 9229

# Development entrypoint
ENTRYPOINT ["/usr/bin/dumb-init", "--"]
CMD ["npm", "run", "dev"]

# ================================
# Labels for metadata
# ================================
LABEL org.opencontainers.image.title="RAG Pipeline Utils"
LABEL org.opencontainers.image.description="Enterprise-grade RAG pipeline toolkit for Node.js"
LABEL org.opencontainers.image.version="2.1.7"
LABEL org.opencontainers.image.authors="Ali Kahwaji <ali@devilsdev.com>"
LABEL org.opencontainers.image.url="https://github.com/DevilsDev/rag-pipeline-utils"
LABEL org.opencontainers.image.source="https://github.com/DevilsDev/rag-pipeline-utils"
LABEL org.opencontainers.image.licenses="Apache-2.0"
