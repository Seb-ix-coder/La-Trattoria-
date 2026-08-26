#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
build-11.4.py — APK corrigée « La Trattoria » 11.4
====================================================
Diagnostique : le crash au lancement venait du patch DEX byte-à-byte fait
dans l'ancien build « durci » (11.1/11.2/11.3).

Correction : reconstruire l'APK avec le **moteur DEX d'origine 11.0**
(= le moteur qui fonctionne), en gardant TOUTES les nouvelles fonctions
(qui vivent dans la couche web assets/site.js + site.css, pas dans le DEX)
et le durcissement du manifeste (allowBackup=false — sûr, sans toucher au
DEX). Aucun patch DEX.

  11.0 (moteur, stable)  +  11.3 (site.js/css : QR, pourboire, paiement,
  fidélité, social, module carte)  +  manifeste 11.4 (allowBackup=false)
  =  trato-11.4.apk  (signé v1+v2)

Usage :
  python3 build-11.4.py
"""
import os, sys, zipfile, subprocess, shutil

ROOT = '/home/user/La-Trattoria-'
WORK = '/home/user/work'
sys.path.insert(0, os.path.join(ROOT, 'build'))
import patch_axml  # noqa: E402

SRC_110 = os.path.join(ROOT, 'trato.apk')              # moteur DEX d'origine
SRC_113 = os.path.join(ROOT, 'trato-11.3-unifie.apk')  # site.js/css + manifeste
OUT = os.path.join(ROOT, 'trato-11.4.apk')
KS_DIR = os.path.join(WORK, 'ks114')

def main():
    os.makedirs(WORK, exist_ok=True)

    # 1) extraire le DEX d'origine 11.0
    z110 = zipfile.ZipFile(SRC_110)
    dex110 = z110.read('classes.dex')
    dex_path = os.path.join(WORK, 'dex110.dex')
    open(dex_path, 'wb').write(dex110)
    print('[1] DEX 11.0 extrait : %d octets' % len(dex110))

    # 2) manifeste 11.4 (à partir du manifeste 11.3 : allowBackup déjà false)
    z113 = zipfile.ZipFile(SRC_113)
    manifest = z113.read('AndroidManifest.xml')
    axml = patch_axml.AXML(manifest)
    try:
        axml.patch_int_attr('manifest', 'versionCode', 19)
    except ValueError:
        print('[!] versionCode déjà 19 ?')
    try:
        axml.patch_string('11.3', '11.4')
    except ValueError:
        print('[!] versionName déjà 11.4 ?')
    man_path = os.path.join(WORK, 'manifest114.xml')
    open(man_path, 'wb').write(axml.data)
    print('[2] Manifeste 11.4 écrit (versionCode=19, versionName=11.4, allowBackup=false)')

    # 3) keystore
    if not os.path.exists(os.path.join(KS_DIR, 'trattoria-release.p12')):
        subprocess.run([sys.executable,
                        os.path.join(ROOT, 'build', 'generate_keystore.py'),
                        KS_DIR], check=True)
    p12 = os.path.join(KS_DIR, 'trattoria-release.p12')
    password = open(os.path.join(KS_DIR, 'README-KEYSTORE.txt')).read()
    import re
    m = re.search(r'MOT DE PASSE[^\n]*\n([A-Za-z0-9]+)', password)
    if not m:
        # dernier recours : lire la ligne après "MOT DE PASSE"
        for line in password.splitlines():
            if 'MOT DE PASSE' in line:
                idx = password.splitlines().index(line)
                password = password.splitlines()[idx + 1].strip()
                break
    password = m.group(1) if m else password
    print('[3] Keystore prêt :', p12)

    # 4) reconstruction + signature (resign.py : ZIP préservé, alignement, v1+v2)
    if os.path.exists(OUT):
        os.remove(OUT)
    if os.path.exists(OUT + '.v1'):
        os.remove(OUT + '.v1')
    cmd = [sys.executable, os.path.join(ROOT, 'build', 'resign.py'),
           SRC_113, p12, password, OUT,
           '--replace=classes.dex=' + dex_path,
           '--replace=AndroidManifest.xml=' + man_path]
    print('[4] ' + ' '.join(cmd[:6]) + ' --replace=classes.dex ... --replace=AndroidManifest.xml ...')
    subprocess.run(cmd, check=True)
    print('\n[OK] APK corrigée générée : %s (%d octets)'
            % (OUT, os.path.getsize(OUT)))
    print('     Moteur DEX = 11.0 d\'origine (stable) + toutes les fonctions 11.3')

if __name__ == '__main__':
    main()
