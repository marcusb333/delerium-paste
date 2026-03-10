# ---- Stage 1: Build client ----
FROM node:20-alpine AS client-builder
WORKDIR /build
COPY client/package*.json ./
RUN npm ci --ignore-scripts
COPY client/ ./
RUN npm run build

# ---- Stage 2: Build server ----
FROM eclipse-temurin:25.0.2_10-jre-jammy AS server-builder

RUN apt-get update && \
    apt-get install -y --no-install-recommends \
        curl ca-certificates git build-essential \
    && rm -rf /var/lib/apt/lists/*

RUN ARCH=$(uname -m) && \
    case $ARCH in \
        x86_64) BAZELISK_ARCH="amd64" ;; \
        aarch64|arm64) BAZELISK_ARCH="arm64" ;; \
        *) echo "Unsupported architecture: $ARCH"; exit 1 ;; \
    esac && \
    curl -LO "https://github.com/bazelbuild/bazelisk/releases/download/v1.28.1/bazelisk-linux-${BAZELISK_ARCH}" && \
    chmod +x "bazelisk-linux-${BAZELISK_ARCH}" && \
    mv "bazelisk-linux-${BAZELISK_ARCH}" /usr/local/bin/bazel

ENV USE_BAZEL_VERSION=8.5.1
ENV BAZELISK_SKIP_WRAPPER=0

RUN groupadd -r builder && \
    useradd -r -g builder -m builder && \
    chown -R builder:builder /usr/local/bin/bazel

WORKDIR /build

COPY --chown=builder:builder MODULE.bazel MODULE.bazel.lock WORKSPACE .bazelrc .bazelversion .bazelignore ./
COPY --chown=builder:builder server/ ./server/

RUN chown -R builder:builder /build

USER builder
RUN bazel --batch build //server:delerium_server_deploy --config=ci

USER root
RUN mkdir -p /app/lib && \
    cd /build && \
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
    fi

# ---- Stage 3: Runtime ----
FROM eclipse-temurin:25-jre-jammy

LABEL org.opencontainers.image.title="Delirium Paste"
LABEL org.opencontainers.image.description="Zero-knowledge encrypted paste service"
LABEL org.opencontainers.image.source="https://github.com/marcusb333/delerium-paste"
LABEL org.opencontainers.image.licenses="MIT"
LABEL org.opencontainers.image.base.name="eclipse-temurin:25-jre-jammy"

RUN apt-get update && \
    apt-get upgrade -y && \
    apt-get install -y --no-install-recommends curl && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy server JARs
COPY --from=server-builder /app/ /app/

# Copy compiled client assets
COPY --from=client-builder /build/index.html   /app/static/
COPY --from=client-builder /build/view.html    /app/static/
COPY --from=client-builder /build/delete.html  /app/static/
COPY --from=client-builder /build/favicon.svg  /app/static/
COPY --from=client-builder /build/js/          /app/static/js/
COPY --from=client-builder /build/styles/      /app/static/styles/
COPY --from=client-builder /build/vendor/      /app/static/vendor/

RUN groupadd -r delirium && \
    useradd -r -g delirium delirium && \
    chown -R delirium:delirium /app

USER delirium

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD curl -f http://localhost:8080/api/health || exit 1

ENTRYPOINT ["sh", "-c", "java -cp '/app/lib/*' io.ktor.server.netty.EngineMain"]
