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
#        https://panel.tav.rolapro.com sirve el build recién creado.
#   1  → error en rsync o build.
#   2  → el panel no respondió tras el build.
#   3  → el público sirve contenido distinto al build recién creado.

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

# ─────────────────── 3.5. Verificar que el público sirve el build nuevo ───────────────────

# Un 200 no verifica nada: ya pasó que el despliegue reportó éxito con un
# build viejo porque solo se miraba el código de estado. Aquí se compara el
# CONTENIDO: la lista de chunks del HTML público y el hash de cada chunk
# tienen que ser idénticos a los que sirve el contenedor recién construido.
log "Verificando que https://panel.tav.rolapro.com sirve el build recién creado..."

if ! ssh "$REMOTE" 'bash -s' <<'VERIFY_EOF'; then
set -u
PUBLIC="https://panel.tav.rolapro.com"
LOCAL="http://127.0.0.1:3002"

chunks_of() {
  curl -sf "$1/tablero" | grep -o '/_next/static/chunks/[^"]*\.js' | sort -u
}

PUB_CHUNKS=$(chunks_of "$PUBLIC")
LOC_CHUNKS=$(chunks_of "$LOCAL")

if [ -z "$PUB_CHUNKS" ] || [ -z "$LOC_CHUNKS" ]; then
  echo "ERROR: no se pudieron extraer chunks de /tablero (público o local)." >&2
  exit 1
fi

if [ "$PUB_CHUNKS" != "$LOC_CHUNKS" ]; then
  echo "ERROR: el HTML público referencia chunks distintos al build local." >&2
  echo "Es la señal de un HTML viejo cacheado apuntando a chunks que ya no existen." >&2
  echo "--- Solo en público ---" >&2
  comm -23 <(echo "$PUB_CHUNKS") <(echo "$LOC_CHUNKS") >&2
  echo "--- Solo en local ---" >&2
  comm -13 <(echo "$PUB_CHUNKS") <(echo "$LOC_CHUNKS") >&2
  exit 1
fi

# El HTML del panel depende de la sesión: un proxy compartido no debe
# guardarlo. Si vuelve a aparecer s-maxage con vida larga, el HTML queda
# cacheado un año y cualquier deploy futuro vuelve a servirse viejo.
PUB_HEADERS=$(curl -sI "$PUBLIC/tablero")
if printf '%s' "$PUB_HEADERS" | grep -i 'cache-control' | grep -qi 's-maxage=[0-9]'; then
  echo "ERROR: el público sigue mandando cache-control con s-maxage de vida larga." >&2
  printf '%s\n' "$PUB_HEADERS" | grep -i 'cache-control\|x-cache\|age:' >&2
  exit 1
fi

FAIL=0
while IFS= read -r chunk; do
  enc=$(printf '%s' "$chunk" | sed 's/(/%28/g;s/)/%29/g')
  pub_md5=$(curl -sf "$PUBLIC$enc" | md5sum | awk '{print $1}')
  loc_md5=$(curl -sf "$LOCAL$enc" | md5sum | awk '{print $1}')
  if [ -z "$pub_md5" ] || [ "$pub_md5" != "$loc_md5" ]; then
    echo "ERROR: $chunk difiere o no carga en público (pub=${pub_md5:-404} loc=${loc_md5:-404})" >&2
    FAIL=1
  fi
done <<< "$PUB_CHUNKS"

exit $FAIL
VERIFY_EOF
  fail "El panel público NO sirve el build recién creado."
  fail "Posible HTML/chunk cacheado en nginx o el contenedor no recogió la imagen nueva."
  exit 3
fi

ok "Contenido verificado: los chunks públicos son idénticos al build nuevo."

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
