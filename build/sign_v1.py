#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
sign_v1.py — Signature JAR (schéma v1) de l'APK durci
======================================================

Ajoute les trois fichiers META-INF requis par la signature v1 (JAR
Signing), compatible Android 5.0 → 14+ :

  * META-INF/MANIFEST.MF  : digests SHA-256 de chaque entrée de l'APK,
  * META-INF/CERT.SF      : digest du manifeste + digest de chaque section,
  * META-INF/CERT.RSA     : signature CMS (PKCS#7) de CERT.SF.

La signature CMS suit le format exact des signataires JAR (RFC 5652) :
attributes signés contenant contentType (id-data) et messageDigest
(SHA-256 de CERT.SF), signature RSA-PKCS#1 v1.5 sur le DER des
attributs (champ signedAttrs avec son tag implicite [0]). On n'inclut
pas de signingTime : la signature est déterministe (reproductible).

Le certificat et la clé privée sont lus depuis un keystore PKCS#12
(cf. run_build.sh pour la génération). La clé est UNIQUE et doit être
conservée précieusement : toute mise à jour de l'application devra être
signée avec la MÊME clé (sinon Android refuse la mise à jour).

Usage :
  python3 sign_v1.py unsigned.apk keystore.p12 password out.apk
"""

import base64
import hashlib
import sys
import zipfile

from asn1crypto import cms, core, x509
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.serialization import pkcs12
from cryptography.hazmat.primitives.asymmetric import padding


# ---------------------------------------------------------------------------
#  Lecture du keystore PKCS#12
# ---------------------------------------------------------------------------
def load_key_cert(p12_path: str, password: str):
    """Retourne (private_key, cert_der)."""
    with open(p12_path, 'rb') as f:
        p12 = f.read()
    key, cert, _ = pkcs12.load_key_and_certificates(
        p12, password.encode('utf-8')
    )
    if key is None or cert is None:
        raise ValueError('keystore sans clé/certificat')
    return key, cert.public_bytes(serialization.Encoding.DER)


# ---------------------------------------------------------------------------
#  Construction du manifeste et du fichier de signature
# ---------------------------------------------------------------------------
def b64w(data: bytes) -> str:
    """Base64 avec retour à la ligne tous les 76 caractères (style JAR)."""
    b = base64.b64encode(data).decode('ascii')
    return '\r\n'.join(b[i:i + 76] for i in range(0, len(b), 76))


def build_manifest(entries) -> str:
    """MANIFEST.MF : une section par entrée (hors META-INF)."""
    lines = ['Manifest-Version: 1.0', 'Created-By: 1.0 (Android)', '']
    for name, data in entries:
        lines.append('Name: %s' % name)
        lines.append('SHA-256-Digest: %s' % b64w(hashlib.sha256(data).digest()))
        lines.append('')
    return '\r\n'.join(lines) + '\r\n'


def build_sf(manifest_bytes: bytes, entries) -> str:
    """CERT.SF : digest du manifeste + digest de chaque section."""
    lines = [
        'Signature-Version: 1.0',
        'Created-By: 1.0 (Android)',
        'SHA-256-Digest-Manifest: %s'
        % b64w(hashlib.sha256(manifest_bytes).digest()),
        '',
    ]
    # digest de chaque section du manifeste (bloc "Name: ..." + ligne vide)
    pos = 0
    for name, _ in entries:
        marker = ('Name: %s\r\n' % name).encode('ascii')
        start = manifest_bytes.find(marker, pos)
        if start < 0:
            raise RuntimeError('section introuvable dans le manifeste : %s' % name)
        # fin de section : double \r\n après la section
        end = manifest_bytes.find(b'\r\n\r\n', start)
        if end < 0:
            raise RuntimeError('fin de section introuvable : %s' % name)
        section = manifest_bytes[start:end + 4]  # inclut la ligne vide
        lines.append('Name: %s' % name)
        lines.append('SHA-256-Digest: %s'
                     % b64w(hashlib.sha256(section).digest()))
        lines.append('')
        pos = end + 4
    return '\r\n'.join(lines) + '\r\n'


# ---------------------------------------------------------------------------
#  Signature CMS (PKCS#7 SignedData) — déterministe
# ---------------------------------------------------------------------------
def build_cms(cert_der: bytes, private_key, content: bytes) -> bytes:
    """CERT.RSA : CMS SignedData sur `content` (le CERT.SF).

    Format identique à celui produit par l'outillage Android officiel
    (vérifié sur trato.apk) : AUCUN attribut signé — la signature RSA
    (PKCS#1 v1.5 + SHA-256) porte directement sur le contenu (CERT.SF),
    avec DigestInfo calculé par l'algorithme de signature. Ce format est
    accepté par la vérification v1 d'Android et de Java (keytool/jarsigner)
    et il est déterministe.
    """
    cert = x509.Certificate.load(cert_der)

    # signature directe du contenu (le DigestInfo est implicite dans
    # l'algorithme RSA-PKCS#1 v1.5 + SHA-256)
    signature = private_key.sign(
        content, padding.PKCS1v15(), hashes.SHA256()
    )

    signer_info = cms.SignerInfo({
        'version': 'v1',
        'sid': cms.SignerIdentifier({
            'issuer_and_serial_number': cms.IssuerAndSerialNumber({
                'issuer': cert.issuer,
                'serial_number': cert.serial_number,
            }),
        }),
        'digest_algorithm': cms.DigestAlgorithm({'algorithm': 'sha256'}),
        'signature_algorithm':
            cms.SignedDigestAlgorithm({'algorithm': 'sha256_rsa'}),
        'signature': signature,
    })
    signed_data = cms.SignedData({
        'version': 'v1',
        'digest_algorithms': cms.DigestAlgorithms([
            cms.DigestAlgorithm({'algorithm': 'sha256'}),
        ]),
        # PKCS#7 : pour une SignedData v1, encap_content_info est un
        # ContentInfo (eContentType = id-data, sans contenu embarqué)
        'encap_content_info': cms.ContentInfo({'content_type': 'data'}),
        'certificates': [cert],
        'signer_infos': [signer_info],
    })
    return cms.ContentInfo({
        'content_type': 'signed_data',
        'content': signed_data,
    }).dump()


# ---------------------------------------------------------------------------
#  Réassemblage : APK + 3 fichiers META-INF
# ---------------------------------------------------------------------------
def sign(src_apk: str, p12_path: str, password: str, dst_apk: str) -> None:
    key, cert_der = load_key_cert(p12_path, password)

    # Fichiers de signature JAR exclus : ils seront régénérés.
    # Les AUTRES entrées META-INF (app-metadata.properties, *.version…)
    # sont conservées : elles font partie du contenu de l'APK.
    V1_SIG = ('META-INF/MANIFEST.MF', 'META-INF/CERT.SF', 'META-INF/CERT.RSA')
    src = zipfile.ZipFile(src_apk)
    entries = [
        (i.filename, src.read(i.filename))
        for i in src.infolist()
        if i.filename not in V1_SIG
    ]

    manifest = build_manifest(entries).encode('utf-8')
    sf = build_sf(manifest, entries).encode('utf-8')
    rsa = build_cms(cert_der, key, sf)

    meta = [
        ('META-INF/MANIFEST.MF', manifest),
        ('META-INF/CERT.SF', sf),
        ('META-INF/CERT.RSA', rsa),
    ]

    with zipfile.ZipFile(dst_apk, 'w', zipfile.ZIP_DEFLATED,
                         compresslevel=9) as out:
        # 1) toutes les entrées d'origine (métadonnées préservées),
        #    à l'exception des anciens fichiers de signature
        for info in src.infolist():
            if info.filename in V1_SIG:
                continue
            zi = zipfile.ZipInfo(info.filename, date_time=info.date_time)
            zi.external_attr = info.external_attr
            zi.create_system = info.create_system
            zi.comment = info.comment
            out.writestr(zi, src.read(info.filename),
                         compress_type=zipfile.ZIP_DEFLATED, compresslevel=9)
        # 2) les fichiers de signature v1
        for name, data in meta:
            zi = zipfile.ZipInfo(name, date_time=(1981, 1, 1, 1, 1, 2))
            zi.external_attr = 0o100644 << 16
            zi.create_system = 3
            out.writestr(zi, data, compress_type=zipfile.ZIP_DEFLATED,
                         compresslevel=9)
            print('[v1] %s (%d octets)' % (name, len(data)))
    src.close()
    print('[ok] APK signé v1 écrit : %s' % dst_apk)


def main() -> None:
    if len(sys.argv) != 5:
        print(__doc__)
        sys.exit(1)
    sign(*sys.argv[1:5])


if __name__ == '__main__':
    main()
