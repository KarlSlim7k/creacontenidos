# API de CREA Command Center. También sirve apps/web y apps/admin (mismo origen).
# node:22-slim (glibc) evita recompilar bcrypt como pasaría en Alpine (musl).
FROM node:22-slim

WORKDIR /app/apps/api

# Instalar deps primero para cachear la capa mientras el código cambia.
COPY apps/api/package*.json ./
RUN npm ci --omit=dev

# Código del API + frontends estáticos que server.js sirve (../../web, ../../admin).
COPY apps/api ./
COPY apps/web /app/apps/web
COPY apps/admin /app/apps/admin

EXPOSE 3000

# Correr sin privilegios: node:*-slim ya trae el usuario `node` (uid 1000). Los
# archivos copiados son world-readable y el proceso no escribe a disco, así que
# basta con cambiar de usuario — no hace falta chown.
USER node

# Migrar antes de arrancar. La DB ya está healthy vía depends_on en compose.
CMD ["sh", "-c", "npm run migrate && node src/server.js"]
