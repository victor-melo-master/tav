#!/usr/bin/env bash
# scripts/logs.sh — Muestra los logs de la API de TAV en vivo.
#
# Equivale a `docker compose logs -f api` ejecutado en el servidor.
# Ctrl-C para salir.
#
# Uso:
#   scripts/logs.sh            # logs en vivo (follow)
#   scripts/logs.sh --tail 50  # últimas 50 líneas y sigue
#   scripts/logs.sh --db       # logs de la base de datos en vez de la API

set -euo pipefail

REMOTE="tav"
REMOTE_DIR="/opt/tav"
COMPOSE_FILE="docker-compose.prod.yml"

SERVICE="api"
TAIL_ARG=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --db)
      SERVICE="db"
      shift
      ;;
    --tail)
      TAIL_ARG="--tail ${2:-100}"
      shift 2
      ;;
    *)
      echo "Uso: scripts/logs.sh [--db] [--tail N]" >&2
      exit 1
      ;;
  esac
done

echo "→ Logs de $SERVICE en $REMOTE (Ctrl-C para salir)"
echo ""

ssh "$REMOTE" "cd $REMOTE_DIR && \
  docker compose -f $COMPOSE_FILE logs $TAIL_ARG -f $SERVICE"
