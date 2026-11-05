#!/usr/bin/env bash
# Prepara .venv la primera vez y corre procesar.py. Uso: npm run fotos [-- --forzar] [-- --solo <slug>]
set -euo pipefail
cd "$(dirname "$0")/../.."

PY=.venv/bin/python
REQ=scripts/fotos/requirements.txt
MARCA=.venv/.requisitos

if [ ! -x "$PY" ]; then
  echo "Creando .venv..."
  # Sin el paquete python3-venv no hay ensurepip: se crea sin pip y se instala con el pip del sistema.
  python3 -m venv .venv 2>/dev/null || { rm -rf .venv; python3 -m venv --without-pip .venv; }
fi

if ! cmp -s "$REQ" "$MARCA"; then
  echo "Instalando dependencias..."
  if "$PY" -m pip --version >/dev/null 2>&1; then
    "$PY" -m pip install -q -r "$REQ"
  else
    python3 -m pip --python "$PY" install -q -r "$REQ"
  fi
  cp "$REQ" "$MARCA"
fi

exec "$PY" scripts/fotos/procesar.py "$@"
