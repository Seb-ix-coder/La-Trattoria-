#!/usr/bin/env bash
# ============================================================================
# run_build.sh — Build complet de l'APK durci « La Trattoria » 11.1
# ============================================================================
#
# Déroulé :
#   1. prépare un répertoire de travail (build/work),
#   2. extrait l'APK d'origine (trato.apk),
#   3. applique les correctifs (manifeste, assets site.js/site.css),
#   4. reconstruit l'APK non signé,
#   5. génère le keystore s'il n'existe pas encore (UNIQUEMENT en local —
#      jamais dans le pipeline : celui-ci reçoit le keystore via les secrets),
#   6. signe en v1 puis v2,
#   7. vérifie le résultat (verify_apk.py) et affiche l'empreinte.
#
# ⚠️ MOTEUR DEX : depuis le diagnostic du crash au lancement
#    (DIAGNOSTIQUE_CRASH.md), le DEX d'origine est conservé INTACT — les
#    patchs byte-à-byte du DEX (builds 11.1–11.4) faisaient planter
#    l'application au démarrage. Pour reproduire ces anciens builds
#    (DÉCONSEILLÉ) : PATCH_DEX=1 ./run_build.sh
#
# Usage :
#   ./run_build.sh                 # clé locale générée hors dépôt
#   KEYSTORE_PATH=/chemin/vers/mon-keystore.p12 KEYSTORE_PASSWORD=... ./run_build.sh
#
# Le mot de passe n'est volontairement pas accepté en argument : il ne doit
# jamais apparaître dans la liste des processus.
#
# Sortie : build/out/trato-11.1-durci.apk
# ============================================================================
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BUILD="$ROOT/build"
WORK="$BUILD/work"
OUT="$BUILD/out"
APK_SRC="${APK_SRC:-$ROOT/trato.apk}"
PATCH_DEX="${PATCH_DEX:-0}"   # 1 = patchs DEX historiques (CRASH au lancement !)

# --- keystore : uniquement hors dépôt --------------------------------------
# Les variables d'environnement sont prioritaires (CI : secrets protégés).
# Un seul argument optionnel, le chemin du keystore, reste accepté ; le mot
# de passe ne doit jamais apparaître dans la liste des processus.
if [ $# -gt 1 ]; then
  echo "Usage : $0 [chemin-keystore]" >&2
  exit 1
fi
KEYSTORE="${KEYSTORE_PATH:-${1:-}}"
PASSWORD="${KEYSTORE_PASSWORD:-}"
if [ -z "$KEYSTORE" ]; then
  KS_DIR="${KEYSTORE_DIR:-$HOME/trattoria-keystore}"
  KEYSTORE="$KS_DIR/trattoria-release.p12"
  if [ ! -f "$KEYSTORE" ]; then
    echo "==> Aucun keystore externe : génération locale dans $KS_DIR"
    PASSWORD="$(KEYSTORE_PASSWORD="$PASSWORD" python3 "$BUILD/generate_keystore.py" "$KS_DIR")"
  fi
fi
if [ -z "$PASSWORD" ]; then
  echo "ERREUR : définir KEYSTORE_PASSWORD dans l'environnement (coffre externe)." >&2
  exit 1
fi
KEYSTORE_ABS="$(realpath -m "$KEYSTORE")"
ROOT_ABS="$(realpath -m "$ROOT")"
if [[ "$KEYSTORE_ABS" == "$ROOT_ABS"/* ]]; then
  echo "ERREUR : le keystore doit être hors du dépôt ; fournir un coffre externe." >&2
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

echo "==> Correctif 1/2 : AndroidManifest.xml (allowBackup=false, versions)"
python3 "$BUILD/patch_axml.py" patch extracted/AndroidManifest.xml manifest_patched.xml

REPLACE_ARGS=(--replace=AndroidManifest.xml=manifest_patched.xml)

if [ "$PATCH_DEX" = "1" ]; then
  echo "==> ⚠️ PATCH_DEX=1 : patch DEX historique (CRASH au lancement — voir DIAGNOSTIQUE_CRASH.md)"
  python3 "$BUILD/patch_dex.py" extracted/classes.dex classes_patched.dex
  REPLACE_ARGS+=(--replace=classes.dex=classes_patched.dex)
else
  echo "==> Moteur DEX d'origine conservé INTACT (correctif crash au lancement)"
fi

echo "==> Correctif 2/2 : assets (API locale + QR + conformité + modes App)"
python3 "$BUILD/patch_assets.py" extracted/assets/site.js extracted/assets/site.css \
        site_js_patched.js site_css_patched.css
REPLACE_ARGS+=(--replace=assets/site.js=site_js_patched.js
               --replace=assets/site.css=site_css_patched.css)

echo "==> Reconstruction + signature (ZIP original préservé)"
# Le script resign.py reconstruit l'APK en gardant les octets compressés
# bruts de toutes les entrées non modifiées (méthodes et alignement
# préservés : resources.arsc en STORE aligné 4, comme l'original), puis
# ajoute la signature v1 et le bloc v2. C'est ce qui rend l'APK
# installable — la recompression complète faisait échouer l'installation.
KEYSTORE_PASSWORD="$PASSWORD" python3 "$BUILD/resign.py" "$APK_SRC" "$KEYSTORE" "$OUT/trato-11.1-durci.apk" \
        "${REPLACE_ARGS[@]}"

echo "==> Vérifications finales"
PATCH_DEX="$PATCH_DEX" python3 "$BUILD/verify_apk.py" "$OUT/trato-11.1-durci.apk" "$APK_SRC"

echo ""
echo "==============================================================="
echo " APK durci prêt : $OUT/trato-11.1-durci.apk"
echo "==============================================================="
