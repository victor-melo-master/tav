# Dockerfile para el panel de administración de TAV.
#
# Construye la app Next.js y la ejecuta con `next start`.
# NEXT_PUBLIC_API_URL es obligatorio como build arg: las variables
# NEXT_PUBLIC_* se inyectan en tiempo de build.
#
# Expone el puerto 3000; docker-compose.prod.yml lo mapea a
# 127.0.0.1:3002 para que solo nginx (aaPanel) pueda alcanzarlo.

FROM node:22-alpine AS base
RUN apk add --no-cache libc6-compat
WORKDIR /app

FROM base AS deps
COPY package.json ./
RUN npm install

FROM base AS builder
ARG NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL}
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM base AS runner
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
WORKDIR /app

# Solo dependencias de runtime.
COPY package.json ./
RUN npm install --omit=dev

COPY --from=builder /app/.next ./.next
COPY --from=builder /app/next.config.mjs ./

EXPOSE 3000
CMD ["npm", "start"]
