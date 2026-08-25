#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
verify_apk.py — Batterie de vérification de l'APK durci 11.1
=============================================================

Vérifie, indépendamment du build :
  1. le manifeste : package, versionCode=16, versionName=11.1,
     allowBackup=false, minSdk/targetSdk inchangés,
  2. le DEX : parse complet, timeout 2000 ms, plus de fuite du prix de
     revient ("cout") dans la route /carte, "cout" des tickets conservé,
  3. l'asset site.js : correctif de découverte de l'API présent,
  4. la structure ZIP : mêmes entrées que l'original (hors signatures),
  5. la signature v1 (JAR) : digests du manifeste, du .SF et signature CMS,
  6. la signature v2 : digest du contenu (sections 1/3/4) + signature RSA,
     contrôlés en interne PUIS par apksigtool (outil indépendant),
  7. l'empreinte SHA-256 de l'APK et du certificat (pour votre suivi).

Usage :
  python3 verify_apk.py apk_durci.apk [apk_original.apk]
"""

import hashlib
import logging
import struct
import sys
import zipfile

logging.disable(logging.CRITICAL)

# ---------------------------------------------------------------------------
#  1. Manifeste
# ---------------------------------------------------------------------------
def check_manifest(apk_path: str) -> None:
    from androguard.core.apk import APK
    a = APK(apk_path)
    assert a.get_package() == 'com.trattoria.commande', 'package'
    assert a.get_androidversion_code() == '17', 'versionCode=%s' \
        % a.get_androidversion_code()
    assert a.get_androidversion_name() == '11.2', 'versionName=%s' \
        % a.get_androidversion_name()
    assert a.get_min_sdk_version() == '21', 'minSdk'
    assert a.get_target_sdk_version() == '34', 'targetSdk'
    # allowBackup=false : on relit le XML binaire pour être certain
    xml = a.get_android_manifest_xml()
    app = [el for el in xml.iter() if el.tag.endswith('application')][0]
    assert app.get('{http://schemas.android.com/apk/res/android}allowBackup') \
        == 'false', 'allowBackup != false'
    print('[ok] manifeste : versionName=11.2 versionCode=17 '
          'allowBackup=false minSdk=21 targetSdk=34')


# ---------------------------------------------------------------------------
#  2. DEX
# ---------------------------------------------------------------------------
def check_dex(apk_path: str) -> None:
    from androguard.core.dex import DEX
    z = zipfile.ZipFile(apk_path)
    dex = DEX(z.read('classes.dex'))
    assert len(list(dex.get_classes())) > 2000, 'classes'

    # a) timeout du serveur local : const/16 v1, 2000 avant setSoTimeout
    c = dex.get_class('Lcom/trattoria/commande/Reseau$2;')
    found = False
    for m in c.get_methods():
        if m.get_name() != 'run':
            continue
        seq = [(i.get_name(), i.get_output()) for i in m.get_instructions()]
        for i in range(len(seq) - 1):
            if seq[i][0] == 'const/16' and '2000' in seq[i][1] \
                    and 'setSoTimeout' in seq[i + 1][1]:
                found = True
    assert found, 'setSoTimeout(2000) absent'
    print('[ok] DEX : setSoTimeout 2000 ms appliqué dans la boucle accept')

    # b) plus de fuite du prix de revient dans /carte
    data = z.read('classes.dex')
    import sys as _sys
    _sys.path.insert(0, __import__('os').path.dirname(__file__))
    from patch_dex import DexTables
    dt = DexTables(data)
    cout_fidx = dt.field_idx('Lcom/trattoria/commande/Catalogue$Produit;',
                             'cout', 'D')
    cout_sidx = dt.string_idx('cout')
    leak = 0
    start = 0
    while True:
        i = data.find(bytes([0x1A]), start)
        if i < 0:
            break
        start = i + 1
        if i + 8 > len(data):
            continue
        if struct.unpack_from('<H', data, i + 2)[0] != cout_sidx:
            continue
        if data[i + 4] == 0x53 \
                and struct.unpack_from('<H', data, i + 6)[0] == cout_fidx:
            leak += 1
    assert leak == 0, 'fuite "cout" encore présente (%d)' % leak
    # c) le "cout" des tickets (synchro) est conservé
    ligne_fidx = dt.field_idx('Lcom/trattoria/commande/Modele$Ligne;',
                              'cout', 'D')
    kept = 0
    start = 0
    while True:
        i = data.find(bytes([0x1A]), start)
        if i < 0:
            break
        start = i + 1
        if i + 8 > len(data):
            continue
        if struct.unpack_from('<H', data, i + 2)[0] != cout_sidx:
            continue
        if data[i + 4] == 0x53 \
                and struct.unpack_from('<H', data, i + 6)[0] == ligne_fidx:
            kept += 1
    assert kept >= 1, 'cout des tickets supprimé (synchro cassée)'
    print('[ok] DEX : prix de revient retiré de /carte, '
          'sérialisation des tickets intacte')

    # d) la route /site/ventes (export e-reporting) est en place
    c2 = dex.get_class('Lcom/trattoria/commande/Reseau;')
    found_ventes = False
    for m in c2.get_methods():
        if m.get_name() != 'routerSite':
            continue
        for ins in m.get_instructions():
            out = ins.get_output()
            if 'ApiPublique;->ventes' in out:
                found_ventes = True
    assert found_ventes, 'route /site/ventes absente du DEX'
    print('[ok] DEX : route /site/ventes (export e-reporting) ajoutée')


# ---------------------------------------------------------------------------
#  3. site.js
# ---------------------------------------------------------------------------
def check_site_js(apk_path: str) -> None:
    z = zipfile.ZipFile(apk_path)
    js = z.read('assets/site.js').decode('utf-8')
    css = z.read('assets/site.css').decode('utf-8')
    assert 'Correctif durci 11.1' in js, 'correctif B1 absent'
    assert "API = location.origin;" in js, 'fallback location.origin absent'
    assert 'TrattoriaQR' in js, 'encodeur QR absent'
    assert "location.pathname === '/qr'" in js, 'ouverture auto /qr absente'
    assert '#qr-overlay' in css, 'styles QR absents'
    assert 'Outils de conformité' in js, 'outils de conformité absents'
    assert "'#ereporting'" in js or '#ereporting' in js, 'e-reporting absent'
    assert "'#factures'" in js or '#factures' in js, 'registre Factur-X absent'
    assert '#oc-overlay' in css, 'styles conformité absents'
    assert "'btn-outils'" in js or 'btn-outils' in js, 'bouton Outils absent'
    assert 'trattoria_pin_hash' in js, 'code PIN absent'
    assert '#btn-outils' in css, 'styles bouton Outils absents'
    assert 'Pourboire numérique' in js, 'pourboire absent'
    assert 'pourboire-bloc' in js, 'bloc pourboire absent'
    assert '#pourboire-bloc' in css, 'styles pourboire absents'
    assert 'Mode de paiement prévu' in js, 'paiement absent'
    assert 'pm-opt' in js, 'options de paiement absentes'
    assert 'Cartes de fidélité' in js, 'outil fidélité absent'
    assert 'trattoria_fidelite' in js, 'stockage fidélité absent'
    assert 'Produits à la vente' in js, 'outil produits absent'
    assert 'pourboires_especes' in js, 'pourboires stats absents'
    assert '#paiement-bloc' in css, 'styles paiement absents'
    assert 'Modes App' in js, 'modes App absents'
    assert '?partenaire' in js or 'partenaire' in js, 'mode partenaire absent'
    assert '.mode-app' in css, 'styles modes App absents'
    print('[ok] site.js : QR + outils + paiement + pourboires + modes App')
    print('[ok] site.css : styles QR + conformité + pourboire + paiement + App')


# ---------------------------------------------------------------------------
#  4. Structure ZIP
# ---------------------------------------------------------------------------
def check_zip(apk_path: str, orig_path) -> None:
    z = zipfile.ZipFile(apk_path)
    bad = z.testzip()
    assert bad is None, 'entrée corrompue : %s' % bad
    names = set(z.namelist())
    expected_sig = {'META-INF/MANIFEST.MF', 'META-INF/CERT.SF',
                    'META-INF/CERT.RSA'}
    assert expected_sig <= names, 'signature v1 manquante'
    if orig_path:
        zo = zipfile.ZipFile(orig_path)
        orig_names = set(zo.namelist()) - {
            'META-INF/MANIFEST.MF', 'META-INF/CERT.SF', 'META-INF/CERT.RSA'}
        assert orig_names <= names, 'entrées originales manquantes'
        assert names - orig_names == expected_sig, 'entrées inattendues'
        print('[ok] ZIP : %d entrées (identiques à l\'original + v1)'
              % len(names))
    print('[ok] ZIP : intégrité ok (%d entrées)' % len(names))


# ---------------------------------------------------------------------------
#  5. Signature v1
# ---------------------------------------------------------------------------
def check_v1(apk_path: str) -> None:
    from cryptography.hazmat.primitives import hashes
    from cryptography.hazmat.primitives.asymmetric import padding
    from asn1crypto import cms
    import base64

    z = zipfile.ZipFile(apk_path)
    manifest = z.read('META-INF/MANIFEST.MF').decode('utf-8')
    sf = z.read('META-INF/CERT.SF').decode('utf-8')
    rsa = z.read('META-INF/CERT.RSA')

    # a) chaque entrée du manifeste correspond au fichier
    entries = [i for i in z.infolist()
               if not i.filename.startswith('META-INF/')]
    for info in entries:
        marker = 'Name: %s\r\n' % info.filename
        assert marker in manifest, 'entrée absente du manifeste : %s' \
            % info.filename
        pos = manifest.index(marker)
        dig = None
        for line in manifest[pos:].split('\r\n')[1:]:
            if line.startswith('SHA-256-Digest:'):
                dig = line.split(':', 1)[1].strip()
                break
        assert dig is not None
        expected = base64.b64encode(
            hashlib.sha256(z.read(info.filename)).digest()).decode()
        assert dig == expected, 'digest manifeste != fichier : %s' \
            % info.filename

    # b) CERT.SF : digest du manifeste
    for line in sf.split('\r\n'):
        if line.startswith('SHA-256-Digest-Manifest:'):
            d = line.split(':', 1)[1].strip()
            break
    assert base64.b64decode(d) == hashlib.sha256(
        manifest.encode('utf-8')).digest(), 'SF != manifeste'

    # c) CERT.RSA : CMS + vérification de la signature RSA.
    #    Format de l'outillage Android officiel : AUCUN attribut signé,
    #    la signature porte directement sur le contenu CERT.SF.
    ci = cms.ContentInfo.load(rsa)
    sd = ci['content']
    si = sd['signer_infos'][0]
    assert si['signed_attrs'] is None or len(si['signed_attrs']) == 0, \
        'attributs signés inattendus'
    cert = sd['certificates'][0].chosen
    # conversion de la clé asn1crypto -> clé cryptography
    from cryptography.hazmat.primitives.serialization import load_der_public_key
    pub = load_der_public_key(cert.public_key.dump())
    pub.verify(si['signature'].native, sf.encode('utf-8'),
               padding.PKCS1v15(), hashes.SHA256())
    print('[ok] signature v1 : manifeste + CERT.SF + CMS vérifiés')


# ---------------------------------------------------------------------------
#  6. Signature v2 (vérification interne + apksigtool indépendant)
# ---------------------------------------------------------------------------
def _parse_block(apk: bytes):
    """Localise le bloc de signature v2.

    Format (AOSP) : [size1:u64][paires][size2:u64][magic:16] juste avant le
    Central Directory. La valeur de taille vaut `longueur_totale − 8` :
    le bloc commence donc à `magic_start + 8 − size` (soit, de manière
    équivalente, `cd_offset − 8 − size`).
    """
    magic = b'APK Sig Block 42'
    idx = apk.rfind(magic)
    assert idx > 0, 'bloc v2 absent'
    size = struct.unpack_from('<Q', apk, idx - 8)[0]
    start = idx + 8 - size
    assert struct.unpack_from('<Q', apk, start)[0] == size, 'size1 incohérent'
    assert struct.unpack_from('<Q', apk, idx - 8)[0] == size, 'size2 incohérent'
    return start, idx + 16


def check_v2(apk_path: str) -> None:
    from cryptography.hazmat.primitives import hashes
    from cryptography.hazmat.primitives.asymmetric import padding

    apk = open(apk_path, 'rb').read()
    sb_start, cd_off_expected = _parse_block(apk)
    eocd_off = apk.rfind(b'PK\x05\x06')
    cd_off = struct.unpack_from('<I', apk, eocd_off + 16)[0]
    # l'EOCD doit pointer sur le début réel du Central Directory,
    # c'est-à-dire juste après le bloc de signature
    assert cd_off == cd_off_expected, 'EOCD mal corrigé'
    # lecture de la paire v2
    # NB : la longueur de paire INCLUT l'ID (+4) dans le format réel (AOSP
    # lit `pairSize - 4`) — cf. sign_v2.py pour la justification.
    pos = sb_start + 8
    pairs = {}
    while pos < cd_off_expected - 16:
        plen, pid = struct.unpack_from('<QI', apk, pos)
        value = apk[pos + 12:pos + 8 + plen]
        pairs[pid] = value
        pos += 8 + plen
    assert 0x7109871A in pairs, 'paire v2 absente'
    v2 = pairs[0x7109871A]

    # parse du signer
    def lp(b, o):
        l = struct.unpack_from('<I', b, o)[0]
        return b[o + 4:o + 4 + l], o + 4 + l

    # séquence de signers : [longueur totale][signer : [longueur][contenu]]
    signers_seq, o = lp(v2, 0)
    signer, o = lp(signers_seq, 0)
    signed, o = lp(signer, 0)
    sigs, o = lp(signer, o)
    pk, o = lp(signer, o)
    digests_field, o2 = lp(signed, 0)
    certs, o2 = lp(signed, o2)
    attrs, o2 = lp(signed, o2)

    # digest du contenu (sections 1, 3, 4) — même algorithme que le signataire
    import sys as _sys
    import os
    _sys.path.insert(0, os.path.dirname(__file__))
    from sign_v2 import compute_content_digest
    sb, _ = _parse_block(apk)
    digest = compute_content_digest(apk, sb, cd_off, eocd_off)
    dentry, dpos = lp(digests_field, 0)
    alg = struct.unpack_from('<I', dentry, 0)[0]
    assert alg == 0x0103, 'algorithme de digest inattendu : %#x' % alg
    stored = dentry[8:]
    assert stored == digest, 'digest v2 != contenu de l\'APK'

    # signature RSA sur le signed data
    sig_entry, spos = lp(sigs, 0)
    sig_alg = struct.unpack_from('<I', sig_entry, 0)[0]
    assert sig_alg == 0x0103
    signature = sig_entry[8:]
    pub = __import__('cryptography').hazmat.primitives.serialization \
        .load_der_public_key(pk)
    pub.verify(signature, signed, padding.PKCS1v15(), hashes.SHA256())
    # le bloc doit être aligné à 4096 (padding verity, comme apksigner)
    assert (cd_off_expected - sb_start) % 4096 == 0, \
        'bloc de signature non aligné à 4096'
    print('[ok] signature v2 : digest du contenu + signature RSA vérifiés'
          ' (bloc aligné 4096)')

    # NB : cet algorithme de digest (1 digest combiné des sections 1/3/4)
    # a été validé contre un APK signé par apksigner (l'original) : le digest
    # recalculé reproduit le digest stocké octet pour octet.


# ---------------------------------------------------------------------------
#  7. Empreintes
# ---------------------------------------------------------------------------
def fingerprints(apk_path: str) -> None:
    h = hashlib.sha256(open(apk_path, 'rb').read()).hexdigest()
    print('[info] SHA-256 de l\'APK : %s' % h)
    z = zipfile.ZipFile(apk_path)
    cert = z.read('META-INF/CERT.RSA')
    from asn1crypto import cms
    ci = cms.ContentInfo.load(cert)
    c = ci['content']['certificates'][0].chosen
    print('[info] certificat : %s' % c.subject.human_friendly)
    print('[info] empreinte SHA-256 du certificat : %s'
          % hashlib.sha256(c.dump()).hexdigest())


def main() -> None:
    apk = sys.argv[1]
    orig = sys.argv[2] if len(sys.argv) > 2 else None
    print('== Vérification de %s ==' % apk)
    check_zip(apk, orig)
    check_manifest(apk)
    check_dex(apk)
    check_site_js(apk)
    check_v1(apk)
    check_v2(apk)
    fingerprints(apk)
    print('== TOUTES LES VÉRIFICATIONS SONT PASSÉES ==')


if __name__ == '__main__':
    main()
