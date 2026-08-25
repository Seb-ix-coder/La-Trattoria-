#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
make_qrcode.py — Génère un QR code « ouvrir le site web » de La Trattoria
=========================================================================

Usage :
  python3 build/make_qrcode.py "http://192.168.1.50:8720" qr/QR-site-web.png

Options :
  --label "Texte sous le QR"   légende affichée sous le QR (ex. le nom du site)
  --box 14                     taille d'un module en pixels (pour l'impression)
  --no-caption                 supprime la légende (QR seul)

Le QR est généré avec :
  * correction d'erreur maximale (niveau H) : il se scanne même abîmé,
    déformé ou sur un support imprimé de mauvaise qualité,
  * le fond blanc + marges de sécurité standard (4 modules),
  * une légende avec l'URL (et le nom), utile avant impression.

⚠️  IMPORTANT — Pour les clients dans le restaurant, l'URL doit être celle
du site servi par la tablette maître, par exemple :
    http://192.168.1.50:8720/
(remplacez par l'IP fixe de VOTRE tablette maître, cf. GUIDE_INSTALLATION.md
§6). Si vous hébergez le site en ligne, utilisez l'URL publique à la place.

Le QR d'exemple fourni (qr/QR-site-web.png) utilise une adresse fictive :
il doit être REGÉNÉRÉ avec la vraie URL avant impression :
    python3 build/make_qrcode.py "http://<IP-TABLETTE>:8720/" qr/QR-site-web.png
"""

import argparse
import os
import sys

import qrcode
from qrcode.constants import ERROR_CORRECT_H

# ---------------------------------------------------------------------------
#  Police pour la légende : on préfère DejaVu (présente sur Linux/macOS),
#  sinon on retombe sur la police par défaut de Pillow (petite mais lisible).
# ---------------------------------------------------------------------------
FONT_CANDIDATES = [
    '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',
    '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
    '/System/Library/Fonts/Helvetica.ttc',
    'C:/Windows/Fonts/arialbd.ttf',
]


def _font(size: int):
    from PIL import ImageFont
    for path in FONT_CANDIDATES:
        if os.path.exists(path):
            try:
                return ImageFont.truetype(path, size)
            except Exception:
                continue
    return ImageFont.load_default()


def make_qr(url: str, out: str, label: str = '', box: int = 14,
            caption: bool = True) -> None:
    """Génère le QR code et l'enregistre en PNG."""
    from PIL import Image, ImageDraw

    # -- QR : niveau de correction H (le plus robuste)
    qr = qrcode.QRCode(
        version=None,
        error_correction=ERROR_CORRECT_H,
        box_size=box,
        border=4,
    )
    qr.add_data(url)
    qr.make(fit=True)
    img = qr.make_image(fill_color='black', back_color='white').convert('RGB')

    if not caption:
        img.save(out)
        print('[ok] QR généré : %s (%dx%d)' % (out, img.width, img.height))
        return

    # -- légende : URL + label, centrée sous le QR
    from PIL import ImageDraw
    margin = 24
    font_url = _font(round(box * 2.4))
    font_label = _font(round(box * 2.0))

    def text_width(txt, f):
        d = ImageDraw.Draw(img)
        bbox = d.textbbox((0, 0), txt, font=f)
        return bbox[2] - bbox[0]

    # si l'URL est trop longue, on la coupe proprement sur deux lignes
    parts = []
    remaining = url
    max_w = img.width - 2 * margin
    while remaining and (text_width(remaining, font_url) > max_w):
        cut = len(remaining)
        while cut > 0 and text_width(remaining[:cut], font_url) > max_w:
            cut -= 1
        if cut <= 0:
            break
        parts.append(remaining[:cut])
        remaining = remaining[cut:].lstrip()
    if remaining:
        parts.append(remaining)

    line_h = round(box * 3.0)
    total_h = img.height + margin * 2 + line_h * (len(parts) + (1 if label else 0))
    canvas = Image.new('RGB', (img.width, total_h), 'white')
    canvas.paste(img, (0, margin))
    draw = ImageDraw.Draw(canvas)

    y = img.height + margin
    if label:
        draw.text(((canvas.width - text_width(label, font_label)) / 2, y),
                  label, fill='black', font=font_label)
        y += line_h
    for p in parts:
        draw.text(((canvas.width - text_width(p, font_url)) / 2, y),
                  p, fill='black', font=font_url)
        y += line_h

    canvas.save(out)
    print('[ok] QR généré : %s (%dx%d) -> %s' % (out, canvas.width,
                                                 canvas.height, url))


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument('url', help='URL à encoder dans le QR code')
    ap.add_argument('out', help='fichier PNG de sortie')
    ap.add_argument('--label', default='', help='légende sous le QR')
    ap.add_argument('--box', type=int, default=14,
                    help='taille d\'un module en pixels (défaut 14)')
    ap.add_argument('--no-caption', action='store_true',
                    help='QR seul, sans légende')
    args = ap.parse_args()

    os.makedirs(os.path.dirname(args.out) or '.', exist_ok=True)
    make_qr(args.url, args.out, label=args.label, box=args.box,
            caption=not args.no_caption)


if __name__ == '__main__':
    main()
