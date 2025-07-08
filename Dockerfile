# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install all dependencies (including dev dependencies for build)
RUN npm ci

# Copy source code
COPY . .

# Build the application
RUN npm run build

# Production stage
FROM node:20-alpine AS production

WORKDIR /app

# Install dumb-init and curl for proper signal handling and health checks
RUN apk add --no-cache dumb-init curl ca-certificates

# Download and install AWS RDS CA certificates
RUN curl -o /tmp/global-bundle.pem https://truststore.pki.rds.amazonaws.com/global/global-bundle.pem && \
    curl -o /tmp/ap-northeast-2-bundle.pem https://truststore.pki.rds.amazonaws.com/ap-northeast-2/ap-northeast-2-bundle.pem && \
    mkdir -p /app/certs && \
    cp /tmp/global-bundle.pem /app/certs/ && \
    cp /tmp/ap-northeast-2-bundle.pem /app/certs/ && \
    # 시스템 CA 스토어에도 추가
    cat /tmp/global-bundle.pem >> /etc/ssl/certs/ca-certificates.crt && \
    cat /tmp/ap-northeast-2-bundle.pem >> /etc/ssl/certs/ca-certificates.crt && \
    rm /tmp/*.pem

# Create non-root user
RUN addgroup -g 1001 -S nodejs
RUN adduser -S nestjs -u 1001

# Copy package files
COPY package*.json ./

# Install only production dependencies
RUN npm ci --only=production && npm cache clean --force

# Copy built application from builder stage
COPY --from=builder --chown=nestjs:nodejs /app/dist ./dist

# Make sure the certificates are readable by the nestjs user
RUN chown -R nestjs:nodejs /app/certs

# Switch to non-root user
USER nestjs

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:3000/health || exit 1

# Start the application
ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "dist/main"]
