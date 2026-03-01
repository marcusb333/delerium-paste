# Stage 1: Build TypeScript client
FROM node:20-alpine AS builder
WORKDIR /build
COPY client/package*.json ./
RUN npm ci --ignore-scripts
COPY client/ ./
RUN npm run build

# Stage 2: Serve compiled assets with nginx
FROM nginx:1.27-alpine
LABEL org.opencontainers.image.title="Delirium Paste Web"
LABEL org.opencontainers.image.description="Zero-knowledge encrypted paste service frontend"
LABEL org.opencontainers.image.source="https://github.com/marcusb333/delerium-paste"
LABEL org.opencontainers.image.licenses="MIT"

# Remove default nginx config and empty html dir
RUN rm -f /etc/nginx/conf.d/default.conf && rm -rf /usr/share/nginx/html/*

# Copy compiled static assets from build stage
COPY --from=builder /build/index.html   /usr/share/nginx/html/
COPY --from=builder /build/view.html    /usr/share/nginx/html/
COPY --from=builder /build/delete.html  /usr/share/nginx/html/
COPY --from=builder /build/favicon.svg  /usr/share/nginx/html/
COPY --from=builder /build/js/          /usr/share/nginx/html/js/
COPY --from=builder /build/styles/      /usr/share/nginx/html/styles/
COPY --from=builder /build/vendor/      /usr/share/nginx/html/vendor/

RUN chown -R nginx:nginx /usr/share/nginx/html

EXPOSE 80
