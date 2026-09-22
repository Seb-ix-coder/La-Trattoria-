#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
La Trattoria — génération du QR code de la carte de visite.

Le QR code de la carte de visite pointe vers le site public du restaurant
(menu, cartes du jour et contact).

Modifiez URL_APPLI ci-dessous puis relancez :
    python3 generer-carte.py
- assets/qr-code.svg et assets/qr-code.png sont régénérés ;
- le QR est réinjecté automatiquement dans carte-de-visite.html
  entre les marqueurs <!--QR:DEBUT--> et <!--QR:FIN-->.
"""
import os
import re

# ---------------------------------------------------------------
#  Configuration
# ---------------------------------------------------------------
URL_APPLI = "https://latrattoria-saintes.fr/"
TEL_ALEX = "06 27 21 31 90"                    # Alexandre « Alex » Coudret
ADRESSE  = "Rue de La Poste, 17100 Saintes"

# Couleurs de la charte graphique du site (voir assets/site.css de l'APK)
CREME = "#FDFAF3"
ARDOISE = "#1C1C1A"

CARTE = "carte-de-visite.html"
DEBUT = "<!--QR:DEBUT-->"
FIN = "<!--QR:FIN-->"

def main():
    import segno
    os.makedirs("assets", exist_ok=True)
    qr = segno.make(URL_APPLI, error="m")
    # Modules ardoise sur fond crème : scannable et dans la charte
    qr.save("assets/qr-code.svg", scale=12, dark=ARDOISE, light=CREME,
            border=2, xmldecl=False)
    qr.save("assets/qr-code.png", scale=12, dark=ARDOISE, light=CREME,
            border=2)
    print("URL encodée :", URL_APPLI)
    print("QR généré   : assets/qr-code.svg + assets/qr-code.png")

    # --- réinjection du QR (SVG plein, viewBox 33x33) dans la carte ---
    svg = open("assets/qr-code.svg", encoding="utf-8").read().strip()
    svg = re.sub(r'width="\d+" height="\d+"', 'viewBox="0 0 33 33"', svg, count=1)
    html = open(CARTE, encoding="utf-8").read()
    motif = re.compile(re.escape(DEBUT) + r".*?" + re.escape(FIN), re.S)
    if not motif.search(html):
        print("!! Marqueurs QR introuvables dans", CARTE)
        return
    html = motif.sub(DEBUT + "\n            " + svg + "\n          " + FIN, html)
    open(CARTE, "w", encoding="utf-8").write(html)
    print("QR injecté  :", CARTE)

if __name__ == "__main__":
    main()
