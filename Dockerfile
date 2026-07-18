# API de CREA Command Center. También sirve apps/web (Astro SSR) y apps/admin
# (mismo origen). node:22-slim (glibc) evita recompilar bcrypt como pasaría en
# Alpine (musl).

# Stage 1: build de apps/web (Astro) — solo su dist/ pasa a la imagen final,
# no el código fuente ni node_modules de build (Vite/esbuild no hacen falta
# en runtime; el adapter Node ya bundlea sus deps).
FROM node:22-slim AS web-builder
WORKDIR /app/apps/web
COPY apps/web/package*.json ./
RUN npm ci
COPY apps/web ./
RUN npm run build

# Stage 2: build de apps/admin (Vite SPA) — solo su dist/ pasa a la imagen final.
# A diferencia del adapter SSR de Astro, una SPA de Vite no corre en Node: dist/
# es JS+CSS+HTML puro para el navegador, cero dependencias runtime en el server.
FROM node:22-slim AS admin-builder
WORKDIR /app/apps/admin
COPY apps/admin/package*.json ./
RUN npm ci
COPY apps/admin ./
RUN npm run build

FROM node:22-slim

WORKDIR /app/apps/api

# Instalar deps primero para cachear la capa mientras el código cambia.
COPY apps/api/package*.json ./
RUN npm ci --omit=dev

# Código del API + frontends que server.js sirve (../../web/dist, ../../admin).
COPY apps/api ./
COPY --from=web-builder /app/apps/web/dist /app/apps/web/dist
# El adapter Node de Astro no bundlea todas sus deps runtime (ej. picocolors,
# resuelta por Node buscando node_modules hacia arriba desde dist/server/) —
# techo conocido, documentado en el plan: copiar node_modules es el fallback.
COPY --from=web-builder /app/apps/web/node_modules /app/apps/web/node_modules
COPY --from=admin-builder /app/apps/admin/dist /app/apps/admin/dist

EXPOSE 3000

# Correr sin privilegios: node:*-slim ya trae el usuario `node` (uid 1000). Los
# archivos copiados son world-readable y el proceso no escribe a disco, así que
# basta con cambiar de usuario — no hace falta chown.
USER node

# Migrar antes de arrancar. La DB ya está healthy vía depends_on en compose.
CMD ["sh", "-c", "npm run migrate && node src/server.js"]
