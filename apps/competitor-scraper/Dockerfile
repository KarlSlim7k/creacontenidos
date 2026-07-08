FROM node:22-slim

# Chromium necesita libs de sistema + Playwright. Usamos la lista oficial de
# Playwright vía `playwright install --with-deps`, que es cross-distro.
# Es el motivo por el que la imagen pesa ~400 MB en disco. En runtime, un
# Chromium headless scrapeando una sola cuenta ya usa ~700 MB — el cap real
# lo pone docker-compose (mem_limit).
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

# Por defecto playwright instala en $HOME/.cache/ms-playwright. Como este RUN
# corre como root, eso cae en /root/.cache — y /root no es atravesable por el
# user node (permisos 700), así que en runtime no encuentra el browser.
# Lo mandamos a una ruta fuera de /root, legible por cualquier user.
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright

# Instala Chromium y sus dependencias de sistema en un solo paso.
RUN npx playwright install --with-deps chromium && chmod -R o+rX /ms-playwright

# node:22-slim trae el usuario `node` (uid 1000). Los archivos copiados son
# world-readable pero /app es root-owned — Crawlee necesita crear su propio
# storage dir en runtime, así que lo mandamos a /tmp (writable por cualquier user).
ENV CRAWLEE_STORAGE_DIR=/tmp/crawlee-storage

# Crawlee por default solo se auto-asigna 25% de la memoria total detectada
# (pensado para compartir la máquina con otros procesos). Este contenedor
# corre un solo Chromium y nada más, así que le damos casi todo el mem_limit
# del compose — si no, Crawlee cree que tiene ~192 MB (25% de 768 MB) y
# dispara warnings de "critically overloaded" con un uso normal de ~700 MB.
ENV CRAWLEE_AVAILABLE_MEMORY_RATIO=0.9
USER node

EXPOSE 3015

CMD ["node", "src/server.js"]
