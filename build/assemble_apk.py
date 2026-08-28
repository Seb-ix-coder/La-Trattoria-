#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
assemble_apk.py — assemble et signe l'application native « Édition des cartes »
Utilise l'outillage maison (sign_v1/sign_v2, keystore figé) + alignement ZIP.
"""
import os
import struct
import sys
import zipfile
import zlib

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

DOSSIER = os.path.join(HERE, 'app-src')
SORTIE = sys.argv[1] if len(sys.argv) > 1 else os.path.join(HERE, '..', 'trato-gestion-1.4.apk')
KEYSTORE = os.path.join(HERE, 'keystore', 'trattoria-release.p12')


def reconstruire(source, sortie):
    """Reconstruit le zip : DEFLATE partout sauf resources.arsc (STORE, aligné 4)."""
    zin = zipfile.ZipFile(source)
    infos = [i for i in zin.infolist() if not i.filename.endswith('/')]
    tampon = bytearray()
    central = bytearray()
    compteur = 0

    for info in infos:
        donnees = zin.read(info.filename)
        store = info.filename == 'resources.arsc'
        methode = 0 if store else 8
        crc = zlib.crc32(donnees) & 0xFFFFFFFF
        if store:
            corps = donnees
        else:
            co = zlib.compressobj(9, zlib.DEFLATED, -15)
            corps = co.compress(donnees) + co.flush()

        noms = info.filename.encode('utf-8')
        # calcul de l'alignement APRÈS écriture du header local (extra field)
        taille_header = 30 + len(noms) + 2  # +2 : placeholder extra len déjà compté ci-dessous
        offset_local = len(tampon)
        besoin = (4 - ((offset_local + 30 + len(noms)) % 4)) % 4 if store else 0
        extra = struct.pack('<HH', 0x0000, besoin) + b'\x00' * besoin if besoin else b''

        # local file header (formats identiques à resign.py, installable)
        tampon += struct.pack('<IHHHHHIIIHH', 0x04034b50, 20, 0, methode, 0, 0x21,
                              crc, len(corps), len(donnees), len(noms), len(extra))
        tampon += noms + extra
        tampon += corps

        central += struct.pack('<IHHHHHHIIIHHHHHII', 0x02014b50, 0x0314, 20, 0, methode, 0, 0x21,
                               crc, len(corps), len(donnees), len(noms), len(extra), 0, 0, 0,
                               0o100644 << 16, offset_local)
        central += noms + extra
        compteur += 1

    eocd = struct.pack('<IHHHHIIH', 0x06054b50, 0, 0, compteur, compteur,
                       len(central), len(tampon), 0)
    with open(sortie, 'wb') as f:
        f.write(tampon + central + eocd)
    # contrôle : resources.arsc aligné
    with zipfile.ZipFile(sortie) as zz:
        for info in zz.infolist():
            if info.filename == 'resources.arsc':
                with open(sortie, 'rb') as f:
                    f.seek(info.header_offset)
                    h = f.read(30)
                    nl, el = struct.unpack_from('<HH', h, 26)
                    pos = info.header_offset + 30 + nl + el
                assert pos % 4 == 0 and info.compress_type == 0, 'resources.arsc : STORE + aligné requis'
    print('[ok] assemblé + aligné (vérification resources.arsc passée)')


def re_assembler(source, sortie, extras):
    """Recopie le zip à l'identique (octets préservés, alignement conservé)
    et ajoute les extras en fin (méthode DEFLATE)."""
    data = open(source, 'rb').read()
    eocd = data.rfind(b'PK\x05\x06')
    n = struct.unpack_from('<H', data, eocd + 10)[0]
    cd_size, cd_off = struct.unpack_from('<II', data, eocd + 12)
    central = data[cd_off:cd_off + cd_size]
    corps = bytearray()
    central_n = bytearray()
    total = 0
    corps += data[:cd_off]
    central_n += central
    for nom, contenu in extras:
        noms = nom.encode('utf-8')
        co = zlib.compressobj(9, zlib.DEFLATED, -15)
        comp = co.compress(contenu) + co.flush()
        crc = zlib.crc32(contenu) & 0xFFFFFFFF
        offset_local = len(corps)
        corps += struct.pack('<IHHHHHIIIHH', 0x04034b50, 20, 0, 8, 0, 0x21,
                             crc, len(comp), len(contenu), len(noms), 0)
        corps += noms + comp
        central_n += struct.pack('<IHHHHHHIIIHHHHHII', 0x02014b50, 0x0314, 20, 0, 8, 0, 0x21,
                                 crc, len(comp), len(contenu), len(noms), 0, 0, 0, 0,
                                 0o100644 << 16, offset_local)
        central_n += noms
        total += 1
    nouveau = corps + central_n + struct.pack('<IHHHHIIH', 0x06054b50, 0, 0,
                                              n + total, n + total,
                                              len(central_n), len(corps), 0)
    open(sortie, 'wb').write(nouveau)


def main():
    base = os.path.join(DOSSIER, 'base.apk')
    dex = os.path.join(DOSSIER, 'dexout', 'classes.dex')
    interm = os.path.join(DOSSIER, 'non-signe.apk')

    # injecter classes.dex dans base.apk
    avec_dex = os.path.join(DOSSIER, 'avec-dex.apk')
    with zipfile.ZipFile(base) as zi, zipfile.ZipFile(avec_dex, 'w', zipfile.ZIP_DEFLATED) as zo:
        for info in zi.infolist():
            zo.writestr(info.filename, zi.read(info.filename))
        zo.writestr('classes.dex', open(dex, 'rb').read())
    print('[ok] classes.dex injecté')

    reconstruire(avec_dex, interm)

    # signature v1 (inline, préserve le ZIP aligné) + v2 (bloc inséré)
    import sign_v1
    import sign_v2
    mot_de_passe = open(os.path.join(HERE, 'keystore', 'MOT_DE_PASSE.txt'),
                        encoding='utf-8').read().split('Mot de passe : ')[1].splitlines()[0].strip()
    key, cert_der = sign_v1.load_key_cert(KEYSTORE, mot_de_passe)
    zin = zipfile.ZipFile(interm)
    entrees = [(i.filename, zin.read(i.filename)) for i in zin.infolist()
               if i.filename not in ('META-INF/MANIFEST.MF', 'META-INF/CERT.SF', 'META-INF/CERT.RSA')]
    manifest = sign_v1.build_manifest(entrees).encode('utf-8')
    sf = sign_v1.build_sf(manifest, entrees).encode('utf-8')
    rsa = sign_v1.build_cms(cert_der, key, sf)

    re_assembler(interm, SORTIE, [
        ('META-INF/MANIFEST.MF', manifest),
        ('META-INF/CERT.SF', sf),
        ('META-INF/CERT.RSA', rsa),
    ])
    sign_v2.sign(SORTIE, KEYSTORE, mot_de_passe, SORTIE)
    print('[ok] signatures v1+v2 appliquées')
    print('[ok] APK final : %s' % SORTIE)


if __name__ == '__main__':
    main()
