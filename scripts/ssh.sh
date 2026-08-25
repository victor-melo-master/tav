#!/usr/bin/env bash
# scripts/ssh.sh — Abre una sesión SSH en /opt/tav del servidor de producción.
#
# Útil para inspeccionar el estado de los contenedores, la base de datos,
# o el .env.prod sin tener que recordar el alias ni el directorio.
#
# Uso:
#   scripts/ssh.sh
#   scripts/ssh.sh --db   # entra al contenedor de Postgres (psql)

set -euo pipefail

REMOTE="tav"
REMOTE_DIR="/opt/tav"
COMPOSE_FILE="docker-compose.prod.yml"

if [[ "${1:-}" == "--db" ]]; then
  echo "→ Entrando al contenedor de Postgres (psql -U tav -d tav)"
  ssh "$REMOTE" "cd $REMOTE_DIR && \
    docker compose -f $COMPOSE_FILE exec db psql -U tav -d tav"
else
  echo "→ Sesión SSH en $REMOTE:$REMOTE_DIR"
  ssh -t "$REMOTE" "cd $REMOTE_DIR && exec \$SHELL -l"
fi
