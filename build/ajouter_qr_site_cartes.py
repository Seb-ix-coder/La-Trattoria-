#!/usr/bin/env python3
"""Ajoute le QR du site public aux cartes de visite imprimables.

Le PNG est intégré en data URI dans la planche A4 afin que le fichier HTML
reste autonome lorsqu'il est envoyé à un ami ou copié sur une clé USB.
"""
from __future__ import annotations

import base64
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CONTACT_SHEET = ROOT / "carte" / "impression" / "cartes-contact-a4.html"
BUSINESS_CARD = ROOT / "carte-de-visite.html"
QR_PNG = ROOT / "assets" / "qr-site-web.png"
QR_SVG = ROOT / "assets" / "qr-site-web.svg"
QR_URL = "https://latrattoria-saintes.fr/"

QR_CSS = r'''
/* QR du site public : intégré, donc la carte reste autonome hors connexion. */
.contact-card .qr-site{position:absolute;right:4mm;top:6mm;width:18mm;height:18mm;padding:1mm;background:#fff;border:1px solid var(--line);object-fit:contain}
.contact-card .qr-caption{position:absolute;right:4mm;top:25mm;width:18mm;color:#6e6a63;text-align:center;font-size:5.5px;line-height:1.1}
.contact-card .brand,.contact-card .type,.contact-card .rule,.contact-card .details,.contact-card .phone,.contact-card .email{margin-right:21mm}
'''


def main() -> None:
    if not QR_PNG.exists():
        raise SystemExit(f"QR absent : {QR_PNG}")
    png_uri = "data:image/png;base64," + base64.b64encode(QR_PNG.read_bytes()).decode("ascii")

    html = CONTACT_SHEET.read_text(encoding="utf-8")
    if "/* QR du site public" not in html:
        html = html.replace("</style>", QR_CSS + "</style>", 1)
    marker = '<img class="qr-site" src="' + png_uri + '" alt="QR code vers le site La Trattoria"><span class="qr-caption">Site web</span>'
    if 'class="qr-site"' not in html:
        html = html.replace('<article class="contact-card">', '<article class="contact-card">' + marker)
    CONTACT_SHEET.write_text(html, encoding="utf-8")

    # L’ancienne carte recto/verso embarquait déjà un SVG entre ces marqueurs :
    # on le remplace également pour que ses deux formats pointent vers le site.
    if QR_SVG.exists() and BUSINESS_CARD.exists():
        business = BUSINESS_CARD.read_text(encoding="utf-8")
        start, end = "<!--QR:DEBUT-->", "<!--QR:FIN-->"
        before, sep, after = business.partition(start)
        if sep and end in after:
            _, _, tail = after.partition(end)
            svg = QR_SVG.read_text(encoding="utf-8").strip()
            business = before + start + "\n            " + svg + "\n          " + end + tail
            BUSINESS_CARD.write_text(business, encoding="utf-8")

    print(f"QR intégré dans {CONTACT_SHEET}")
    print(f"QR URL : {QR_URL}")


if __name__ == "__main__":
    main()
