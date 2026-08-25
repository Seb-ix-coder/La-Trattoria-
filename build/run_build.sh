#!/usr/bin/env bash
# ============================================================================
# run_build.sh — Build complet de l'APK durci « La Trattoria » 11.1
# ============================================================================
#
# Déroulé :
#   1. prépare un répertoire de travail (build/work),
#   2. extrait l'APK d'origine (trato.apk),
#   3. applique les correctifs (manifeste, DEX, site.js),
#   4. reconstruit l'APK non signé,
#   5. génère le keystore s'il n'existe pas encore (UNIQUEMENT en local —
#      jamais dans le pipeline : celui-ci reçoit le keystore via les secrets),
#   6. signe en v1 puis v2,
#   7. vérifie le résultat (verify_apk.py) et affiche l'empreinte.
#
# Usage :
#   ./run_build.sh                 # keystore local (par défaut ~/trattoria-keystore)
#   ./run_build.sh /chemin/vers/mon-keystore.p12 MON_MOT_DE_PASSE
#
# Sortie : build/out/trato-11.1-durci.apk
# ============================================================================
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BUILD="$ROOT/build"
WORK="$BUILD/work"
OUT="$BUILD/out"
APK_SRC="${APK_SRC:-$ROOT/trato.apk}"

# --- keystore : soit fourni en argument, soit généré localement -----------
if [ $# -ge 1 ]; then
  KEYSTORE="$1"
  PASSWORD="${2:-}"
else
  KS_DIR="${KEYSTORE_DIR:-$HOME/trattoria-keystore}"
  KEYSTORE="$KS_DIR/trattoria-release.p12"
  if [ ! -f "$KEYSTORE" ]; then
    echo "==> Génération du keystore (local uniquement)"
    python3 "$BUILD/generate_keystore.py" "$KS_DIR"
  fi
  # mot de passe stocké à côté du keystore (lisible par le propriétaire)
  PASSWORD="$(grep -A1 'MOT DE PASSE' "$KS_DIR/README-KEYSTORE.txt" | tail -1 | tr -d '[:space:]')"
fi

if [ -z "$PASSWORD" ]; then
  echo "ERREUR : mot de passe du keystore manquant (2e argument)." >&2
  exit 1
fi

echo "==> APK source   : $APK_SRC"
echo "==> Keystore     : $KEYSTORE"

# --- répertoire de travail ------------------------------------------------
rm -rf "$WORK"
mkdir -p "$WORK" "$OUT"
cd "$WORK"

echo "==> Extraction de l'APK source"
unzip -q -o "$APK_SRC" -d extracted

echo "==> Correctif 1/3 : AndroidManifest.xml (allowBackup=false, v16)"
python3 "$BUILD/patch_axml.py" patch extracted/AndroidManifest.xml manifest_patched.xml

echo "==> Correctif 2/3 : classes.dex (timeout 2000 ms, /carte sans cout)"
python3 "$BUILD/patch_dex.py" extracted/classes.dex classes_patched.dex

echo "==> Correctif 3/3 : assets (API locale + générateur QR intégré)"
python3 "$BUILD/patch_assets.py" extracted/assets/site.js extracted/assets/site.css \
        site_js_patched.js site_css_patched.css

echo "==> Reconstruction de l'APK non signé"
python3 "$BUILD/build_apk.py" "$APK_SRC" manifest_patched.xml classes_patched.dex \
        site_js_patched.js unsigned.apk \
        site_css_patched.css

echo "==> Signature v1 (JAR)"
python3 "$BUILD/sign_v1.py" unsigned.apk "$KEYSTORE" "$PASSWORD" signed_v1.apk

echo "==> Signature v2 (APK Signature Scheme v2)"
python3 "$BUILD/sign_v2.py" signed_v1.apk "$KEYSTORE" "$PASSWORD" "$OUT/trato-11.1-durci.apk"

echo "==> Vérifications finales"
python3 "$BUILD/verify_apk.py" "$OUT/trato-11.1-durci.apk" "$APK_SRC"

echo ""
echo "==============================================================="
echo " APK durci prêt : $OUT/trato-11.1-durci.apk"
echo "==============================================================="
