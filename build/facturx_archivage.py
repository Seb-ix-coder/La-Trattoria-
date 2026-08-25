#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
facturx_archivage.py — Contrôle et archivage des factures fournisseurs Factur-X
================================================================================
Depuis le 1er septembre 2026, les fournisseurs vous envoient leurs factures
au format électronique structuré : Factur-X (PDF contenant un XML
normalisé), UBL ou CII. Ce script :

  1. LIT le fichier reçu (XML Factur-X/UBL/CII, ou PDF contenant un XML
     Factur-X embarqué),
  2. CONTRÔLE les champs obligatoires (fournisseur, n° de facture, date,
     total TTC, TVA) et affiche un bilan,
  3. ARCHIVE le fichier dans un répertoire daté (mois de la facture) avec
     un nom normalisé « AAAAMMJJ_Fournisseur_Numero »,
  4. AJOUTE une ligne au registre CSV (suivi comptable 10 ans).

Usage :
  python3 build/facturx_archivage.py facture.pdf [facture2.xml ...]
  python3 build/facturx_archivage.py dossier/          # tous les fichiers

Options :
  --registre chemin/registre-factures.csv   (défaut : factures/registre.csv)
  --archives chemin/                        (défaut : factures/)
  --simuler                                (ne rien écrire, afficher seulement)

Le registre CSV est le pendant numérique de vos photos de justificatifs du
module Compta : il permet de retrouver chaque facture reçue et d'archiver
10 ans comme l'exige la comptabilité.
"""

import argparse
import csv
import datetime
import os
import re
import shutil
import sys
import xml.etree.ElementTree as ET

# ---------------------------------------------------------------------------
#  Namespaces des formats
# ---------------------------------------------------------------------------
NS = {
    'rsm': 'urn:un:unece:uncefact:data:standard:CrossIndustryInvoice:100',
    'ram': 'urn:un:unece:uncefact:data:standard:ReusableAggregateBusinessInformationEntity:100',
    'qdt': 'urn:un:unece:uncefact:data:standard:QualifiedDataType:100',
    'udt': 'urn:un:unece:uncefact:data:standard:UnqualifiedDataType:100',
    # UBL 2.1
    'cac': 'urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2',
    'cbc': 'urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2',
}

FACTURX_MARKERS = (b'urn:factur-x.eu', b'urn:un:unece:uncefact:data:standard:CrossIndustryInvoice')
UBL_MARKERS = (b'urn:oasis:names:specification:ubl:schema:xsd:Invoice',)


def eur(v):
    try:
        return float(v)
    except (TypeError, ValueError):
        return 0.0


# ---------------------------------------------------------------------------
#  Extraction du XML depuis un fichier reçu
# ---------------------------------------------------------------------------
def extraire_xml(chemin):
    """Retourne (xml_bytes, source) pour un .xml ou un .pdf contenant Factur-X."""
    ext = os.path.splitext(chemin)[1].lower()
    raw = open(chemin, 'rb').read()
    if ext == '.xml':
        return raw, 'xml'
    if ext != '.pdf':
        raise ValueError('format non pris en charge : %s (xml ou pdf)' % ext)

    # PDF : on décompresse les flux FlateDecode et on cherche le XML Factur-X.
    # Approche pragmatique (pas de bibliothèque PDF) : on parcourt les objets
    # du PDF, on décompresse chaque flux et on cherche les marqueurs Factur-X.
    candidates = []
    # flux compressés : repère 'stream' ... 'endstream'
    for m in re.finditer(rb'stream\r?\n', raw):
        start = m.end()
        end = raw.find(b'endstream', start)
        if end < 0:
            continue
        flux = raw[start:end].rstrip(b'\r\n')
        # essai décompression zlib (FlateDecode)
        try:
            import zlib
            dec = zlib.decompress(flux)
            if any(mk in dec for mk in FACTURX_MARKERS + UBL_MARKERS):
                candidates.append(dec)
        except Exception:
            pass
        # flux non compressé
        if any(mk in flux for mk in FACTURX_MARKERS + UBL_MARKERS):
            candidates.append(flux)
    if not candidates:
        raise ValueError(
            'aucun XML Factur-X trouvé dans le PDF (facture PDF classique ?)')
    # on prend le candidat le plus long (le XML complet)
    return max(candidates, key=len), 'pdf'


# ---------------------------------------------------------------------------
#  Extraction des champs (Factur-X / UBL / CII)
# ---------------------------------------------------------------------------
def trouver(root, *chemins):
    """Première valeur texte trouvée parmi plusieurs chemins (namespace)."""
    for chemin in chemins:
        el = root.find(chemin, NS)
        if el is not None and el.text and el.text.strip():
            return el.text.strip()
    return ''


def analyser(xml_bytes):
    """Extrait les champs clés d'une facture structurée."""
    try:
        root = ET.fromstring(xml_bytes)
    except ET.ParseError as e:
        raise ValueError('XML illisible : %s' % e)

    tag = root.tag.split('}')[-1]
    if tag == 'CrossIndustryInvoice':        # Factur-X / CII
        # NB : ExchangedDocumentContext et SupplyChainTradeTransaction sont
        # dans le namespace rsm ; leurs enfants (ram:*) dans le namespace ram.
        fournisseur = trouver(
            root,
            './rsm:ExchangedDocumentContext/ram:BusinessProcessSpecifiedDocumentContextParameter/ram:ID',
        ) or 'Factur-X'
        nom_four = trouver(
            root,
            './rsm:SupplyChainTradeTransaction/ram:ApplicableHeaderTradeAgreement/ram:SellerTradeParty/ram:Name',
        )
        numero = trouver(
            root,
            './rsm:SupplyChainTradeTransaction/ram:ApplicableHeaderTradeAgreement/ram:ApplicableHeaderTradeAgreementReference',
        )
        date = trouver(
            root,
            './rsm:SupplyChainTradeTransaction/ram:ApplicableHeaderTradeAgreement/ram:ApplicableHeaderTradeAgreementIssueDateTime/qdt:DateTimeString',
        )
        total_ttc = trouver(
            root,
            './rsm:SupplyChainTradeTransaction/ram:ApplicableHeaderTradeSettlement/ram:SpecifiedTradeSettlementHeaderMonetarySummation/ram:GrandTotalAmount',
        )
        total_ht = trouver(
            root,
            './rsm:SupplyChainTradeTransaction/ram:ApplicableHeaderTradeSettlement/ram:SpecifiedTradeSettlementHeaderMonetarySummation/ram:TaxBasisTotalAmount',
        )
        tva = trouver(
            root,
            './rsm:SupplyChainTradeTransaction/ram:ApplicableHeaderTradeSettlement/ram:SpecifiedTradeSettlementHeaderMonetarySummation/ram:TaxTotalAmount',
        )
        return {'fournisseur': nom_four, 'numero': numero, 'date': date,
                'total_ttc': eur(total_ttc), 'total_ht': eur(total_ht),
                'tva': eur(tva)}
    if tag == 'Invoice':                     # UBL 2.1
        nom_four = trouver(root, './cac:AccountingSupplierParty/cac:Party/cac:PartyName/cbc:Name',
                           './cac:AccountingSupplierParty/cac:Party/cac:PartyLegalEntity/cbc:RegistrationName')
        return {'fournisseur': nom_four,
                'numero': trouver(root, './cbc:ID'),
                'date': trouver(root, './cbc:IssueDate'),
                'total_ttc': eur(trouver(root, './cac:LegalMonetaryTotal/cbc:TaxInclusiveAmount')),
                'total_ht': eur(trouver(root, './cac:LegalMonetaryTotal/cbc:TaxExclusiveAmount')),
                'tva': eur(trouver(root, './cac:LegalMonetaryTotal/cbc:TaxAmount'))}
    raise ValueError('type de facture inconnu : %s' % tag)


# ---------------------------------------------------------------------------
#  Archivage + registre
# ---------------------------------------------------------------------------
def norme(valeur):
    return re.sub(r'[^A-Za-z0-9]+', '_', valeur or 'INCONNU').strip('_')[:40]


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('fichiers', nargs='+', help='fichiers ou dossiers')
    ap.add_argument('--registre', default='factures/registre-factures.csv')
    ap.add_argument('--archives', default='factures/')
    ap.add_argument('--simuler', action='store_true')
    args = ap.parse_args()

    # liste des fichiers à traiter
    fichiers = []
    for f in args.fichiers:
        if os.path.isdir(f):
            for root, _, files in os.walk(f):
                for n in sorted(files):
                    if n.lower().endswith(('.xml', '.pdf')):
                        fichiers.append(os.path.join(root, n))
        else:
            fichiers.append(f)

    os.makedirs(args.archives, exist_ok=True)
    registre_existe = os.path.exists(args.registre)
    with open(args.registre, 'a', newline='', encoding='utf-8-sig') as reg:
        w = csv.writer(reg, delimiter=';')
        if not registre_existe:
            w.writerow(['date_archivage', 'fournisseur', 'numero', 'date_facture',
                        'total_ht', 'tva', 'total_ttc', 'fichier_origine',
                        'fichier_archive'])
        for f in fichiers:
            try:
                xml_bytes, source = extraire_xml(f)
                champs = analyser(xml_bytes)
                manques = [k for k, v in champs.items()
                           if k != 'total_ht' and (v is None or v == '' or v == 0)]
                bilan = ('OK' if not manques else 'INCOMPLET (%s)' % ', '.join(manques))
                print('[%s] %s -> %s | n°%s | %s | TTC %.2f €'
                      % (bilan, os.path.basename(f), champs['fournisseur'],
                         champs['numero'], champs['date'], champs['total_ttc']))
                if args.simuler:
                    continue
                # nom normalisé : AAAAMMJJ_Fournisseur_Numero.ext
                mois = (champs['date'] or 'inconnue').replace('-', '')[:6]
                nom = '%s_%s_%s%s' % (mois, norme(champs['fournisseur']),
                                      norme(champs['numero']),
                                      os.path.splitext(f)[1].lower())
                dest = os.path.join(args.archives, nom)
                shutil.copy2(f, dest)
                w.writerow([datetime.date.today().isoformat(),
                            champs['fournisseur'], champs['numero'],
                            champs['date'], '%.2f' % champs['total_ht'],
                            '%.2f' % champs['tva'], '%.2f' % champs['total_ttc'],
                            os.path.basename(f), nom])
            except Exception as e:
                print('[ERREUR] %s : %s' % (os.path.basename(f), e))
    print('[ok] registre : %s' % args.registre)


if __name__ == '__main__':
    main()
