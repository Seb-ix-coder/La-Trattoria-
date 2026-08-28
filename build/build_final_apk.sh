#!/usr/bin/env bash
# Build reproductible de l'APK native unifiée La Trattoria 1.4.
# La compilation exige JDK 17+ ; la signature peut être faite séparément.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TOOLS="$ROOT/build/native-tools"
SRC="$ROOT/build/app-src/src"
CLASSES="$ROOT/build/out/classes-final"
DEX_DIR="$ROOT/build/out/dex-final"
OUT="${1:-$ROOT/trato-unifie-1.4-stable-unsigned.apk}"

JAVA_BIN="${JAVA_BIN:-java}"
if ! command -v "$JAVA_BIN" >/dev/null 2>&1; then
  echo "ERREUR: JDK absent. Installez Java 17 ou définissez JAVA_BIN." >&2
  exit 2
fi

rm -rf "$CLASSES" "$DEX_DIR"
mkdir -p "$CLASSES" "$DEX_DIR"
find "$SRC" -name '*.java' -print | sort > "$ROOT/build/out/sources-final.txt"

"$JAVA_BIN" -cp "$TOOLS/ecj.jar" org.eclipse.jdt.internal.compiler.batch.Main \
  -source 8 -target 8 -encoding UTF-8 -proc:none \
  -classpath "$TOOLS/android.jar:$TOOLS/org-json.jar" \
  -d "$CLASSES" @"$ROOT/build/out/sources-final.txt"

"$JAVA_BIN" -cp "$TOOLS/d8.jar" com.android.tools.r8.D8 \
  --min-api 21 --lib "$TOOLS/android.jar" --output "$DEX_DIR" \
  $(find "$CLASSES" -name '*.class' -print | sort)

python3 "$ROOT/build/build_unified.py" --dex "$DEX_DIR/classes.dex" --output "$OUT"
echo "[ok] DEX recompilé et APK non signé préparé : $OUT"
