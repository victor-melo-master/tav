# ── Stage 1: build ──
# Compila TypeScript y genera el cliente de Prisma.
# Necesita devDependencies para nest build y prisma.
FROM node:22-alpine AS build

WORKDIR /app

COPY package.json package-lock.json* ./
# npm install (no npm ci): el proyecto es un monorepo con workspaces de npm
# y el package-lock.json raíz está en la raíz del repo, no en apps/api.
# En el paquete de despliegue solo se copia apps/api/, así que npm ci falla
# porque no encuentra el lockfile que coincide. npm install resuelve desde cero.
RUN npm install

COPY prisma ./prisma
RUN npx prisma generate

COPY . .
RUN npm run build

# ── Stage 2: runtime ──
# Solo el resultado compilado + dependencias de producción.
# Imagen más pequeña, sin compiladores ni código fuente.
FROM node:22-alpine AS runtime

WORKDIR /app

# argon2 necesita python3 y make para compilarse en alpine.
RUN apk add --no-cache python3 make g++

COPY package.json package-lock.json* ./
# Mismo motivo que en build: npm install, no npm ci.
RUN npm install --omit=dev && npm cache clean --force

# El cliente de Prisma se genera con el schema. Necesita el schema en runtime.
COPY prisma ./prisma
RUN npx prisma generate

# Solo el dist compilado.
COPY --from=build /app/dist ./dist

EXPOSE 3001

# migrate deploy aplica migraciones pendientes sin crear nuevas.
# Nunca migrate dev en producción: eso resetea la base.
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/main.js"]
