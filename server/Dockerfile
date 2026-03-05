# ---- builder ----
FROM eclipse-temurin:25-jdk-jammy AS builder

# Install dependencies for Bazel (JDK already in image)
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
        curl \
        ca-certificates \
        git \
        build-essential \
    && rm -rf /var/lib/apt/lists/*

# Install Bazelisk with architecture detection
RUN ARCH=$(uname -m) && \
    case $ARCH in \
        x86_64) BAZELISK_ARCH="amd64" ;; \
        aarch64|arm64) BAZELISK_ARCH="arm64" ;; \
        *) echo "Unsupported architecture: $ARCH"; exit 1 ;; \
    esac && \
    curl -LO "https://github.com/bazelbuild/bazelisk/releases/download/v1.28.1/bazelisk-linux-${BAZELISK_ARCH}" && \
    chmod +x "bazelisk-linux-${BAZELISK_ARCH}" && \
    mv "bazelisk-linux-${BAZELISK_ARCH}" /usr/local/bin/bazel

# Configure Bazelisk to use a specific Bazel version and batch mode
ENV USE_BAZEL_VERSION=8.5.1
ENV BAZELISK_SKIP_WRAPPER=0

# Create non-root user for Bazel build (required by rules_python)
RUN groupadd -r builder && \
    useradd -r -g builder -m builder && \
    chown -R builder:builder /usr/local/bin/bazel

WORKDIR /build

# Copy Bazel configuration files
COPY --chown=builder:builder MODULE.bazel MODULE.bazel.lock WORKSPACE .bazelrc .bazelversion .bazelignore ./

# Copy server source and BUILD files
COPY --chown=builder:builder server/ ./server/

# Make /build owned by builder so bazel-bin symlinks can be created
RUN chown -R builder:builder /build

# Switch to non-root user for Bazel build
USER builder

# Build with Bazel using CI configuration
# --batch: no persistent server (avoids "couldn't connect to server" in Docker / QEMU emulation)
RUN bazel --batch build //server:delerium_server_deploy --config=ci

# Extract all JARs and create a fat JAR (as root since we need /app directory)
USER root
RUN mkdir -p /app/lib && \
    cd /build && \
    # Use bazel-bin symlink (should exist now since /build is owned by builder)
    if [ -d bazel-bin/server/delerium_server_deploy.runfiles ]; then \
        find bazel-bin/server/delerium_server_deploy.runfiles -name "*.jar" -exec cp {} /app/lib/ \; ; \
    fi && \
    if [ -f bazel-bin/server/delerium_server_lib.jar ]; then \
        cp bazel-bin/server/delerium_server_lib.jar /app/lib/ ; \
    fi && \
    if [ -f bazel-bin/server/delerium_server_lib-resources.jar ]; then \
        cp bazel-bin/server/delerium_server_lib-resources.jar /app/lib/ ; \
    fi && \
    if [ -f bazel-bin/server/delerium_server_deploy.jar ]; then \
        cp bazel-bin/server/delerium_server_deploy.jar /app/lib/ ; \
    fi && \
    echo "io.ktor.server.netty.EngineMain" > /app/mainclass.txt

# ---- runner ----
FROM eclipse-temurin:25-jre-jammy

# OCI metadata labels
LABEL org.opencontainers.image.title="Delirium Paste Server"
LABEL org.opencontainers.image.description="Zero-knowledge encrypted paste service backend"
LABEL org.opencontainers.image.source="https://github.com/marcusb333/delerium-paste"
LABEL org.opencontainers.image.licenses="MIT"
LABEL org.opencontainers.image.base.name="eclipse-temurin:25-jre-jammy"

# Install curl for health checks; upgrade base packages (e.g. glibc) for security
RUN apt-get update && \
    apt-get upgrade -y && \
    apt-get install -y --no-install-recommends curl && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy application from builder
COPY --from=builder /app/ /app/

# Create non-root user and set permissions
RUN groupadd -r delirium && \
    useradd -r -g delirium delirium && \
    chown -R delirium:delirium /app

# Switch to non-root user
USER delirium

EXPOSE 8080

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD curl -f http://localhost:8080/api/health || exit 1

ENTRYPOINT ["sh", "-c", "java -cp '/app/lib/*' io.ktor.server.netty.EngineMain"]
