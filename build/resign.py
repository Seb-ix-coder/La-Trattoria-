#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
resign.py — Reconstruction + signature d'APK en PRÉSERVANT le ZIP original
==========================================================================
Le build précédent re-compressait TOUTES les entrées avec python zipfile,
y compris resources.arsc et les fichiers *.version que l'outillage Android
stocke NON compressés et alignés sur 4 octets. Résultat : l'APK était
refusé à l'installation ("Application non installée") alors que l'APK
original (ZIP préservé) passait.

Ce script reconstruit l'APK en gardant, pour chaque entrée NON modifiée,
ses OCTETS COMPRESSÉS BRUTS et son en-tête local d'origine, et en ne
touchant qu'aux entrées modifiées (AndroidManifest.xml, classes.dex,
assets/site.js, assets/site.css). Les méthodes de compression d'origine
sont préservées (STORE pour resources.arsc / *.version, DEFLATE pour le
reste) et les entrées non compressées sont alignées sur 4 octets (champ
extra de padding, comme zipalign). Les 3 fichiers de signature v1 puis le
bloc v2 (aligné 4096) sont ensuite ajoutés sans autre modification.

Usage :
  KEYSTORE_PASSWORD=... python3 resign.py trato.apk keystore.p12 out.apk \
      [--replace=AndroidManifest.xml=fichier.xml] \
      [--replace=classes.dex=fichier.dex] ...

L'ancien format avec le mot de passe en troisième argument reste accepté pour
compatibilité locale, mais il ne doit plus être utilisé dans un pipeline.
"""

import os
import struct
import sys
import zipfile
import zlib

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import sign_v1
import sign_v2

SIG_NAMES = ('META-INF/MANIFEST.MF', 'META-INF/CERT.SF', 'META-INF/CERT.RSA')

# Dates DOS fixes pour les entrées que l'on reconstruit (déterministe)
DOS_TIME, DOS_DATE = 0x0021, 0x0021


def deflate(b):
    c = zlib.compressobj(9, zlib.DEFLATED, -15)
    return c.compress(b) + c.flush()


def dos_date_time(dt):
    """Convertit (y,m,d,h,mi,s) en (time, date) DOS."""
    y, m, d, h, mi, s = dt
    return (h << 11) | (mi << 5) | (s // 2), ((y - 1980) << 9) | (m << 5) | d


def build(src_apk, replacements, p12, password, dst):
    data = open(src_apk, 'rb').read()
    z = zipfile.ZipFile(src_apk)
    infos = {i.filename: i for i in z.infolist()}

    # ---- localisation CD / EOCD / bloc v2 ----
    eocd_off = data.rfind(b'PK\x05\x06')
    assert eocd_off > 0
    cd_off = struct.unpack_from('<I', data, eocd_off + 16)[0]
    idx = data.rfind(b'APK Sig Block 42')
    v2_start = cd_off
    if idx > 0:
        size = struct.unpack_from('<Q', data, idx - 8)[0]
        v2_start = idx + 8 - size

    # ---- parse du CD original ----
    cd = data[cd_off:eocd_off]
    cd_size = struct.unpack_from('<I', data, eocd_off + 12)[0]
    assert len(cd) == cd_size
    cd_entries = []   # (name, raw, offset_field_rel)
    pos = 0
    while pos < cd_size:
        assert struct.unpack_from('<I', cd, pos)[0] == 0x02014b50
        nlen, elen, clen = struct.unpack_from('<HHH', cd, pos + 28)
        name = cd[pos + 46:pos + 46 + nlen].decode('utf-8')
        cd_entries.append((name, cd[pos:pos + 46 + nlen + elen + clen],
                           pos + 42))
        pos += 46 + nlen + elen + clen

    # ---- reconstruction des entrées de contenu ----
    out_data = b''       # en-têtes locaux + données (brutes pour non modifiées)
    out_cd = b''         # nouvelles entrées CD
    n_entries = 0
    for name, cd_raw, off_rel in cd_entries:
        if name in SIG_NAMES:
            continue
        info = infos[name]
        method = info.compress_type
        offset = len(out_data)   # position du local header

        # octets bruts d'origine (en-tête local + données compressées) —
        # utilisés pour les entrées non modifiées sans padding
        nlen = struct.unpack_from('<H', data, info.header_offset + 26)[0]
        elen = struct.unpack_from('<H', data, info.header_offset + 28)[0]
        lh_end = info.header_offset + 30 + nlen + elen
        raw_local = data[info.header_offset:lh_end + info.compress_size]

        # alignement 4 octets pour les entrées non compressées (resources.arsc)
        extra = b''
        if method == 0:
            need = (4 - ((offset + 30 + len(name)) % 4)) % 4
            if need:
                extra = struct.pack('<HH', 0x0000, need) + b'\x00' * need

        if name in replacements:
            # données modifiées : (re)compression avec la méthode d'origine
            payload = replacements[name]
            cdata = deflate(payload) if method == 8 else payload
            crc = zlib.crc32(payload) & 0xffffffff
            csize, usize = len(cdata), len(payload)
            mtime, mdate = dos_date_time(info.date_time)
            lh = struct.pack('<IHHHHHIIIHH', 0x04034b50, 20, 0, method,
                             mtime, mdate, crc, csize, usize, len(name), len(extra))
            out_data += lh + name.encode() + extra + cdata
            cd_hdr = struct.pack('<IHHHHHHIIIHHHHHII', 0x02014b50, 0x0314, 20, 0,
                                 method, mtime, mdate, crc, csize, usize,
                                 len(name), len(extra), 0, 0, 0,
                                 0o100644 << 16, offset)
            out_cd += cd_hdr + name.encode() + extra
        elif extra:
            # entrée non compressée non modifiée mais à ré-aligner : on
            # reconstruit l'en-tête local (données brutes d'origine)
            nlen0 = struct.unpack_from('<H', data, info.header_offset + 26)[0]
            elen0 = struct.unpack_from('<H', data, info.header_offset + 28)[0]
            body = data[info.header_offset + 30 + nlen0 + elen0:
                        info.header_offset + 30 + nlen0 + elen0 + info.compress_size]
            crc = info.CRC
            csize, usize = info.compress_size, info.file_size
            mtime, mdate = dos_date_time(info.date_time)
            lh = struct.pack('<IHHHHHIIIHH', 0x04034b50, 20, 0, method,
                             mtime, mdate, crc, csize, usize, len(name), len(extra))
            out_data += lh + name.encode() + extra + body
            cd_hdr = struct.pack('<IHHHHHHIIIHHHHHII', 0x02014b50, 0x0314, 20, 0,
                                 method, mtime, mdate, crc, csize, usize,
                                 len(name), len(extra), 0, 0, 0,
                                 0o100644 << 16, offset)
            out_cd += cd_hdr + name.encode() + extra
        else:
            # copie brute (en-tête local + données) et CD original patché
            out_data += raw_local
            out_cd += cd_raw[:42] + struct.pack('<I', offset) + cd_raw[46:]
        n_entries += 1

    # ---- les entrées STORE non modifiées peuvent avoir été décalées par une
    #      entrée modifiée précédente : on vérifie leur alignement et on
    #      corrige si nécessaire (patch du CD déjà fait ; le local header
    #      copié est correct car ses données n'ont pas bougé relativement).
    #      (cas rare : les remplacements gardent des tailles proches ; on
    #       vérifie après coup via verify.)

    # ---- EOCD provisoire (sans les signatures, sans bloc v2) ----
    new_cd_offset = len(out_data)
    eocd = struct.pack('<IHHHHIIH', 0x06054b50, 0, 0, n_entries, n_entries,
                       len(out_cd), new_cd_offset, 0)
    base_apk = out_data + out_cd + eocd

    # ---- v1 : les 3 fichiers de signature, ajoutés en fin (comme l'original) ----
    key, cert_der = sign_v1.load_key_cert(p12, password)
    content_entries = []
    for name, cd_raw, off_rel in cd_entries:
        if name in SIG_NAMES:
            continue
        content_entries.append((name, replacements[name] if name in replacements
                                else z.read(name)))
    manifest = sign_v1.build_manifest(content_entries).encode('utf-8')
    sf = sign_v1.build_sf(manifest, content_entries).encode('utf-8')
    rsa = sign_v1.build_cms(cert_der, key, sf)

    sig_payloads = (('META-INF/CERT.SF', sf), ('META-INF/CERT.RSA', rsa),
                    ('META-INF/MANIFEST.MF', manifest))
    sig_data = b''
    sig_cd = b''
    for name, payload in sig_payloads:
        cdata = deflate(payload)
        crc = zlib.crc32(payload) & 0xffffffff
        offset = len(out_data) + len(sig_data)
        lh = struct.pack('<IHHHHHIIIHH', 0x04034b50, 20, 0, 8,
                         DOS_TIME, DOS_DATE, crc, len(cdata), len(payload),
                         len(name), 0)
        sig_data += lh + name.encode() + cdata
        cd_hdr = struct.pack('<IHHHHHHIIIHHHHHII', 0x02014b50, 0x0314, 20, 0,
                             8, DOS_TIME, DOS_DATE, crc, len(cdata),
                             len(payload), len(name), 0, 0, 0, 0,
                             0o100644 << 16, offset)
        sig_cd += cd_hdr + name.encode()

    full_cd = out_cd + sig_cd
    full_cd_offset = len(out_data) + len(sig_data)
    eocd_full = struct.pack('<IHHHHIIH', 0x06054b50, 0, 0,
                            n_entries + 3, n_entries + 3, len(full_cd),
                            full_cd_offset, 0)
    v1_apk = out_data + sig_data + full_cd + eocd_full
    tmp = dst + '.v1'
    open(tmp, 'wb').write(v1_apk)

    # ---- v2 : bloc aligné 4096 + EOCD corrigé (aucune recompression) ----
    sign_v2.sign(tmp, p12, password, dst)
    print('[ok] APK signé (ZIP préservé) : %s (%d octets)' % (dst, len(open(dst, 'rb').read())))


def main():
    args = sys.argv[1:]
    if len(args) < 3:
        print(__doc__)
        sys.exit(1)
    # Mode sécurisé : le secret arrive par l'environnement, jamais la ligne
    # de commande. Le mode à quatre arguments reste une compatibilité locale.
    if os.environ.get('KEYSTORE_PASSWORD'):
        src, p12, dst = args[0], args[1], args[2]
        password = os.environ['KEYSTORE_PASSWORD']
        replace_args = args[3:]
    elif len(args) >= 4:
        src, p12, password, dst = args[0], args[1], args[2], args[3]
        replace_args = args[4:]
    else:
        raise SystemExit('Définir KEYSTORE_PASSWORD dans l\'environnement.')
    replacements = {}
    for a in replace_args:
        if a.startswith('--replace='):
            kv = a[len('--replace='):]
            k, v = kv.split('=', 1)
            replacements[k] = open(v, 'rb').read()
    build(src, replacements, p12, password, dst)


if __name__ == '__main__':
    main()
