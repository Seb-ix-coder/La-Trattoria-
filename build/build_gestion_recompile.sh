#!/usr/bin/env bash
# Compatibilité avec l'ancien nom du script de recompilation.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
exec bash "$ROOT/build/build_final_apk.sh" "${1:-$ROOT/trato-unifie-1.4-stable-unsigned.apk}"
