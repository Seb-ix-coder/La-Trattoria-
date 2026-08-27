#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
verify_unifie.py — Batterie de vérification de l'APK unifié 11.3
=================================================================

Vérifie, indépendamment du build :
  1. le manifeste : package, versionCode=18, versionName=11.3,
     allowBackup=false, minSdk/targetSdk inchangés,
  2. le DEX : inchangé par rapport à l'APK durci source (byte à byte),
  3. l'asset site.js : addon carte présent, module social présent,
  4. la structure ZIP : mêmes entrées que l'original (hors signatures),
  5. la signature v1 (JAR) et v2 (bloc APK Signature Scheme),
  6. l'empreinte SHA-256 de l'APK et du certificat.

Usage :
  python3 build/verify_unifie.py OUT_APK SRC_APK
"""

import hashlib
import logging
import os
import struct
import sys
import zipfile

logging.disable(logging.CRITICAL)

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)


def check_manifest(apk_path: str, version_name: str = '11.3',
                   version_code: str = '18') -> None:
    from androguard.core.apk import APK
    a = APK(apk_path)
    assert a.get_package() == 'com.trattoria.commande', 'package'
    assert a.get_androidversion_code() == version_code, 'versionCode=%s' \
        % a.get_androidversion_code()
    assert a.get_androidversion_name() == version_name, 'versionName=%s' \
        % a.get_androidversion_name()
    assert a.get_min_sdk_version() == '21', 'minSdk'
    assert a.get_target_sdk_version() == '34', 'targetSdk'
    xml = a.get_android_manifest_xml()
    app = [el for el in xml.iter() if el.tag.endswith('application')][0]
    assert app.get('{http://schemas.android.com/apk/res/android}allowBackup') \
        == 'false', 'allowBackup'
    print('[ok] manifeste : com.trattoria.commande %s (vc %s), '
          'allowBackup=false' % (version_name, version_code))


def check_dex_unchanged(apk_path: str, orig_path: str) -> None:
    a = zipfile.ZipFile(apk_path).read('classes.dex')
    b = zipfile.ZipFile(orig_path).read('classes.dex')
    assert a == b, 'classes.dex a été modifié !'
    print('[ok] DEX inchangé (byte à byte) : aucune chirurgie')


def check_site_js(apk_path: str) -> None:
    js = zipfile.ZipFile(apk_path).read('assets/site.js').decode('utf-8')
    css = zipfile.ZipFile(apk_path).read('assets/site.css').decode('utf-8')
    # build durci 11.2 conservé
    assert 'Correctif durci 11.1' in js, 'correctif B1 absent'
    assert 'TrattoriaQR' in js, 'encodeur QR absent'
    assert 'Outils de conformité' in js, 'outils de conformité absents'
    assert 'Pourboire numérique' in js, 'pourboire absent'
    assert 'pm-opt' in js, 'paiement absent'
    assert 'Modes App' in js, 'modes App absents'
    assert 'barre-sociale' in js, 'MODULE SOCIAL absent (barre-sociale)'
    assert 'barre-sociale' in css, 'styles module social absents'
    assert 'Avis Google' in js and 'Tripadvisor' in js, \
        'liens d\'avis sociaux absents'
    # addon carte unifié
    assert 'BUNDLE_B64' in js, 'bundle carte absent'
    assert 'lt-carte-iframe' in js, 'mode ?carte absent'
    assert 'btn-carte' in js, 'bouton carte absent'
    # décodage du bundle : le module complet doit y être
    import re as _re
    m = _re.search(r"BUNDLE_B64 = '([A-Za-z0-9+/=]+)'", js)
    assert m, 'bundle illisible'
    import base64 as _b64
    module = _b64.b64decode(m.group(1)).decode('utf-8')
    assert 'Gestion de la carte' in module, 'module carte absent du bundle'
    assert 'La Margherita' in module, 'catalogue (donnees.js) absent du bundle'
    assert 'syncDetecter' in module, 'logique synchro du module absente'
    assert 'Cartes du jour' in module, 'onglet cartes du jour absent'
    assert 'Marges' in module, 'onglet marges absent'
    assert 'data:image/png;base64,' in module, 'icônes non embarquées'
    assert '<style>' in module, 'CSS non inclus'
    assert '<link rel="stylesheet"' not in module, 'CSS externe restant'
    print('[ok] site.js : build 11.2 conservé + module social + '
          'addon carte (bundle %d Ko)' % (len(js) // 1024))


def check_zip(apk_path: str, orig_path: str) -> None:
    a = set(zipfile.ZipFile(apk_path).namelist())
    b = set(zipfile.ZipFile(orig_path).namelist())
    sig = {'META-INF/MANIFEST.MF', 'META-INF/CERT.SF', 'META-INF/CERT.RSA'}
    assert (a - b) - sig == set(), \
        'entrées ajoutées inattendues : %s' % ((a - b) - sig)
    assert (b - a) - sig == set(), \
        'entrées supprimées inattendues : %s' % ((b - a) - sig)
    assert sig <= a, 'fichiers de signature v1 absents'
    # les entrées non remplacées doivent être byte à byte identiques
    za = zipfile.ZipFile(apk_path)
    zb = zipfile.ZipFile(orig_path)
    remplacées = {'AndroidManifest.xml', 'assets/site.js'}
    for n in sorted(b - sig):
        if n in remplacées:
            continue
        assert za.read(n) == zb.read(n), 'entrée modifiée : %s' % n
    print('[ok] ZIP : mêmes entrées que l\'original (hors signatures) ; '
          'seuls AndroidManifest.xml et assets/site.js remplacés')


def check_v1(apk_path: str) -> None:
    from verify_apk import check_v1 as _v1
    _v1(apk_path)
    print('[ok] signature v1 (JAR) : digests + signature CMS vérifiés')


def check_v2(apk_path: str) -> None:
    from verify_apk import check_v2 as _v2
    _v2(apk_path)
    print('[ok] signature v2 (APK Signature Scheme) : vérifiée')


def empreintes(apk_path: str) -> None:
    data = open(apk_path, 'rb').read()
    print('[i] SHA-256 APK : %s' % hashlib.sha256(data).hexdigest())
    # certificat depuis la signature v1 (même logique que verify_apk.py)
    from asn1crypto import cms
    cert = zipfile.ZipFile(apk_path).read('META-INF/CERT.RSA')
    c = cms.ContentInfo.load(cert)['content']['certificates'][0].chosen
    print('[i] certificat : %s' % c.subject.human_friendly)
    print('[i] Certificat SHA-256 : %s'
          % hashlib.sha256(c.dump()).hexdigest())


def main() -> None:
    if len(sys.argv) not in (3, 5):
        print(__doc__)
        sys.exit(1)
    out, orig = sys.argv[1], sys.argv[2]
    version_name = sys.argv[3] if len(sys.argv) == 5 else '11.3'
    version_code = sys.argv[4] if len(sys.argv) == 5 else '18'
    check_manifest(out, version_name, version_code)
    check_dex_unchanged(out, orig)
    check_site_js(out)
    check_zip(out, orig)
    check_v1(out)
    check_v2(out)
    empreintes(out)
    print('\n==== APK unifié %s : TOUTES LES VÉRIFICATIONS PASSENT ====\n'
          % version_name)


if __name__ == '__main__':
    main()
