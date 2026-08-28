#!/usr/bin/env bash
# Recompile l'interface native moderne depuis app-src (JDK 17 + D8).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TOOLS="$ROOT/build/native-tools"
SRC="$ROOT/build/app-src/src"
CLASSES="$ROOT/build/app-src/classes-recompiled"
DEX="$ROOT/build/app-src/dexout/classes.dex"
OUT="${1:-$ROOT/trato-gestion-1.4.apk}"
rm -rf "$CLASSES" "$ROOT/build/app-src/dexout/recompiled"; mkdir -p "$CLASSES" "$ROOT/build/app-src/dexout/recompiled"
find "$SRC" -name '*.java' > /tmp/trattoria-sources.txt
java -cp "$TOOLS/ecj.jar" org.eclipse.jdt.internal.compiler.batch.Main \
  -source 8 -target 8 -encoding UTF-8 -proc:none \
  -classpath "$TOOLS/android.jar:$TOOLS/org-json.jar" \
  -d "$CLASSES" @/tmp/trattoria-sources.txt
java -cp "$TOOLS/d8.jar" com.android.tools.r8.D8 \
  --lib "$TOOLS/android.jar" --output "$ROOT/build/app-src/dexout/recompiled" \
  $(find "$CLASSES" -name '*.class')
cp "$ROOT/build/app-src/dexout/recompiled/classes.dex" "$DEX"
python3 "$ROOT/build/assemble_apk.py" "$OUT"
python3 "$ROOT/build/verify_apk.py" "$OUT" "$ROOT/trato-gestion-1.3.apk"
echo "APK native recompilée : $OUT"
