#!/usr/bin/env bash
# ============================================================================
# run_build_stable.sh — Build complet de la version STABLE unifiée
# ============================================================================
#
# Pipeline de bout en bout, reproductible en une commande :
#   1. build durci   : trato.apk  → build/out/trato-11.1-durci.apk
#                      (correctifs AXML/DEX/assets + signature v1+v2)
#   2. intégration   : + module « carte/ » → APK unifié paramétrable
#                      (versionCode/versionName passés en options)
#   3. vérifications : manifeste, DEX, site.js, ZIP, signatures v1/v2
#   4. livraison     : copie à la racine du dépôt
#
# Usage :
#   ./run_build_stable.sh                      # 11.4 / versionCode 19
#   ./run_build_stable.sh --version-name=11.5 --version-code=20
#
# Keystore : généré localement au premier lancement (jamais commité —
# voir generate_keystore.py). Sortie : trato-<version>-stable.apk à la racine.
# ============================================================================
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(dirname "$HERE")"
APK_SRC="${APK_SRC:-$ROOT/trato.apk}"
CARTE_DIR="$ROOT/carte"

# --- options de version -----------------------------------------------------
VERSION_NAME="11.5"
VERSION_CODE="20"
for opt in "$@"; do
  case "$opt" in
    --version-name=*) VERSION_NAME="${opt#*=}" ;;
    --version-code=*) VERSION_CODE="${opt#*=}" ;;
    *) echo "Option inconnue : $opt" >&2; exit 1 ;;
  esac
done
OUT_APK="$ROOT/trato-$VERSION_NAME-stable.apk"

echo "==============================================================="
echo " Build stable La Trattoria — versionName $VERSION_NAME, versionCode $VERSION_CODE"
echo "==============================================================="

# --- keystore : officiel FIGÉ dans le dépôt (priorité), sinon local --------
KEYSTORE="$HERE/keystore/trattoria-release.p12"
if [ -f "$KEYSTORE" ]; then
  PASSWORD="$(sed -n 's/^Mot de passe : //p' "$HERE/keystore/MOT_DE_PASSE.txt" | head -1 | tr -d '[:space:]')"
else
  KS_DIR="${KEYSTORE_DIR:-$HOME/trattoria-keystore}"
  KEYSTORE="$KS_DIR/trattoria-release.p12"
  if [ ! -f "$KEYSTORE" ]; then
    echo "==> ATTENTION : keystore officiel absent — GÉNÉRATION D'UNE NOUVELLE CLÉ"
    python3 "$HERE/generate_keystore.py" "$KS_DIR"
  fi
  PASSWORD="$(grep -A1 'MOT DE PASSE' "$KS_DIR/README-KEYSTORE.txt" | tail -1 | tr -d '[:space:]')"
fi
if [ -z "$PASSWORD" ]; then
  echo "ERREUR : mot de passe du keystore introuvable." >&2
  exit 1
fi

# --- étape 1 : build durci --------------------------------------------------
echo ""
echo "==> [1/4] Build durci (correctifs sécurité) depuis $(basename "$APK_SRC")"
APK_SRC="$APK_SRC" bash "$HERE/run_build.sh"
DURCI="$HERE/out/trato-11.1-durci.apk"
if [ ! -f "$DURCI" ]; then
  echo "ERREUR : build durci absent ($DURCI)." >&2
  exit 1
fi

# --- étape 2 : intégration du module carte ----------------------------------
echo ""
echo "==> [2/4] Intégration du module carte (build unifié $VERSION_NAME)"
python3 "$HERE/integrer_carte.py" "$DURCI" "$CARTE_DIR" "$KEYSTORE" "$PASSWORD" "$OUT_APK" \
        --version-code="$VERSION_CODE" --version-name="$VERSION_NAME"

# --- étape 3 : vérifications ------------------------------------------------
echo ""
echo "==> [3/4] Vérifications de l'APK unifié"
python3 "$HERE/verify_unifie.py" "$OUT_APK" "$DURCI" "$VERSION_NAME" "$VERSION_CODE"

# Garantie critique du correctif crash : le DEX final doit être celui de
# l'APK d'origine 11.0, byte à byte (voir DIAGNOSTIQUE_CRASH.md).
python3 - "$OUT_APK" "$APK_SRC" <<'PY'
import sys, zipfile
a = zipfile.ZipFile(sys.argv[1]).read('classes.dex')
b = zipfile.ZipFile(sys.argv[2]).read('classes.dex')
assert a == b, 'classes.dex final != DEX d\'origine !'
print("[ok] DEX final == moteur d'origine 11.0 (byte à byte) — "
      'aucun crash de moteur possible')
PY

# --- étape 4 : livraison ----------------------------------------------------
echo ""
echo "==> [4/4] Livraison"
python3 - "$OUT_APK" <<'PY'
import hashlib, sys
p = sys.argv[1]
print('    %s  (%.2f Mo)' % (p, len(open(p, "rb").read()) / 1048576))
print('    SHA-256 : %s' % hashlib.sha256(open(p, 'rb').read()).hexdigest())
PY

echo ""
echo "==============================================================="
echo " Version stable prête : $OUT_APK"
echo "==============================================================="
