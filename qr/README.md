# QR code « Ouvrir le site web » — La Trattoria

Deux façons d'afficher le QR code du menu à vos clients :

## 1. 📱 QR code INTÉGRÉ à l'application (build 11.1) — recommandé

Depuis le build durci 11.1, la tablette **génère elle-même** le QR code,
avec l'URL correcte automatiquement (celle de la tablette qui sert le site) :

* **Sur la page du site** : un bouton rond rouge « QR » flotte en bas à
  gauche (le bouton panier est en bas à droite). Une pression ouvre un
  plein écran avec un **grand QR scannable** (min 78 % de la largeur de
  l'écran), légende et bouton Fermer tactile (≥ 48 px).
* **Adresse dédiée** : ouvrez `http://<ip-tablette>:8720/qr` depuis
  n'importe quel appareil du réseau → le QR plein écran s'affiche
  **automatiquement**, parfait pour laisser la tablette affichée en salle.
* Le QR encode `location.origin` : aucune configuration, il pointe
  toujours vers le bon serveur.

L'encodeur est **intégré au site** (`assets/site.js`, aucun bytecode
modifié) : il est autonome (aucune dépendance externe, fonctionne sans
Internet) et a été **validé octet pour octet** contre l'implémentation de
référence du standard ISO/IEC 18004 (niveau de correction H = le plus
robuste, décodeur OpenCV de contrôle).

`qr/apercu-ecran-tactile.png` : aperçu de ce que voit le client sur un
téléphone (plein écran QR + bouton flottant).

## 2. 🖨️ QR imprimé (optionnel)

`QR-site-web.png` : QR statique à imprimer, à régénérer avec la vraie
adresse de la tablette maître (l'exemple pointe vers `192.168.1.50:8720`).

```bash
python3 build/make_qrcode.py "http://<IP-DE-LA-TABLETTE>:8720/" \
    qr/QR-site-web.png \
    --label "La Trattoria — Ouvrir le menu"
```

Variantes : site en ligne → `python3 build/make_qrcode.py "https://www.votresite.fr/" qr/QR-site-web.png` ;
QR sans légende → `--no-caption` ; plus grande résolution → `--box 20`.

## Vérification du décodage

```bash
python3 -c "
import cv2
data, _, _ = cv2.QRCodeDetector().detectAndDecode(cv2.imread('qr/QR-site-web.png'))
print(data)
"
```

## Test conseillé

1. Ouvrez `http://<ip-tablette>:8720/qr` sur la tablette.
2. Scannez avec un téléphone **en conditions réelles** (salle éclairée,
   distance d'affichage) : le téléphone doit ouvrir le menu.
3. Vérifiez aussi le bouton « QR » sur la page d'accueil du site.
