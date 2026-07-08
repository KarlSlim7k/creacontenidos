FROM node:22-slim

# Chromium necesita libs de sistema + Playwright. Usamos la lista oficial de
# Playwright vía `playwright install --with-deps`, que es cross-distro.
# Es el motivo por el que la imagen pesa ~400 MB en disco y consume 250-400 MB
# en runtime — el cap lo pone docker-compose (mem_limit).
#
# Paquetes extra: procps (ps) y wget (healthcheck de Dokploy).
RUN apt-get update && apt-get install -y --no-install-recommends \
    procps \
    wget \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY src ./src

# Instala Chromium y sus dependencias de sistema en un solo paso.
RUN npx playwright install --with-deps chromium

# node:22-slim trae el usuario `node` (uid 1000). Los archivos copiados son
# world-readable pero /app es root-owned — Crawlee necesita crear su propio
# storage dir en runtime, así que lo mandamos a /tmp (writable por cualquier user).
ENV CRAWLEE_STORAGE_DIR=/tmp/crawlee-storage
USER node

EXPOSE 3015

CMD ["node", "src/server.js"]
