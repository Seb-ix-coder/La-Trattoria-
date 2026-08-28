#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Vérification indépendante de l'APK native unifiée 1.4.

Ce vérificateur refuse une archive qui aurait simplement reçu le DEX de
``com.trattoria.commande`` : le package, l'activité et la classe native
``com.trattoria.cartes.MainActivity`` sont contrôlés séparément.
"""
from __future__ import annotations

import hashlib
import os
import subprocess
import sys
import zipfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
EXPECTED_PACKAGE = "com.trattoria.cartes"
EXPECTED_ACTIVITY = "com.trattoria.cartes.MainActivity"
EXPECTED_NAME = "1.4"
EXPECTED_CODE = "5"


def check_manifest(apk: Path) -> None:
    from androguard.core.apk import APK
    a = APK(str(apk))
    assert a.get_package() == EXPECTED_PACKAGE, a.get_package()
    assert a.get_androidversion_name() == EXPECTED_NAME, a.get_androidversion_name()
    assert a.get_androidversion_code() == EXPECTED_CODE, a.get_androidversion_code()
    assert a.get_main_activity() == EXPECTED_ACTIVITY, a.get_main_activity()
    assert a.get_min_sdk_version() == "21", a.get_min_sdk_version()
    assert a.get_target_sdk_version() == "33", a.get_target_sdk_version()
    xml = a.get_android_manifest_xml()
    app = next(x for x in xml.iter() if x.tag.endswith("application"))
    ns = "{http://schemas.android.com/apk/res/android}"
    assert app.get(ns + "allowBackup") == "false"
    print("[ok] manifeste : package, version, activité, SDK et allowBackup")


def check_dex(apk: Path) -> None:
    from androguard.core.dex import DEX
    with zipfile.ZipFile(apk) as z:
        names = set(z.namelist())
        assert "classes.dex" in names
        assert not any(n.startswith("classes2.dex") for n in names), "classes2.dex interdit"
        dex = DEX(z.read("classes.dex"))
    classes = {c.get_name() for c in dex.get_classes()}
    assert "Lcom/trattoria/cartes/MainActivity;" in classes
    assert not any(c.startswith("Lcom/trattoria/commande/") for c in classes)
    print("[ok] DEX : source native cartes recompilée, aucun classes2.dex ni namespace commande")


def check_assets(apk: Path) -> None:
    with zipfile.ZipFile(apk) as z:
        names = set(z.namelist())
        required = {
            "assets/public-shell.html", "assets/unified-client.css",
            "assets/unified-rating.js", "assets/site.js", "assets/site.css",
            "assets/community.html", "assets/community.css",
        }
        assert required <= names, sorted(required - names)
        shell = z.read("assets/public-shell.html").decode("utf-8")
        js = z.read("assets/site.js").decode("utf-8")
        css = z.read("assets/site.css").decode("utf-8")
        rating = z.read("assets/unified-rating.js").decode("utf-8")
        for value in ("lt-search", "Accueil", "Salle", "Cartes", "Communication", "Administration", "rating-form", "Aucun avis vérifié"):
            assert value in shell, value
        for value in ("TrattoriaQR", "Pourboire numérique", "Mode de paiement prévu", "Cartes de fidélité", "Modes App", "APK Premium header"):
            assert value in js, value
        assert "overflow-x:auto" in css
        for value in ("/api/public/auth", "/api/public/rating", "plat_id", "note", "achat"):
            assert value in rating, value
        print("[ok] assets : shell public, header premium, recherche, paiement, fidélité, QR et notation")


def check_zip(apk: Path) -> None:
    with zipfile.ZipFile(apk) as z:
        assert z.testzip() is None
        assert {"META-INF/MANIFEST.MF", "META-INF/CERT.SF", "META-INF/CERT.RSA"} <= set(z.namelist())
    sys.path.insert(0, str(HERE))
    import verify_apk
    verify_apk.check_v1(str(apk))
    verify_apk.check_v2(str(apk))
    print("[ok] ZIP + signatures v1/v2 : intégrité vérifiée")


def check_aapt(apk: Path) -> None:
    tool = ROOT / "build/native-tools/aapt2-x64"
    if not tool.exists():
        print("[info] aapt2-x64 absent : contrôle badging non exécuté")
        return
    out = subprocess.check_output([str(tool), "dump", "badging", str(apk)], text=True)
    assert "package: name='com.trattoria.cartes'" in out
    assert "launchable-activity: name='com.trattoria.cartes.MainActivity'" in out
    print("[ok] aapt2 dump badging : package et activité launcher confirmés")


def check_certificate(apk: Path, p12: Path | None) -> None:
    with zipfile.ZipFile(apk) as z:
        from asn1crypto import cms
        cert = cms.ContentInfo.load(z.read("META-INF/CERT.RSA"))["content"]["certificates"][0].chosen
    apk_fp = hashlib.sha256(cert.dump()).hexdigest()
    print("[info] certificat SHA-256 :", apk_fp)
    if p12:
        from cryptography.hazmat.primitives.serialization import pkcs12, Encoding
        password = os.environ.get("TRATTORIA_KEYSTORE_PASSWORD", "")
        key, xcert, _ = pkcs12.load_key_and_certificates(p12.read_bytes(), password.encode())
        assert xcert is not None
        expected = hashlib.sha256(xcert.public_bytes(Encoding.DER)).hexdigest()
        assert apk_fp == expected, "certificat APK différent du keystore fourni"
        print("[ok] certificat APK identique au keystore fourni")


def main() -> int:
    if len(sys.argv) not in (2, 3):
        print("usage: verify_final_apk.py APK [keystore.p12]")
        return 2
    apk = Path(sys.argv[1]).resolve()
    p12 = Path(sys.argv[2]).resolve() if len(sys.argv) == 3 else None
    check_manifest(apk)
    check_dex(apk)
    check_assets(apk)
    check_zip(apk)
    check_aapt(apk)
    check_certificate(apk, p12)
    data = apk.read_bytes()
    print("[info] APK : %d octets" % len(data))
    print("[info] SHA-256 APK : %s" % hashlib.sha256(data).hexdigest())
    print("==== APK unifiée 1.4 : vérifications passées ====")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
