# Version: 0.1.0
# Path: /Dockerfile
# Description: Minimal Docker image for rag-pipeline CLI
# Author: Ali Kahwaji

FROM node:18-slim

# Create app directory
WORKDIR /app

# Copy package files and install deps
COPY package*.json ./
RUN npm ci --omit=dev

# Copy application source
COPY . .

# Set default entrypoint
ENTRYPOINT ["node", "./bin/cli.js"]

# Default help
CMD ["--help"]
