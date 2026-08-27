#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
export_e_reporting.py — Export e-reporting des ventes de « La Trattoria »
=========================================================================
La tablette expose une API locale (port 8720) protégée par clé. Ce script
interroge `/api/v1/ventes?jour=AAAA-MM-JJ` pour chaque jour demandé et
produit :

  * un CSV « e-reporting » (une ligne par jour) :
        date ; ca_ttc ; ca_ht ; tva ; tickets ; couverts ; ticket_moyen
    (séparateur point-virgule, décimales à la française — prêt pour votre
     PDP ou votre expert-comptable ; chaque PDP/éditeur a son format
     d'import, ce CSV en est la base standard),
  * un XML simple (même contenu) pour les outils qui préfèrent du XML.

Usage :
  python3 build/export_e_reporting.py --hote 192.168.1.50 --cle trt_XXXX \
        --de 2026-08-25 --a 2026-08-25 --out export/ereporting.csv

Options :
  --hote        IP de la tablette maître (défaut 192.168.1.50)
  --port        port (défaut 8720)
  --cle         clé API (menu Réseau de l'app, en-tête X-Cle-Api)
  --de / --a    dates AAAA-MM-JJ (défaut : aujourd'hui)
  --fichier     chemin d'un JSON de réponse (pour tester SANS la tablette)
  --out         fichier CSV de sortie (défaut export/ereporting.csv)
  --xml         génère aussi un fichier XML (défaut : oui)

La clé API est obligatoire : sans elle, l'API répond 401. Elle s'envoie
dans l'en-tête X-Cle-Api (ou en paramètre ?cle=).
"""

import argparse
import csv
import datetime
import json
import os
import sys
import urllib.request

# ---------------------------------------------------------------------------
#  Appel de l'API locale
# ---------------------------------------------------------------------------
def fetch_day(hote, port, cle, jour, fichier=None):
    """Récupère les ventes d'un jour via l'API de la tablette (ou un JSON)."""
    if fichier:
        # mode test : lit un fichier JSON (une réponse d'exemple)
        with open(fichier, 'r', encoding='utf-8') as f:
            return json.load(f)
    url = 'http://%s:%d/api/v1/ventes?jour=%s' % (hote, port, jour)
    req = urllib.request.Request(url, headers={'X-Cle-Api': cle})
    with urllib.request.urlopen(req, timeout=10) as r:
        return json.loads(r.read().decode('utf-8'))


def eur(v):
    """Formate un nombre à la française : virgule décimale, 2 décimales."""
    try:
        return ('%.2f' % float(v)).replace('.', ',')
    except (TypeError, ValueError):
        return '0,00'


# ---------------------------------------------------------------------------
#  Génération des exports
# ---------------------------------------------------------------------------
def lignes(donnees):
    """Transforme les réponses de l'API en lignes de données.

    L'API renvoie pour chaque jour : chiffre_affaires_ttc, ht, tva_collectee,
    couverts, tickets, ticket_moyen. On ajoute une ligne par jour.
    """
    out = []
    for j in donnees:
        out.append({
            'jour': j.get('jour', ''),
            'ca_ttc': eur(j.get('chiffre_affaires_ttc')),
            'ca_ht': eur(j.get('chiffre_affaires_ht')),
            'tva': eur(j.get('tva_collectee')),
            'tickets': str(j.get('tickets', 0)),
            'couverts': str(j.get('couverts', 0)),
            'ticket_moyen': eur(j.get('ticket_moyen')),
        })
    return out


def ecrire_csv(lignes_, out_path):
    with open(out_path, 'w', newline='', encoding='utf-8-sig') as f:
        w = csv.writer(f, delimiter=';')
        w.writerow(['jour', 'ca_ttc', 'ca_ht', 'tva', 'tickets',
                    'couverts', 'ticket_moyen'])
        for l in lignes_:
            w.writerow([l['jour'], l['ca_ttc'], l['ca_ht'], l['tva'],
                        l['tickets'], l['couverts'], l['ticket_moyen']])
    print('[ok] CSV e-reporting : %s' % out_path)


def ecrire_xml(lignes_, out_path):
    xml = ['<?xml version="1.0" encoding="UTF-8"?>',
           '<e_reporting>']
    for l in lignes_:
        xml.append('  <jour date="%s">' % l['jour'])
        xml.append('    <ca_ttc>%s</ca_ttc>' % l['ca_ttc'])
        xml.append('    <ca_ht>%s</ca_ht>' % l['ca_ht'])
        xml.append('    <tva>%s</tva>' % l['tva'])
        xml.append('    <tickets>%s</tickets>' % l['tickets'])
        xml.append('    <couverts>%s</couverts>' % l['couverts'])
        xml.append('    <ticket_moyen>%s</ticket_moyen>' % l['ticket_moyen'])
        xml.append('  </jour>')
    xml.append('</e_reporting>')
    with open(out_path, 'w', encoding='utf-8') as f:
        f.write('\n'.join(xml) + '\n')
    print('[ok] XML e-reporting : %s' % out_path)


# ---------------------------------------------------------------------------
#  Point d'entrée
# ---------------------------------------------------------------------------
def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--hote', default='192.168.1.50')
    ap.add_argument('--port', type=int, default=8720)
    ap.add_argument('--cle', default='', help='clé API (menu Réseau)')
    ap.add_argument('--de', default='', help='date début AAAA-MM-JJ')
    ap.add_argument('--a', default='', help='date fin AAAA-MM-JJ')
    ap.add_argument('--fichier', default='', help='JSON de réponse (test)')
    ap.add_argument('--out', default='export/ereporting.csv')
    ap.add_argument('--no-xml', action='store_true')
    args = ap.parse_args()

    # plage de dates
    if args.de and args.a:
        d1 = datetime.date.fromisoformat(args.de)
        d2 = datetime.date.fromisoformat(args.a)
    else:
        d1 = d2 = datetime.date.today()
    jours = []
    d = d1
    while d <= d2:
        jours.append(d.isoformat())
        d += datetime.timedelta(days=1)

    if not args.cle and not args.fichier:
        print('ERREUR : la clé API est requise (--cle) ou utilisez --fichier '
              'pour tester.', file=sys.stderr)
        sys.exit(1)

    # récupération des données
    donnees = []
    for j in jours:
        try:
            r = fetch_day(args.hote, args.port, args.cle, j, args.fichier)
            if isinstance(r, dict):
                r['jour'] = r.get('jour', j)
                donnees.append(r)
            elif isinstance(r, list):
                for item in r:
                    item['jour'] = item.get('jour', j)
                    donnees.append(item)
            else:
                print('[attention] réponse inattendue pour %s' % j)
        except Exception as e:
            print('[attention] %s : %s' % (j, e))

    if not donnees:
        print('Aucune donnée récupérée.', file=sys.stderr)
        sys.exit(1)

    lignes_ = lignes(donnees)
    os.makedirs(os.path.dirname(args.out) or '.', exist_ok=True)
    ecrire_csv(lignes_, args.out)
    if not args.no_xml:
        ecrire_xml(lignes_, args.out.rsplit('.', 1)[0] + '.xml')


if __name__ == '__main__':
    main()
