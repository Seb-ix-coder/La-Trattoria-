#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
surgical_resign.py — Re-signature « chirurgicale » : préserve 100% du ZIP
=========================================================================
L'APK original (qui s'installe) a ses 3 fichiers de signature (CERT.SF,
CERT.RSA, MANIFEST.MF) en DERNIÈRES entrées du ZIP. On reconstruit donc
l'APK en gardant TOUS les octets d'origine (en-têtes locaux, données,
compression, Central Directory des entrées de contenu) et en ne touchant
qu'à la QUEUE :
  * suppression des 3 anciennes entrées de signature du CD,
  * ajout de mes 3 nouvelles entrées de signature (ordre : SF, RSA, MF),
  * puis signature v2 via sign_v2.py (bloc aligné 4096, EOCD corrigé).

Résultat : un témoin dont le ZIP est STRICTEMENT identique à l'original
(seule la signature change). S'il ne s'installe pas, le problème est à
100% la signature — pas l'emballage ZIP ni les correctifs.

Usage :
  python3 surgical_resign.py trato.apk keystore.p12 PASSWORD out.apk
"""

import struct
import sys
import zlib

sys.path.insert(0, '/home/user/La-Trattoria-/build')
import sign_v1
import sign_v2

SIG_ORDER = (('META-INF/CERT.SF', None), ('META-INF/CERT.RSA', None),
             ('META-INF/MANIFEST.MF', None))
SIG_NAMES = {n for n, _ in SIG_ORDER}


def deflate(b):
    c = zlib.compressobj(9, zlib.DEFLATED, -15)
    return c.compress(b) + c.flush()


def main():
    src_apk, p12, password, dst_apk = sys.argv[1:5]
    data = open(src_apk, 'rb').read()

    # ---- localisation du bloc v2 et du CD ----
    eocd_off = data.rfind(b'PK\x05\x06')
    assert eocd_off > 0
    cd_off = struct.unpack_from('<I', data, eocd_off + 16)[0]
    magic = b'APK Sig Block 42'
    idx = data.rfind(magic)
    v2_start, v2_end = cd_off, cd_off
    if idx > 0:
        size = struct.unpack_from('<Q', data, idx - 8)[0]
        v2_start = idx + 8 - size
        v2_end = idx + 16
        assert v2_end == cd_off
    content = data[:v2_start]          # toutes les entrées de contenu, intactes

    # ---- parse du CD actuel ----
    cd = data[cd_off:eocd_off]
    cd_size = struct.unpack_from('<I', data, eocd_off + 12)[0]
    assert len(cd) == cd_size
    entries = []
    pos = 0
    while pos < cd_size:
        assert struct.unpack_from('<I', cd, pos)[0] == 0x02014b50
        nlen, elen, clen = struct.unpack_from('<HHH', cd, pos + 28)
        name = cd[pos + 46:pos + 46 + nlen].decode('utf-8')
        entries.append((name, cd[pos:pos + 46 + nlen + elen + clen]))
        pos += 46 + nlen + elen + clen

    kept = [e for e in entries if e[0] not in SIG_NAMES]
    assert len(entries) - len(kept) == 3

    # ---- v1 : génère mes 3 fichiers de signature sur CE contenu ----
    key, cert_der = sign_v1.load_key_cert(p12, password)
    payloads = {}
    # entrées du contenu (hors META-INF de signature)
    z = __import__('zipfile').ZipFile(src_apk)
    content_entries = [(i.filename, z.read(i.filename))
                       for i in z.infolist()
                       if i.filename not in SIG_NAMES]
    manifest = sign_v1.build_manifest(content_entries).encode('utf-8')
    sf = sign_v1.build_sf(manifest, content_entries).encode('utf-8')
    rsa = sign_v1.build_cms(cert_der, key, sf)
    payloads['META-INF/CERT.SF'] = sf
    payloads['META-INF/CERT.RSA'] = rsa
    payloads['META-INF/MANIFEST.MF'] = manifest

    # ---- nouvelles entrées de signature (déflatées) ----
    sig_entries_data = b''
    sig_cd_entries = b''
    base = len(content)
    for name, _ in SIG_ORDER:
        payload = payloads[name]
        cdata = deflate(payload)
        crc = zlib.crc32(payload) & 0xffffffff
        # en-tête local (30 octets, flags=0 → tailles connues d'avance)
        lh = struct.pack('<IHHHHHIIIHH', 0x04034b50, 20, 0, 8, 0x0021, 0x0021,
                         crc, len(cdata), len(payload), len(name), 0)
        sig_entries_data += lh + name.encode() + cdata
        # entrée CD (46 octets) — version made by 0x0314, attrs unix 0644
        cd_hdr = struct.pack('<IHHHHHHIIIHHHHHII', 0x02014b50, 0x0314, 20, 0, 8,
                             0x0021, 0x0021, crc, len(cdata), len(payload),
                             len(name), 0, 0, 0, 0, 0o100644 << 16, base)
        sig_cd_entries += cd_hdr + name.encode()
        base += 30 + len(name) + len(cdata)

    # ---- assemblage sans bloc v2 ----
    new_cd = b''.join(e[1] for e in kept) + sig_cd_entries
    new_cd_offset = len(content) + len(sig_entries_data)
    eocd = struct.pack('<IHHHHIIH', 0x06054b50, 0, 0,
                       len(kept) + 3, len(kept) + 3, len(new_cd),
                       new_cd_offset, 0)
    unsigned = content + sig_entries_data + new_cd + eocd
    tmp = dst_apk + '.unsigned'
    open(tmp, 'wb').write(unsigned)

    # ---- v2 (réutilise sign_v2.sign : bloc aligné 4096 + EOCD corrigé) ----
    sign_v2.sign(tmp, p12, password, dst_apk)
    print('[ok] témoin chirurgical : %s' % dst_apk)


if __name__ == '__main__':
    main()
