# Multi-stage Dockerfile for @devilsdev/rag-pipeline-utils
#
# - `runtime` (the default target) is a container for the `rag-pipeline`
#   CLI: `docker run --rm -v "$PWD:/work" -w /work <image> query "..."`.
#   The package is a library plus a CLI; it has no HTTP server to deploy.
#   For a deployable service see examples/fastify-rag-demo (its own
#   Dockerfile) and deployment/README.md.
# - `development` is used by docker-compose.yml.
#
# No image is published; build it yourself:
#   docker build -t rag-pipeline-cli --build-arg VERSION=3.0.2 .

# ================================
# Stage 1: Base Dependencies
# ================================
FROM node:22-alpine AS base

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

# Fail the build on critical vulnerabilities in the runtime dependency tree.
# Only production dependencies are audited because dev dependencies are
# pruned below and never ship in the runtime image. (The npm script
# security:audit:critical swallows failures, so it is not used here.)
RUN npm audit --omit=dev --audit-level=critical

# Lint and tests run in CI on every commit. They can't run here:
# .dockerignore leaves out __tests__/ and the .gitignore that `npm run lint`
# reads.

# Remove dev dependencies and clean up
RUN npm prune --omit=dev && \
    npm cache clean --force

# ================================
# Stage 4: Development (docker-compose.yml)
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

# Port for `rag-pipeline serve --host 0.0.0.0` while developing.
# The debugger port (9229) is not exposed; see docker-compose.yml.
EXPOSE 3000

# Development entrypoint
ENTRYPOINT ["/usr/bin/dumb-init", "--"]
CMD ["npm", "run", "dev"]

# ================================
# Stage 5: Runtime, the CLI image (last stage, so the default target)
# ================================
FROM base AS runtime

ARG VERSION=3.0.2

ENV NODE_ENV=production

# Copy built application from build stage
COPY --from=build --chown=ragpipeline:nodejs /app/node_modules ./node_modules
COPY --from=build --chown=ragpipeline:nodejs /app/package*.json ./
COPY --from=build --chown=ragpipeline:nodejs /app/bin ./bin
COPY --from=build --chown=ragpipeline:nodejs /app/src ./src
COPY --from=build --chown=ragpipeline:nodejs /app/.ragrc.schema.json ./

# Mount your project at /work: the CLI reads .ragrc.json and writes its
# index relative to the working directory.
RUN mkdir -p /work && chown ragpipeline:nodejs /work
WORKDIR /work

# Switch to non-root user
USER ragpipeline

LABEL org.opencontainers.image.title="rag-pipeline CLI" \
      org.opencontainers.image.description="The rag-pipeline command line of @devilsdev/rag-pipeline-utils" \
      org.opencontainers.image.version="${VERSION}" \
      org.opencontainers.image.url="https://github.com/DevilsDev/rag-pipeline-utils" \
      org.opencontainers.image.source="https://github.com/DevilsDev/rag-pipeline-utils" \
      org.opencontainers.image.licenses="MIT"

# dumb-init forwards signals; arguments after the image name go to the CLI.
ENTRYPOINT ["/usr/bin/dumb-init", "--", "node", "/app/bin/cli.js"]
CMD ["--help"]
