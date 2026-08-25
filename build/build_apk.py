#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
build_apk.py — Reconstruction de l'APK non signé (build durci 11.1)
===================================================================

Reconstruit un APK à partir de l'APK d'origine en :
  * conservant TOUTES les entrées (ressources, assets, kotlin/, META-INF
    hors fichiers de signature),
  * remplaçant 3 entrées par leurs versions patchées :
      - AndroidManifest.xml  (patch_axml.py : allowBackup=false, versionCode 16)
      - classes.dex          (patch_dex.py : timeout 2000 ms, /carte sans cout)
      - assets/site.js       (patch_assets.py : découverte auto de l'API),
  * supprimant les anciens fichiers de signature (META-INF/CERT.*,
    MANIFEST.MF) : ils seront régénérés par sign_v1.py,
  * compressant toutes les entrées (DEFLATED, niveau 9).

Pourquoi tout en DEFLATED ?
---------------------------
Android 11+ (targetSdk 30+) exige que les entrées NON compressées soient
alignées (resources.arsc sur 4 octets, libs natives sur 4096 octets).
Python zipfile n'écrit pas d'alignement : en compressant tout, on est
hors du champ de cette exigence — l'APK s'installe sur tous les Android
5.0 → 14+. C'est le choix le plus sûr pour un build non signé ici.

Déterminisme
------------
Les horodatages des entrées d'origine sont conservés : deux exécutions
produisent le même APK (hors signatures, cf. sign_v1.py / sign_v2.py).

Usage :
  python3 build_apk.py trato.apk manifest.xml classes.dex site.js unsigned.apk
"""

import sys
import zipfile

# Fichiers de signature JAR à NE PAS conserver : ils seront régénérés.
V1_SIGNATURE_FILES = (
    'META-INF/MANIFEST.MF',
    'META-INF/CERT.SF',
    'META-INF/CERT.RSA',
)

# Entrées remplacées par les versions patchées.
REPLACED = (
    'AndroidManifest.xml',
    'classes.dex',
    'assets/site.js',
)


def build(src_apk: str, manifest: str, dex: str, site_js: str,
          dst_apk: str) -> None:
    replacements = {
        'AndroidManifest.xml': open(manifest, 'rb').read(),
        'classes.dex': open(dex, 'rb').read(),
        'assets/site.js': open(site_js, 'rb').read(),
    }
    src = zipfile.ZipFile(src_apk)
    with zipfile.ZipFile(dst_apk, 'w', zipfile.ZIP_DEFLATED, compresslevel=9) \
            as out:
        written = set()
        for info in src.infolist():
            if info.filename in V1_SIGNATURE_FILES:
                # ancienne signature : on la jette (elle couvrait l'ancien
                # contenu et l'ancienne clé)
                print('[skip] %s' % info.filename)
                continue
            data = src.read(info.filename)
            if info.filename in replacements:
                data = replacements[info.filename]
                print('[replace] %s (%d -> %d octets)'
                      % (info.filename, info.file_size, len(data)))
            # On conserve les métadonnées d'origine (horodatage, permissions
            # unix) pour un build déterministe et fidèle.
            zi = zipfile.ZipInfo(info.filename, date_time=info.date_time)
            zi.compress_type = zipfile.ZIP_DEFLATED
            zi.external_attr = info.external_attr
            zi.create_system = info.create_system
            zi.comment = info.comment
            out.writestr(zi, data, compress_type=zipfile.ZIP_DEFLATED,
                         compresslevel=9)
            written.add(info.filename)
    src.close()
    print('[ok] APK non signé écrit : %s' % dst_apk)


def main() -> None:
    if len(sys.argv) != 6:
        print(__doc__)
        sys.exit(1)
    build(*sys.argv[1:6])


if __name__ == '__main__':
    main()
