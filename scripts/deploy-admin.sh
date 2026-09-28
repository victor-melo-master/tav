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
# El build --no-cache del admin es el que más espacio consume (reconstruye
# todas las capas en cada deploy). Con menos de 20 GB libres el build muere
# a la mitad y puede dejar el disco en 0 y Postgres tumbado (ya pasó).
MIN_FREE_KB=$((20 * 1024 * 1024)) # 20 GB en bloques de 1K

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

# ─────────────────── 1.5. Verificar espacio en disco antes de construir ───────────────────

FREE_KB=$(ssh "$REMOTE" "df -Pk / | awk 'NR==2 {print \$4}'")
if [ "${FREE_KB:-0}" -lt "$MIN_FREE_KB" ]; then
  FREE_GB=$(awk "BEGIN { printf \"%.1f\", ${FREE_KB:-0} / 1048576 }")
  fail "Quedan ${FREE_GB} GB libres en $REMOTE (mínimo: 20 GB)."
  fail "El build moriría a la mitad y puede tumbar Postgres."
  fail "Limpia primero: ssh $REMOTE 'docker image prune -f && docker builder prune -f'"
  fail "NUNCA limpies volúmenes: ahí viven la base de datos y los comprobantes."
  exit 1
fi

FREE_GB=$(awk "BEGIN { printf \"%.1f\", $FREE_KB / 1048576 }")
ok "Espacio libre en $REMOTE: ${FREE_GB} GB."

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

# ─────────────────── 4. Limpiar imágenes viejas y caché de build ───────────────────

# Cada build --no-cache deja capas e imágenes huérfanas; sin limpieza llenan
# el disco (ya tumbó Postgres una vez). NUNCA se podan volúmenes: ahí viven
# la base de datos y los comprobantes subidos.
log "Limpiando imágenes sin usar y caché de build en $REMOTE..."
ssh "$REMOTE" "docker image prune -f >/dev/null && docker builder prune -f >/dev/null" || true
ok "Limpieza hecha (volúmenes intactos)."

# ─────────────────── 5. Resumen ───────────────────

echo ""
ok "Despliegue del panel completo."
log "  Local:     $HEALTH_LOCAL"
log "  Público:   https://panel.tav.rolapro.com"
log "  Proxy:     nginx (aaPanel) → 127.0.0.1:3002"
log "  Logs:      scripts/logs-admin.sh"
