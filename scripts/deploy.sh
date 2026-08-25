#!/usr/bin/env bash
# scripts/deploy.sh — Despliegue de la API de TAV al servidor de producción.
#
# Sincroniza apps/api y docker-compose.prod.yml a /opt/tav/ en el servidor
# con rsync sobre SSH, reconstruye los contenedores, verifica que la API
# responde (local y público), y aborta con código != 0 si algo falla.
#
# NUNCA sobrescribe .env.prod del servidor: contiene los secretos de
# producción. rsync excluye todo archivo de entorno.
#
# Uso:
#   scripts/deploy.sh
#
# Salida:
#   0  → despliegue OK, /health responde 200 local y público.
#   1  → error en rsync o build.
#   2  → la API no responde tras el build.
#   3  → el endpoint público no responde tras el build.

set -euo pipefail

REMOTE="tav"
REMOTE_DIR="/opt/tav"
COMPOSE_FILE="docker-compose.prod.yml"
HEALTH_LOCAL="http://127.0.0.1:3001/health"
HEALTH_PUBLIC="https://api.tav.rolapro.com/health"
API_LOG_LINES=30

# Colores para salida (solo si es terminal).
if [ -t 1 ]; then
  GREEN='\033[0;32m'
  RED='\033[0;31m'
  YELLOW='\033[1;33m'
  NC='\033[0m'
else
  GREEN='' RED='' YELLOW='' NC=''
fi

log()  { printf "${YELLOW}→ %s${NC}\n" "$*"; }
ok()   { printf "${GREEN}✓ %s${NC}\n" "$*"; }
fail() { printf "${RED}✗ %s${NC}\n" "$*" >&2; }

trap 'fail "Despliegue abortado en línea $LINENO."' ERR

# ─────────────────── 1. Sincronizar código con rsync ───────────────────

log "Sincronizando apps/api y $COMPOSE_FILE a $REMOTE:$REMOTE_DIR/"

# rsync excluye:
# - node_modules/ y dist/ (se reconstruyen en el Docker build)
# - .env, .env.* (los secretos viven en el servidor, nunca se tocan)
# - .git/ (no va al servidor)
# - cobertura de tests y caches
rsync -avz --delete \
  --exclude='node_modules' \
  --exclude='dist' \
  --exclude='.env' \
  --exclude='.env.*' \
  --exclude='.git' \
  --exclude='coverage' \
  --exclude='.cache' \
  --exclude='*.log' \
  -e ssh \
  "apps/api/" "$REMOTE:$REMOTE_DIR/apps/api/"

rsync -avz \
  --exclude='.env' \
  --exclude='.env.*' \
  -e ssh \
  "$COMPOSE_FILE" "$REMOTE:$REMOTE_DIR/$COMPOSE_FILE"

ok "Código sincronizado."

# ─────────────────── 2. Reconstruir y levantar contenedores ───────────────────

log "Reconstruyendo y levantando contenedores en $REMOTE..."

# --build fuerza reconstrucción de la imagen con el código nuevo.
# --env-file pasa los secretos que viven en el servidor.
ssh "$REMOTE" "cd $REMOTE_DIR && \
  docker compose -f $COMPOSE_FILE --env-file .env.prod up -d --build"

ok "Contenedores levantados."

# ─────────────────── 3. Esperar a que la API responda (local) ───────────────────

log "Esperando a que la API responda en $HEALTH_LOCAL (hasta 60s)..."

MAX_WAIT=60
WAITED=0
until ssh "$REMOTE" "curl -sf $HEALTH_LOCAL" >/dev/null 2>&1; do
  sleep 2
  WAITED=$((WAITED + 2))
  if [ "$WAITED" -ge "$MAX_WAIT" ]; then
    fail "La API no respondió en ${MAX_WAIT}s tras el build."
    log "Últimos $API_LOG_LINES renglones del log del contenedor api:"
    ssh "$REMOTE" "cd $REMOTE_DIR && \
      docker compose -f $COMPOSE_FILE logs api --tail $API_LOG_LINES" >&2 || true
    exit 2
  fi
done

ok "API responde localmente en ${WAITED}s."

# ─────────────────── 4. Verificar endpoint público ───────────────────

log "Verificando $HEALTH_PUBLIC..."

if ! curl -sf "$HEALTH_PUBLIC" >/dev/null 2>&1; then
  fail "El endpoint público no responde tras el build."
  log "Últimos $API_LOG_LINES renglones del log del contenedor api:"
  ssh "$REMOTE" "cd $REMOTE_DIR && \
    docker compose -f $COMPOSE_FILE logs api --tail $API_LOG_LINES" >&2 || true
  exit 3
fi

ok "Endpoint público responde."

# ─────────────────── 5. Resumen ───────────────────

echo ""
ok "Despliegue completo."
log "  Local:  $HEALTH_LOCAL"
log "  Público: $HEALTH_PUBLIC"
log "  Logs:    scripts/logs.sh"
log "  SSH:     scripts/ssh.sh"
