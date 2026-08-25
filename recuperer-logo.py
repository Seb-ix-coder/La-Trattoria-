#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
La Trattoria — récupération du logo depuis le dépôt GitHub.

La pièce jointe envoyée dans le chat n'atteignant pas l'espace de travail,
ajoutez le fichier `logo_la_trattoria_saintes_transparent.png` à la racine du
dépôt GitHub (bouton « Add files → Upload files » sur
https://github.com/Seb-ix-coder/La-Trattoria-), puis lancez :

    python3 recuperer-logo.py

Le logo est téléchargé, recadré sur son contenu utile et installé en
`assets/logo-nouveau.png` : la carte de visite l'affiche immédiatement.
"""
import base64
import io
import json
import subprocess
import sys

REPO = "Seb-ix-coder/La-Trattoria-"
NOM_LOGO = "logo_la_trattoria_saintes_transparent.png"
SORTIE = "assets/logo-nouveau.png"
REFS = ("SEBIX", "main", "master")

def api_contenu(ref):
    """Renvoie le contenu base64 du fichier via l'API GitHub, ou None."""
    url = f"repos/{REPO}/contents/{NOM_LOGO}?ref={ref}"
    r = subprocess.run(["gh", "api", url], capture_output=True, text=True)
    if r.returncode != 0:
        return None
    try:
        return json.loads(r.stdout)
    except json.JSONDecodeError:
        return None

def recadrer_transparent(png_bytes):
    """Recadre l'image sur les pixels non transparents (marges retirées)."""
    from PIL import Image
    im = Image.open(io.BytesIO(png_bytes))
    if im.mode in ("RGBA", "LA", "PA"):
        boite = im.convert("RGBA").getbbox()
        if boite:
            im = im.crop(boite)
    return im

def main():
    for ref in REFS:
        data = api_contenu(ref)
        if data and data.get("encoding") == "base64":
            brut = base64.b64decode(data["content"])
            im = recadrer_transparent(brut)
            im.save(SORTIE)
            print(f"Logo trouvé sur la branche « {ref} » "
                  f"({data['size']} octets, {im.size[0]}×{im.size[1]} px après recadrage)")
            print("Installé dans :", SORTIE)
            print("Ouvrez carte-de-visite.html : le logo est en place.")
            return 0
    print("Logo introuvable dans le dépôt.")
    print("Vérifiez que le fichier s'appelle exactement :", NOM_LOGO)
    return 1

if __name__ == "__main__":
    sys.exit(main())
