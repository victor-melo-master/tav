#!/usr/bin/env bash
# scripts/deploy-admin.sh — Despliegue del panel de administración de TAV.
#
# Sincroniza apps/admin y docker-compose.prod.yml a /opt/tav/, reconstruye
# solo el contenedor admin, verifica que responda en localhost y aborta
# con código != 0 si algo falla.
#
# Uso:
#   scripts/deploy-admin.sh
#
# Salida:
#   0  → despliegue OK, http://127.0.0.1:3002 responde y el público
#        https://tav.rolapro.com está configurado.
#   1  → error en rsync o build.
#   2  → el panel no respondió tras el build.

set -euo pipefail

REMOTE="tav"
REMOTE_DIR="/opt/tav"
COMPOSE_FILE="docker-compose.prod.yml"
HEALTH_LOCAL="http://127.0.0.1:3002/"
ADMIN_LOG_LINES=30

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

log "Sincronizando apps/admin y $COMPOSE_FILE a $REMOTE:$REMOTE_DIR/"

rsync -avz --delete \
  --exclude='node_modules' \
  --exclude='.next' \
  --exclude='.env' \
  --exclude='.env.*' \
  --exclude='.git' \
  --exclude='coverage' \
  --exclude='.cache' \
  --exclude='*.log' \
  -e ssh \
  "apps/admin/" "$REMOTE:$REMOTE_DIR/apps/admin/"

rsync -avz \
  --exclude='.env' \
  --exclude='.env.*' \
  -e ssh \
  "$COMPOSE_FILE" "$REMOTE:$REMOTE_DIR/$COMPOSE_FILE"

ok "Código sincronizado."

# ─────────────────── 2. Reconstruir y levantar el contenedor admin ───────────────────

log "Reconstruyendo el contenedor admin en $REMOTE..."

# Reconstrucción sin caché para que cada deploy refleje el código actual.
# El resto del stack (db, api) no se toca.
ssh "$REMOTE" "cd $REMOTE_DIR && \
  docker compose -f $COMPOSE_FILE --env-file .env.prod build --no-cache admin && \
  docker compose -f $COMPOSE_FILE --env-file .env.prod up -d admin"

ok "Contenedor admin levantado."

# ─────────────────── 3. Esperar a que el panel responda (local) ───────────────────

log "Esperando a que el panel responda en $HEALTH_LOCAL (hasta 60s)..."

MAX_WAIT=60
WAITED=0
until ssh "$REMOTE" "curl -sf $HEALTH_LOCAL" >/dev/null 2>&1; do
  sleep 2
  WAITED=$((WAITED + 2))
  if [ "$WAITED" -ge "$MAX_WAIT" ]; then
    fail "El panel no respondió en ${MAX_WAIT}s tras el build."
    log "Últimos $ADMIN_LOG_LINES renglones del log del contenedor admin:"
    ssh "$REMOTE" "cd $REMOTE_DIR && \
      docker compose -f $COMPOSE_FILE logs admin --tail $ADMIN_LOG_LINES" >&2 || true
    exit 2
  fi
done

ok "Panel responde localmente en ${WAITED}s."

# ─────────────────── 4. Resumen ───────────────────

echo ""
ok "Despliegue del panel completo."
log "  Local:     $HEALTH_LOCAL"
log "  Público:   https://panel.tav.rolapro.com"
log "  Proxy:     nginx (aaPanel) → 127.0.0.1:3002"
log "  Logs:      scripts/logs-admin.sh"
