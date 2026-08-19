#!/usr/bin/env bash
# Lanza la app Flutter en un dispositivo físico o emulador con la URL
# correcta de la API. Resuelve la IP local del Mac automáticamente.
#
# Uso:
#   ./run-device.sh                  # detecta el primer dispositivo
#   ./run-device.sh -d <device-id>   # dispositivo específico
#   ./run-device.sh --release        # modo release
set -euo pipefail

cd "$(dirname "$0")"

IP=""
for iface in en0 en1; do
  IP=$(ipconfig getifaddr "$iface" 2>/dev/null || true)
  if [ -n "$IP" ]; then
    break
  fi
done

if [ -z "$IP" ]; then
  echo "ERROR: no se pudo determinar la IP local del Mac."
  echo "       Verifica que estás conectado a WiFi (en0 o en1)."
  exit 1
fi

BASE_URL="http://${IP}:3001"
echo "→ API: $BASE_URL"
echo "→ flutter run --dart-define=API_BASE_URL=$BASE_URL $*"
exec flutter run --dart-define="API_BASE_URL=$BASE_URL" "$@"
