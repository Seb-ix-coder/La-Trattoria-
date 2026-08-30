#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
generate_keystore.py — Génération du keystore de signature (PKCS#12)
====================================================================

Crée une paire de clés RSA-2048 + un certificat X.509 auto-signé
(30 ans) et l'empaquette dans un keystore PKCS#12 protégé par mot de
passe.

Le mot de passe n'est jamais écrit dans un fichier. Pour une génération
interactive, le script l'affiche une seule fois sur stdout ; le pipeline
`run_build*.sh` le récupère immédiatement dans une variable d'environnement.
Pour fournir une valeur choisie, définir `KEYSTORE_PASSWORD` avant l'appel.

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


def generate_keystore(out_dir: str) -> tuple[str, str]:
    os.makedirs(out_dir, mode=0o700, exist_ok=True)
    os.chmod(out_dir, 0o700)
    key_path = os.path.join(out_dir, 'trattoria-release.p12')

    # -- mot de passe choisi par le coffre ou généré une fois
    password = os.environ.get('KEYSTORE_PASSWORD', '')
    if not password:
        alphabet = string.ascii_letters + string.digits
        password = ''.join(secrets.choice(alphabet) for _ in range(32))
    if len(password) < 16:
        raise ValueError('KEYSTORE_PASSWORD doit contenir au moins 16 caractères')

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
        .add_extension(
            x509.SubjectKeyIdentifier.from_public_key(key.public_key()),
            critical=False)
        .sign(key, hashes.SHA256())
    )

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
    os.chmod(key_path, 0o600)

    fingerprint = cert.fingerprint(hashes.SHA256()).hex()
    print('[ok] keystore généré : %s' % key_path, file=sys.stderr)
    print('[ok] empreinte SHA-256 : %s' % fingerprint, file=sys.stderr)
    return key_path, password


def main() -> None:
    out_dir = sys.argv[1] if len(sys.argv) > 1 else (
        os.path.join(os.path.expanduser('~'), 'trattoria-keystore')
    )
    _, password = generate_keystore(out_dir)
    # Sortie machine lisible et unique : ne pas ajouter d'autres logs stdout.
    print(password)


if __name__ == '__main__':
    main()
