#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Build byte-for-byte explicite de l'APK native unifiée.

La base reste ``trato-gestion-1.3.apk``/``app-src/base.apk`` : son package,
son activité et ses ressources natives ne sont pas remplacés par ceux de
l'ancienne APK ``com.trattoria.commande``. Les assets du site public sont
ajoutés comme ressources de l'application, puis le DEX recompilé depuis
``build/app-src/src`` est inséré à sa place.

Usage:
  python3 build/build_unified.py --dex build/app-src/dexout/classes.dex \
      --output build/out/trato-unifie-1.4-unsigned.apk
  python3 build/build_unified.py --dex ... --output ... --keystore ... --password ...
"""
from __future__ import annotations

import argparse
import os
import sys
import zipfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
APP_SRC = HERE / "app-src"
BASE = APP_SRC / "base.apk"
ASSETS = APP_SRC / "assets"


def patch_manifest(data: bytes) -> bytes:
    sys.path.insert(0, str(HERE))
    from patch_axml import AXML

    axml = AXML(data)
    axml.patch_int_attr("manifest", "versionCode", 5)
    axml.patch_string("1.3", "1.4")
    axml.patch_boolean_attr("application", "allowBackup", False)
    return axml.data


def make_unsigned(dex_path: Path, output: Path) -> None:
    if not BASE.exists():
        raise FileNotFoundError(BASE)
    if not dex_path.exists():
        raise FileNotFoundError(dex_path)
    output.parent.mkdir(parents=True, exist_ok=True)

    with zipfile.ZipFile(BASE) as src:
        entries: dict[str, bytes] = {
            info.filename: src.read(info.filename)
            for info in src.infolist()
            if not info.filename.endswith("/")
            and not info.filename.startswith("META-INF/")
            and info.filename != "classes.dex"
        }
    entries["AndroidManifest.xml"] = patch_manifest(entries["AndroidManifest.xml"])
    entries["classes.dex"] = dex_path.read_bytes()

    # Les assets ne sont pas des classes ni des ressources compilées : ils
    # peuvent être ajoutés sans remapper de R.*. Les noms sont sous assets/.
    for path in sorted(ASSETS.rglob("*")):
        if path.is_file():
            rel = path.relative_to(ASSETS).as_posix()
            entries["assets/" + rel] = path.read_bytes()

    with zipfile.ZipFile(output, "w", compression=zipfile.ZIP_DEFLATED,
                         compresslevel=9) as dst:
        for name, payload in entries.items():
            info = zipfile.ZipInfo(name, date_time=(1980, 1, 1, 0, 0, 0))
            info.compress_type = zipfile.ZIP_DEFLATED
            info.create_system = 3
            info.external_attr = 0o100644 << 16
            dst.writestr(info, payload, compress_type=zipfile.ZIP_DEFLATED,
                         compresslevel=9)
    print(f"[ok] APK native base + DEX + assets : {output} ({output.stat().st_size} octets)")


def sign(unsigned: Path, output: Path, keystore: Path, password: str) -> None:
    sys.path.insert(0, str(HERE))
    import sign_v1
    import sign_v2

    v1 = Path(str(output) + ".v1")
    sign_v1.sign(str(unsigned), str(keystore), password, str(v1))
    sign_v2.sign(str(v1), str(keystore), password, str(output))
    v1.unlink(missing_ok=True)
    print(f"[ok] signatures APK v1 + v2 : {output}")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dex", required=True, type=Path)
    ap.add_argument("--output", required=True, type=Path)
    ap.add_argument("--keystore", type=Path)
    ap.add_argument("--password")
    args = ap.parse_args()
    make_unsigned(args.dex, args.output)
    if args.keystore:
        if not args.password:
            ap.error("--password est requis avec --keystore")
        sign(args.output, args.output.with_name(args.output.name.replace("-unsigned", "")), args.keystore, args.password)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
