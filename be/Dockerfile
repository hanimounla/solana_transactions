# ==========================================
# Builder Stage
# ==========================================
FROM rust:1-slim-bookworm AS builder

WORKDIR /app

# Install build dependencies for OpenSSL and native compilation
RUN apt-get update && apt-get install -y --no-install-recommends \
    pkg-config \
    libssl-dev \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Copy dependency manifests and source code
COPY Cargo.toml Cargo.lock ./
COPY src ./src
COPY migrations ./migrations

# Build the release binary (migrations are embedded at compile time via sqlx::migrate!)
RUN cargo build --release

# ==========================================
# Runtime Stage
# ==========================================
FROM debian:bookworm-slim AS runtime

# Install TLS certificates and runtime OpenSSL libraries
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    libssl3 \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Create non-root user for security best practices (GKE Autopilot)
RUN groupadd -g 10001 appgroup && \
    useradd -u 10001 -g appgroup -s /bin/sh -m appuser

# Copy compiled binary from builder
COPY --from=builder --chown=appuser:appgroup /app/target/release/be /usr/local/bin/be

USER appuser

ENV PORT=8080
ENV RUST_LOG=be=info,tower_http=info
EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:8080/health || exit 1

ENTRYPOINT ["/usr/local/bin/be"]
