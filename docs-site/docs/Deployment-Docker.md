---
sidebar_position: 17
---

# Docker Deployment Guide

Deploy RAG Pipeline Utils in production using Docker containers with optimized configurations, security best practices, and scalability patterns.

## Overview

This guide covers:

- Production-ready Dockerfile
- Docker Compose multi-service setup
- Container optimization techniques
- Environment configuration
- Security hardening
- Monitoring and logging

## Prerequisites

- Docker Engine 20.10+
- Docker Compose 2.0+
- Basic understanding of containerization
- Production environment setup

## Quick Start

### Single Container Deployment

Create a production Dockerfile:

```dockerfile
# Production Dockerfile for RAG Pipeline Utils
FROM node:20-alpine AS base

# Install security updates
RUN apk update && apk upgrade && \
    apk add --no-cache dumb-init

# Create app user (non-root)
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install production dependencies only
RUN npm ci --only=production && \
    npm cache clean --force

# Copy application code
COPY --chown=nodejs:nodejs . .

# Switch to non-root user
USER nodejs

# Expose application port
EXPOSE 3000

# Use dumb-init to handle signals properly
ENTRYPOINT ["dumb-init", "--"]

# Start application
CMD ["node", "src/index.js"]
```

**Build and run:**

```bash
# Build image
docker build -t rag-pipeline-utils:latest .

# Run container
docker run -d \
  --name rag-app \
  -p 3000:3000 \
  -e NODE_ENV=production \
  -e OPENAI_API_KEY=your_key \
  -e PINECONE_API_KEY=your_key \
  rag-pipeline-utils:latest
```

## Multi-Stage Build (Optimized)

Reduce image size and improve security with multi-stage builds:

```dockerfile
# Multi-stage Dockerfile for production optimization
FROM node:20-alpine AS builder

WORKDIR /app

# Install build dependencies
COPY package*.json ./
RUN npm ci

# Copy source and build
COPY . .
RUN npm run build && \
    npm prune --production

# Production stage
FROM node:20-alpine AS production

# Security: Install latest patches
RUN apk update && apk upgrade && \
    apk add --no-cache dumb-init ca-certificates && \
    rm -rf /var/cache/apk/*

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

WORKDIR /app

# Copy production dependencies and built artifacts
COPY --from=builder --chown=nodejs:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=nodejs:nodejs /app/dist ./dist
COPY --from=builder --chown=nodejs:nodejs /app/package*.json ./

# Security: Remove unnecessary files
RUN find . -name "*.md" -type f -delete && \
    find . -name "*.txt" -type f -delete

# Switch to non-root user
USER nodejs

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=40s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

EXPOSE 3000

ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "dist/index.js"]
```

**Build optimized image:**

```bash
docker build -t rag-pipeline-utils:2.3.1 -f Dockerfile.production .
```

## Docker Compose Setup

### Basic Configuration

```yaml
# docker-compose.yml
version: "3.8"

services:
  rag-app:
    build:
      context: .
      dockerfile: Dockerfile.production
    image: rag-pipeline-utils:2.3.1
    container_name: rag-pipeline-app
    restart: unless-stopped
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=production
      - LOG_LEVEL=info
      - OPENAI_API_KEY=${OPENAI_API_KEY}
      - PINECONE_API_KEY=${PINECONE_API_KEY}
    volumes:
      - ./data:/app/data
      - ./logs:/app/logs
    networks:
      - rag-network
    healthcheck:
      test:
        [
          "CMD",
          "node",
          "-e",
          "require('http').get('http://localhost:3000/health')",
        ]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s

networks:
  rag-network:
    driver: bridge
```

**Run with Docker Compose:**

```bash
# Start services
docker-compose up -d

# View logs
docker-compose logs -f rag-app

# Stop services
docker-compose down
```

### Production Stack with Vector Database

Complete stack with Pinecone alternative (Qdrant) and Redis cache:

```yaml
# docker-compose.production.yml
version: "3.8"

services:
  rag-app:
    build:
      context: .
      dockerfile: Dockerfile.production
    image: rag-pipeline-utils:2.3.1
    container_name: rag-app
    restart: unless-stopped
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=production
      - LOG_LEVEL=info
      - OPENAI_API_KEY=${OPENAI_API_KEY}
      - VECTOR_DB_URL=http://qdrant:6333
      - REDIS_URL=redis://redis:6379
      - JWT_SECRET=${JWT_SECRET}
    volumes:
      - ./data:/app/data:ro
      - ./logs:/app/logs
    networks:
      - rag-network
    depends_on:
      qdrant:
        condition: service_healthy
      redis:
        condition: service_healthy
    deploy:
      resources:
        limits:
          cpus: "2"
          memory: 4G
        reservations:
          cpus: "1"
          memory: 2G

  qdrant:
    image: qdrant/qdrant:v1.7.4
    container_name: rag-qdrant
    restart: unless-stopped
    ports:
      - "6333:6333"
      - "6334:6334"
    volumes:
      - qdrant-data:/qdrant/storage
    networks:
      - rag-network
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:6333/health"]
      interval: 30s
      timeout: 10s
      retries: 3

  redis:
    image: redis:7-alpine
    container_name: rag-redis
    restart: unless-stopped
    ports:
      - "6379:6379"
    volumes:
      - redis-data:/data
    networks:
      - rag-network
    command: redis-server --appendonly yes --requirepass ${REDIS_PASSWORD}
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 5s
      retries: 5

  prometheus:
    image: prom/prometheus:latest
    container_name: rag-prometheus
    restart: unless-stopped
    ports:
      - "9090:9090"
    volumes:
      - ./monitoring/prometheus.yml:/etc/prometheus/prometheus.yml:ro
      - prometheus-data:/prometheus
    networks:
      - rag-network
    command:
      - "--config.file=/etc/prometheus/prometheus.yml"
      - "--storage.tsdb.path=/prometheus"

  grafana:
    image: grafana/grafana:latest
    container_name: rag-grafana
    restart: unless-stopped
    ports:
      - "3001:3000"
    environment:
      - GF_SECURITY_ADMIN_PASSWORD=${GRAFANA_PASSWORD}
      - GF_INSTALL_PLUGINS=redis-datasource
    volumes:
      - grafana-data:/var/lib/grafana
      - ./monitoring/grafana-dashboards:/etc/grafana/provisioning/dashboards:ro
    networks:
      - rag-network
    depends_on:
      - prometheus

volumes:
  qdrant-data:
  redis-data:
  prometheus-data:
  grafana-data:

networks:
  rag-network:
    driver: bridge
```

## Environment Configuration

### Environment Variables

Create `.env` file for configuration:

```bash
# .env
NODE_ENV=production
LOG_LEVEL=info
PORT=3000

# API Keys
OPENAI_API_KEY=sk-...
PINECONE_API_KEY=...
COHERE_API_KEY=...

# Database
VECTOR_DB_URL=http://qdrant:6333
REDIS_URL=redis://redis:6379
REDIS_PASSWORD=strong_password_here

# Security
JWT_SECRET=your_jwt_secret_here
JWT_EXPIRES_IN=1h

# Performance
MAX_CONCURRENT_REQUESTS=100
REQUEST_TIMEOUT=30000
EMBEDDING_BATCH_SIZE=100

# Monitoring
ENABLE_METRICS=true
METRICS_PORT=9090
```

### Secrets Management

Use Docker secrets for sensitive data:

```yaml
# docker-compose.secrets.yml
version: "3.8"

services:
  rag-app:
    image: rag-pipeline-utils:2.3.1
    secrets:
      - openai_api_key
      - jwt_secret
    environment:
      - OPENAI_API_KEY_FILE=/run/secrets/openai_api_key
      - JWT_SECRET_FILE=/run/secrets/jwt_secret

secrets:
  openai_api_key:
    file: ./secrets/openai_api_key.txt
  jwt_secret:
    file: ./secrets/jwt_secret.txt
```

## Container Optimization

### Memory Limits

```yaml
services:
  rag-app:
    deploy:
      resources:
        limits:
          cpus: "2.0"
          memory: 4G
        reservations:
          cpus: "1.0"
          memory: 2G
```

### Node.js Optimization

```dockerfile
# Optimize Node.js for production
ENV NODE_ENV=production \
    NODE_OPTIONS="--max-old-space-size=3072 --max-http-header-size=16384"
```

### Layer Caching

```dockerfile
# Optimize build time with layer caching
COPY package*.json ./
RUN npm ci --only=production

# Copy source last (changes frequently)
COPY . .
```

## Security Best Practices

### 1. Non-Root User

```dockerfile
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001
USER nodejs
```

### 2. Read-Only Root Filesystem

```yaml
services:
  rag-app:
    read_only: true
    tmpfs:
      - /tmp
      - /app/logs
```

### 3. Drop Capabilities

```yaml
services:
  rag-app:
    cap_drop:
      - ALL
    cap_add:
      - NET_BIND_SERVICE
```

### 4. Security Scanning

```bash
# Scan image for vulnerabilities
docker scan rag-pipeline-utils:2.3.1

# Use Trivy for comprehensive scanning
trivy image rag-pipeline-utils:2.3.1
```

## Monitoring and Logging

### Application Logs

```yaml
services:
  rag-app:
    logging:
      driver: "json-file"
      options:
        max-size: "10m"
        max-file: "3"
        labels: "production"
```

### Health Checks

```dockerfile
HEALTHCHECK --interval=30s --timeout=3s --start-period=40s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"
```

### Metrics Collection

```yaml
# Prometheus configuration
# monitoring/prometheus.yml
global:
  scrape_interval: 15s

scrape_configs:
  - job_name: "rag-pipeline"
    static_configs:
      - targets: ["rag-app:9090"]
```

## Production Deployment

### 1. Build Image

```bash
# Build production image
docker build \
  -t rag-pipeline-utils:2.3.1 \
  -f Dockerfile.production \
  --build-arg NODE_ENV=production \
  .

# Tag for registry
docker tag rag-pipeline-utils:2.3.1 your-registry.com/rag-pipeline-utils:2.3.1
```

### 2. Push to Registry

```bash
# Push to Docker Hub
docker push your-registry.com/rag-pipeline-utils:2.3.1

# Or use private registry
docker login your-registry.com
docker push your-registry.com/rag-pipeline-utils:2.3.1
```

### 3. Deploy to Production

```bash
# Pull latest image
docker-compose pull

# Deploy with zero-downtime
docker-compose up -d --no-deps --build rag-app

# Verify deployment
docker-compose ps
docker-compose logs -f rag-app
```

## Scaling Strategies

### Horizontal Scaling

```bash
# Scale application instances
docker-compose up -d --scale rag-app=3
```

### Load Balancing

```yaml
# Add nginx load balancer
services:
  nginx:
    image: nginx:alpine
    ports:
      - "80:80"
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf:ro
    depends_on:
      - rag-app
```

## Troubleshooting

### Common Issues

**Container won't start:**

```bash
# Check logs
docker-compose logs rag-app

# Inspect container
docker inspect rag-app

# Check resource usage
docker stats rag-app
```

**Out of memory:**

```yaml
# Increase memory limits
deploy:
  resources:
    limits:
      memory: 8G
```

**Network issues:**

```bash
# Test connectivity
docker exec rag-app ping qdrant

# Check network
docker network inspect rag-network
```

## Best Practices Checklist

- [ ] Use multi-stage builds for smaller images
- [ ] Run as non-root user
- [ ] Implement health checks
- [ ] Set resource limits
- [ ] Use environment variables for configuration
- [ ] Enable logging with rotation
- [ ] Scan images for vulnerabilities
- [ ] Use secrets management
- [ ] Implement monitoring
- [ ] Test deployment locally before production

## Next Steps

- [Kubernetes Deployment](/docs/Deployment-Kubernetes) - Deploy on Kubernetes
- [AWS Deployment](/docs/Deployment-AWS) - Deploy on AWS ECS/EKS
- [Monitoring Guide](/docs/Observability) - Set up comprehensive monitoring
- [Security Best Practices](/docs/Security) - Harden your deployment

## Additional Resources

- [Docker Best Practices](https://docs.docker.com/develop/dev-best-practices/)
- [Node.js Docker Guide](https://nodejs.org/en/docs/guides/nodejs-docker-webapp/)
- [Docker Security](https://docs.docker.com/engine/security/)
- [Docker Compose Reference](https://docs.docker.com/compose/compose-file/)
