#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
generate_keystore.py — Génération du keystore de signature (PKCS#12)
====================================================================

Crée une paire de clés RSA-2048 + un certificat X.509 auto-signé
(30 ans) et l'empaquette dans un keystore PKCS#12 protégé par mot de
passe.

⚠️  SÉCURITÉ — LIRE AVANT TOUT  ⚠️
----------------------------------
Ce keystore est la clé d'identité de l'application :
  * TOUTES les mises à jour doivent être signées avec la MÊME clé,
    sinon Android refuse l'installation par-dessus l'ancienne version ;
  * quiconque possède ce fichier + le mot de passe peut signer une
    application « La Trattoria » qui s'installera PAR-DESSUS la vôtre.
=> À conserver hors du dépôt Git, dans un endroit sûr (coffre, gestionnaire
   de secrets), avec plusieurs sauvegardes chiffrées.

Le mot de passe est généré aléatoirement et écrit dans le fichier
README-KEYSTORE.txt situé À CÔTÉ du keystore (hors dépôt Git).

Usage :
  python3 generate_keystore.py [répertoire_de_sortie]
"""

import datetime
import os
import secrets
import string
import sys

from cryptography import x509
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.serialization import pkcs12
from cryptography.hazmat.primitives.asymmetric import rsa
from cryptography.x509.oid import NameOID


def generate_keystore(out_dir: str) -> str:
    os.makedirs(out_dir, exist_ok=True)
    key_path = os.path.join(out_dir, 'trattoria-release.p12')
    readme_path = os.path.join(out_dir, 'README-KEYSTORE.txt')

    # -- mot de passe aléatoire (32 caractères)
    alphabet = string.ascii_letters + string.digits
    password = ''.join(secrets.choice(alphabet) for _ in range(32))

    # -- clé RSA-2048
    key = rsa.generate_private_key(public_exponent=65537, key_size=2048)

    # -- certificat auto-signé (30 ans), mêmes informations que l'original
    subject = issuer = x509.Name([
        x509.NameAttribute(NameOID.COUNTRY_NAME, 'FR'),
        x509.NameAttribute(NameOID.LOCALITY_NAME, 'Saintes'),
        x509.NameAttribute(NameOID.ORGANIZATION_NAME, 'La Trattoria'),
        x509.NameAttribute(NameOID.ORGANIZATIONAL_UNIT_NAME, 'Restaurant'),
        x509.NameAttribute(NameOID.COMMON_NAME, 'La Trattoria'),
    ])
    now = datetime.datetime.now(datetime.timezone.utc)
    cert = (
        x509.CertificateBuilder()
        .subject_name(subject)
        .issuer_name(issuer)
        .public_key(key.public_key())
        .serial_number(x509.random_serial_number())
        .not_valid_before(now - datetime.timedelta(days=1))
        .not_valid_after(now + datetime.timedelta(days=30 * 365))
        .add_extension(x509.BasicConstraints(ca=False, path_length=None),
                       critical=True)
        .add_extension(x509.KeyUsage(
            digital_signature=True, key_encipherment=True,
            data_encipherment=False, key_agreement=False,
            key_cert_sign=False, crl_sign=False, content_commitment=False,
            encipher_only=False, decipher_only=False), critical=True)
        .sign(key, hashes.SHA256())
    )

    # -- empaquetage PKCS#12
    p12 = pkcs12.serialize_key_and_certificates(
        name=b'trattoria',
        key=key,
        cert=cert,
        cas=None,
        encryption_algorithm=serialization.BestAvailableEncryption(
            password.encode('utf-8')
        ),
    )
    with open(key_path, 'wb') as f:
        f.write(p12)

    fingerprint = cert.fingerprint(hashes.SHA256()).hex()
    with open(readme_path, 'w', encoding='utf-8') as f:
        f.write(
            'KEYS DE SIGNATURE « LA TRATTORIA » — BUILD DURCI 11.1\n'
            '======================================================\n\n'
            'Fichier   : %s\n'
            'Alias     : trattoria\n'
            'Type      : PKCS#12 (compatible Gradle / apksigner / cet outil)\n'
            'Empreinte SHA-256 du certificat : %s\n\n'
            'MOT DE PASSE DU KEYSTORE :\n%s\n\n'
            '⚠ CONSERVER CES INFORMATIONS HORS DU DÉPÔT GIT.\n'
            'Toute mise à jour de l\'application DOIT être signée avec cette\n'
            'même clé. Perdre ce fichier = impossible de mettre à jour sans\n'
            'désinstaller/réinstaller (et donc perdre les données).\n'
            'Pour le pipeline GitHub Actions, encoder le fichier en base64 :\n'
            '  base64 -w0 trattoria-release.p12   (ou : cat ... | base64)\n'
            'et le placer dans le secret KEYSTORE_BASE64 ; le mot de passe\n'
            'dans le secret KEYSTORE_PASSWORD.\n'
            % (key_path, fingerprint, password)
        )
    os.chmod(readme_path, 0o600)
    os.chmod(key_path, 0o600)
    print('[ok] keystore généré : %s' % key_path)
    print('[ok] mot de passe + empreinte : %s' % readme_path)
    return key_path


def main() -> None:
    out_dir = sys.argv[1] if len(sys.argv) > 1 else (
        os.path.join(os.path.expanduser('~'), 'trattoria-keystore')
    )
    generate_keystore(out_dir)


if __name__ == '__main__':
    main()
