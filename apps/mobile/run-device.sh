#!/usr/bin/env bash
# Lanza la app Flutter en un dispositivo.
#
# Por defecto la API apunta a https://api.tav.rolapro.com (production).
# Para desarrollo local, pasa la URL del backend:
#
#   ./run-device.sh                                    # producción
#   ./run-device.sh --local                            # localhost (iOS Simulator)
#   ./run-device.sh --local --ip                       # IP del Mac (Android USB)
#   ./run-device.sh -d <device-id>                     # dispositivo específico
set -euo pipefail

cd "$(dirname "$0")"

if [[ "${1:-}" == "--local" ]]; then
  shift
  if [[ "${1:-}" == "--ip" ]]; then
    shift
    IP=$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null)
    if [ -z "$IP" ]; then
      echo "ERROR: no se pudo determinar la IP local del Mac."
      exit 1
    fi
    BASE_URL="http://${IP}:3001"
  else
    BASE_URL="http://localhost:3001"
  fi
  echo "→ API local: $BASE_URL"
  exec flutter run --dart-define="API_BASE_URL=$BASE_URL" "$@"
fi

echo "→ API: https://api.tav.rolapro.com (producción)"
exec flutter run "$@"
