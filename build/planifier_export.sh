#!/usr/bin/env bash
# ============================================================================
# planifier_export.sh — Export e-reporting automatique (quotidien)
# ============================================================================
# Planifie l'export e-reporting de la veille, tous les jours, sur le poste
# du bureau (ou un mini-PC du restaurant) qui est sur le même réseau que
# la tablette maître. Les CSV/XML sont archivés dans un dossier daté.
#
# Installation (une seule fois) :
#   1. Renseignez HOTE (IP de la tablette maître) et CLE (clé API, menu
#      Réseau de l'application) ci-dessous.
#   2. bash build/planifier_export.sh --install
#
# L'export de la veille se fait chaque jour à 06h10 (horaire modifiable
# dans la crontab ajoutée). Les fichiers sont écrits dans
#   ~/ereporting/AAAAMM/ereporting_AAAAMMJJ.csv (+ .xml)
# ============================================================================
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# --- À RENSEIGNER ----------------------------------------------------------
HOTE="${HOTE:-192.168.1.50}"     # IP de la tablette maître
CLE="${CLE:-}"                   # clé API (menu Réseau de l'application)
DEST="${DEST:-$HOME/ereporting}" # dossier d'archivage des exports
# ---------------------------------------------------------------------------

if [ -z "$CLE" ]; then
  echo "ERREUR : renseignez CLE (clé API) dans $0 ou via l'environnement." >&2
  exit 1
fi

# Export de la veille (le jour J à 06h10, les ventes de J-1 sont closes)
HIER="$(date -d yesterday +%Y-%m-%d 2>/dev/null || date -v-1d +%Y-%m-%d)"
MOIS="$(echo "$HIER" | cut -c1-7)"
mkdir -p "$DEST/$MOIS"

python3 "$ROOT/build/export_e_reporting.py" \
  --hote "$HOTE" --cle "$CLE" \
  --de "$HIER" --a "$HIER" \
  --out "$DEST/$MOIS/ereporting_${HIER}.csv" \
  --no-xml
# (le --no-xml est retiré : on génère aussi le XML)
python3 "$ROOT/build/export_e_reporting.py" \
  --hote "$HOTE" --cle "$CLE" \
  --de "$HIER" --a "$HIER" \
  --out "$DEST/$MOIS/ereporting_${HIER}.csv"

echo "[ok] export e-reporting de $HIER : $DEST/$MOIS/"

# ---------------------------------------------------------------------------
#  Installation de la crontab (--install)
# ---------------------------------------------------------------------------
if [ "${1:-}" = "--install" ]; then
  CRON="10 6 * * * $ROOT/build/planifier_export.sh >> $DEST/cron.log 2>&1"
  ( crontab -l 2>/dev/null | grep -v 'planifier_export.sh' ; echo "$CRON" ) | crontab -
  echo "[ok] tâche planifiée chaque jour à 06h10 (crontab)."
  echo "     Vérifiez : crontab -l"
fi
