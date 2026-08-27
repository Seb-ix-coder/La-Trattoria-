#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
sign_v2.py — Signature APK Signature Scheme v2 de l'APK durci
==============================================================

Insère le bloc « APK Signing Block » (schéma v2, requis sur Android 7+
et OBLIGATOIRE sur Android 11+ pour les APK ciblant API 30+) puis
corrige l'offset du Central Directory dans l'EOCD.

Algorithme (conforme à la spécification AOSP « APK Signature Scheme v2 »)
-------------------------------------------------------------------------
1. L'APK est découpé en sections :
     Section 1 : contenu des entrées ZIP (0 → début du bloc de signature)
     Section 2 : le bloc de signature lui-même (EXCLU des digests)
     Section 3 : Central Directory (cd_offset → eocd_offset)
     Section 4 : EOCD, avec le champ « offset du Central Directory »
                 corrigé pour pointer sur le début du bloc (sb_offset)
2. Chaque section est découpée en chunks de 1 Mio :
     chunk_digest = SHA-256(0xA5 || uint32_le(len(chunk)) || chunk)
   Tous les chunk digests (sections 1, 3, 4, dans l'ordre) sont combinés :
     digest = SHA-256(0x5A || uint32_le(nb_chunks) || concat(chunk_digests))
   -> UN digest unique par algorithme (0x0103 : RSA-PKCS#1 v1.5 + SHA-256).
3. Le « signed data » contient ce digest, le certificat X.509 et des
   attributs additionnels vides ; il est signé en RSA-PKCS#1 v1.5/SHA-256.
4. Le bloc est inséré juste avant le Central Directory ; l'EOCD voit son
   offset de CD décalé de la taille du bloc.

Le format du bloc (taille = longueur totale − 8, magic « APK Sig Block 42 »,
paire id 0x7109871A) est vérifié indépendamment par apksigtool dans
verify_apk.py.

Usage :
  python3 sign_v2.py apk_v1.apk keystore.p12 password out.apk
"""

import hashlib
import struct
import sys

from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.serialization import pkcs12
from cryptography.hazmat.primitives.asymmetric import padding

# Identifiant de l'algorithme de signature (AOSP) :
#   0x0103 = RSASSA-PKCS1-v1_5 avec SHA-256, contenu digéré en chunks de 1 Mio
SIG_ALG_ID = 0x0103
# Identifiant de la paire du bloc de signature v2
V2_BLOCK_ID = 0x7109871A
# Identifiant du bloc de padding verity (alignement à 4096 octets,
# comme le fait apksigner) — requis pour la vérification d'APK
# (fs-verity) sur Android 11+ et inoffensif sur les versions antérieures.
VERITY_PADDING_BLOCK_ID = 0x42726577
MAGIC = b'APK Sig Block 42'
CHUNK_SIZE = 1 << 20          # 1 Mio
DIGEST_SIZE = 32              # SHA-256


# ---------------------------------------------------------------------------
#  Digests du contenu (chunkés, conformes AOSP)
# ---------------------------------------------------------------------------
def _chunks(data: bytes, size: int):
    for i in range(0, len(data), size):
        yield data[i:i + size]


def _chunk_digest(chunk: bytes, md=hashlib.sha256) -> bytes:
    """Digest d'un chunk : SHA-256(0xA5 || uint32_le(len) || chunk)."""
    return md(b'\xA5' + struct.pack('<I', len(chunk)) + chunk).digest()


def _top_digest(chunk_digests) -> bytes:
    """Combinaison : SHA-256(0x5A || uint32_le(n) || concat(digests))."""
    return hashlib.sha256(
        b'\x5A' + struct.pack('<I', len(chunk_digests)) + b''.join(chunk_digests)
    ).digest()


def compute_content_digest(apk: bytes, sb_offset: int, cd_offset: int,
                           eocd_offset: int) -> bytes:
    """Digest combiné des sections 1, 3 et 4 (EOCD corrigé)."""
    digests = []
    # Section 1 : [0, sb_offset)
    for chunk in _chunks(apk[:sb_offset], CHUNK_SIZE):
        digests.append(_chunk_digest(chunk))
    # Section 3 : Central Directory [cd_offset, eocd_offset)
    for chunk in _chunks(apk[cd_offset:eocd_offset], CHUNK_SIZE):
        digests.append(_chunk_digest(chunk))
    # Section 4 : EOCD avec offset du CD pointant sur sb_offset
    eocd = bytearray(apk[eocd_offset:])
    eocd[16:20] = struct.pack('<I', sb_offset)
    for chunk in _chunks(bytes(eocd), CHUNK_SIZE):
        digests.append(_chunk_digest(chunk))
    return _top_digest(digests)


# ---------------------------------------------------------------------------
#  Sérialisation (tous les entiers en little-endian)
# ---------------------------------------------------------------------------
def _lp(data: bytes) -> bytes:
    """Préfixe de longueur : uint32_le(len) || data."""
    return struct.pack('<I', len(data)) + data


def build_v2_block(signed_data: bytes, signature: bytes, cert_der: bytes,
                   spki_der: bytes) -> bytes:
    """Construit la valeur de la paire v2 puis le bloc complet."""
    # -- signed data : digests || certificats || attributs additionnels
    digest_entry = _lp(
        struct.pack('<I', SIG_ALG_ID) + struct.pack('<I', DIGEST_SIZE)
        + signed_data['digest']
    )
    digests_field = _lp(digest_entry)
    certs_field = _lp(_lp(cert_der))
    attrs_field = _lp(b'')                       # aucun attribut additionnel
    signed_data_bytes = digests_field + certs_field + attrs_field

    # -- signer : signed data || signatures || clé publique
    sig_entry = _lp(
        struct.pack('<I', SIG_ALG_ID) + struct.pack('<I', len(signature))
        + signature
    )
    signer = _lp(signed_data_bytes) + _lp(sig_entry) + _lp(spki_der)

    # -- valeur de la paire v2 : séquence de signers.
    # Format AOSP : [uint32 longueur totale de la séquence][pour chaque
    # signer : uint32 longueur du signer + signer]. Le préfixe de longueur
    # PAR signer est obligatoire (vérifié contre un bloc produit par
    # apksigner) : sans lui, le parseur Android découperait mal le signer.
    signers_sequence = _lp(signer)
    v2_value = _lp(signers_sequence)

    # -- paire v2 : [uint64 (valeur + 4)][uint32 id][valeur]
    #    (la longueur inclut l'ID, cf. AOSP `pairSize - 4`).
    pair = struct.pack('<Q', len(v2_value) + 4) \
        + struct.pack('<I', V2_BLOCK_ID) + v2_value

    # -- paire de padding verity : on complète le bloc pour que sa taille
    #    totale soit un multiple de 4096 (comportement d'apksigner).
    #    Valeur = octets nuls ; longueur incluant l'ID (+4).
    base_total = 8 + len(pair) + 8 + len(MAGIC)
    pad_total = (4096 - (base_total % 4096)) % 4096
    if pad_total >= 12:
        pad_value_len = pad_total - 12
    else:
        pad_value_len = pad_total + 4096 - 12
    pad_pair = struct.pack('<Q', pad_value_len + 4) \
        + struct.pack('<I', VERITY_PADDING_BLOCK_ID) \
        + b'\x00' * pad_value_len

    # -- bloc final : size || paires || size || magic
    total = 8 + len(pair) + len(pad_pair) + 8 + len(MAGIC)
    assert total % 4096 == 0, 'bloc non aligné à 4096 (%d)' % total
    size_field = struct.pack('<Q', total - 8)
    block = size_field + pair + pad_pair + size_field + MAGIC
    assert len(block) == total
    return block


# ---------------------------------------------------------------------------
#  Signature
# ---------------------------------------------------------------------------
def sign(src_apk: str, p12_path: str, password: str, dst_apk: str) -> None:
    with open(p12_path, 'rb') as f:
        p12 = f.read()
    key, cert, _ = pkcs12.load_key_and_certificates(
        p12, password.encode('utf-8')
    )
    cert_der = cert.public_bytes(serialization.Encoding.DER)
    spki_der = key.public_key().public_bytes(
        serialization.Encoding.DER,
        serialization.PublicFormat.SubjectPublicKeyInfo,
    )

    apk = open(src_apk, 'rb').read()

    # -- structure ZIP
    eocd_off = apk.rfind(b'PK\x05\x06')
    if eocd_off < 0:
        raise RuntimeError('EOCD introuvable')
    cd_off = struct.unpack_from('<I', apk, eocd_off + 16)[0]

    # -- la taille du bloc est connue AVANT le digest (RSA-2048 : 256 octets,
    #    digest : 32, cert/SPKI : fixes) : on construit un brouillon.
    signed_data_placeholder = {'digest': b'\x00' * DIGEST_SIZE}
    placeholder_sig = b'\x00' * 256
    block_draft = build_v2_block(signed_data_placeholder, placeholder_sig,
                                 cert_der, spki_der)
    sb_offset = cd_off                     # le bloc s'insère avant le CD

    # NB : aucune contrainte d'alignement sur le bloc v2 (le paire de
    # "padding" 0xff8 que l'on voit chez apksigner n'est là que pour aligner
    # le bloc sur 4096 octets en vue de fs-verity — facultatif ici).

    # -- digest réel du contenu (sections 1, 3, 4)
    digest = compute_content_digest(apk, sb_offset, cd_off, eocd_off)

    # -- signed data + signature
    signed_data = {'digest': digest}
    # Le "signed data" est l'assemblage exact digests+certs+attrs :
    digest_entry = _lp(
        struct.pack('<I', SIG_ALG_ID) + struct.pack('<I', DIGEST_SIZE) + digest
    )
    digests_field = _lp(digest_entry)
    certs_field = _lp(_lp(cert_der))
    attrs_field = _lp(b'')
    signed_data_bytes = digests_field + certs_field + attrs_field
    signature = key.sign(signed_data_bytes, padding.PKCS1v15(), hashes.SHA256())

    # -- bloc final (sa taille doit être identique au brouillon)
    block = build_v2_block(signed_data, signature, cert_der, spki_der)
    if len(block) != len(block_draft):
        raise RuntimeError('taille de bloc inattendue')

    # -- insertion du bloc avant le CD + correction de l'EOCD
    out = apk[:cd_off] + block + apk[cd_off:eocd_off] \
        + apk[eocd_off:eocd_off + 16] \
        + struct.pack('<I', cd_off + len(block)) + apk[eocd_off + 20:]
    open(dst_apk, 'wb').write(out)
    print('[v2] bloc de signature inséré (%d octets), EOCD corrigé'
          % len(block))
    print('[ok] APK signé v1+v2 écrit : %s' % dst_apk)


def main() -> None:
    if len(sys.argv) != 5:
        print(__doc__)
        sys.exit(1)
    sign(*sys.argv[1:5])


if __name__ == '__main__':
    main()
