#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
carte_visite.py — Génère la carte de visite « La Trattoria » (PNG + PDF)
=========================================================================
Carte 89×51 mm (format standard) :
  * logo (qr/logo-trattoria.png),
  * « La Trattoria — Produits maisons, artisanaux »,
  * adresse : Rue de la Liste, 17100 SAINTES,
  * réservations : +33 6 27 21 31 90,
  * patron : Alex,
  * QR code → l'application client (menu & avis).

Usage :
  python3 build/carte_visite.py
Sorties : qr/carte-visite.png (1500×858 px, ~430 dpi) et
          qr/carte-visite.pdf (A4 avec 2 cartes, prêt à imprimer).
"""

import os
import sys
from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
QR = os.path.join(ROOT, 'qr', 'QR-carte-visite.png')
LOGO = os.path.join(ROOT, 'qr', 'logo-trattoria.png')
OUT_PNG = os.path.join(ROOT, 'qr', 'carte-visite.png')
OUT_PDF = os.path.join(ROOT, 'qr', 'carte-visite.pdf')

# Carte 89 × 51 mm à ~430 dpi → 1505 × 863 px
W, H = 1505, 863
ROUGE = (165, 24, 34)        # --rouge du site
ROUGEF = (122, 16, 24)       # --rougef
CREME = (253, 250, 243)      # --creme
TEXTE = (43, 43, 40)         # --texte
GRIS = (110, 106, 99)        # --gris
OLIVE = (138, 138, 85)       # --olive


def font(size, bold=True):
    cands = [
        ('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf' if bold
         else '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', size),
        ('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', size),
    ]
    for path, sz in cands:
        if os.path.exists(path):
            try:
                return ImageFont.truetype(path, sz)
            except Exception:
                continue
    return ImageFont.load_default()


def round_rect(d, box, r, fill):
    d.rounded_rectangle(box, radius=r, fill=fill)


def compose():
    img = Image.new('RGB', (W, H), CREME)
    d = ImageDraw.Draw(img)

    # bande rouge verticale à gauche + fine bande olive
    d.rectangle([0, 0, 150, H], fill=ROUGE)
    d.rectangle([150, 0, 158, H], fill=OLIVE)

    # logo
    try:
        logo = Image.open(LOGO).convert('RGBA')
        logo.thumbnail((230, 230), Image.LANCZOS)
        img.paste(logo, (36, (H - logo.height) // 2), logo)
    except Exception as e:
        print('logo absent :', e)

    x = 200
    # nom
    f_name = font(92)
    d.text((x, 150), 'La Trattoria', font=f_name, fill=ROUGEF)
    # slogan
    f_slog = font(38, bold=False)
    d.text((x, 268), 'Produits maisons, artisanaux', font=f_slog, fill=TEXTE)
    # séparateur olive
    d.rectangle([x, 340, x + 560, 344], fill=OLIVE)

    # adresse
    f_txt = font(40)
    d.text((x, 384), 'Rue de la Liste', font=f_txt, fill=TEXTE)
    d.text((x, 448), '17100 SAINTES', font=f_txt, fill=TEXTE)

    # téléphone
    f_tel = font(46)
    d.text((x, 560), 'Réservations  :  06 27 21 31 90', font=f_tel, fill=ROUGE)
    # patron
    f_pat = font(40, bold=False)
    d.text((x, 640), 'Alex — votre patron', font=f_pat, fill=GRIS)

    # QR code à droite
    try:
        qr = Image.open(QR).convert('RGB')
        qr = qr.resize((330, 330), Image.LANCZOS)
        img.paste(qr, (W - 330 - 55, (H - 330) // 2 - 28))
        # petit texte sous le QR
        f_qr = font(28, bold=False)
        d.text((W - 330 - 55, (H - 330) // 2 + 330 - 2),
               'Scannez : menu & avis', font=f_qr, fill=GRIS)
    except Exception as e:
        print('QR absent :', e)

    img.save(OUT_PNG)
    print('[ok] carte de visite PNG : %s (%dx%d)' % (OUT_PNG, W, H))

    # PDF A4 (2 cartes côte à côte + note)
    try:
        from PIL import ImageOps
        page = Image.new('RGB', (2480, 3508), 'white')   # A4 @300dpi
        scale = 2480 / (2 * W + 120)
        cw, ch = int(W * scale), int(H * scale)
        card = img.resize((cw, ch), Image.LANCZOS)
        page.paste(card, (60, 120))
        page.paste(card, (60 + cw + 60, 120))
        page.save(OUT_PDF, 'PDF', resolution=300.0)
        print('[ok] carte de visite PDF : %s' % OUT_PDF)
    except Exception as e:
        print('PDF :', e)


if __name__ == '__main__':
    compose()
