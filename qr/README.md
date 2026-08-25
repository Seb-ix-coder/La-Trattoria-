# QR code « Ouvrir le site web » — La Trattoria

`QR-site-web.png` : QR code à afficher dans le restaurant pour que les
clients ouvrent **le site web** (menu, réservations, commande à emporter)
avec leur téléphone.

> ⚠️ **Ce QR est un EXEMPLE** : il pointe vers l'adresse fictive
> `http://192.168.1.50:8720/` (port 8720 = serveur local de la tablette
> maître). Il doit être **régénéré avec la vraie adresse** avant
> impression.

## Régénérer avec la bonne URL

1. Récupérez l'IP fixe de la tablette maître (menu Réseau de l'app,
   ou réglages WiFi / réservation DHCP du routeur — cf.
   `GUIDE_INSTALLATION.md` §6).
2. Générez le QR :

```bash
python3 build/make_qrcode.py "http://<IP-DE-LA-TABLETTE>:8720/" \
    qr/QR-site-web.png \
    --label "La Trattoria — Ouvrir le menu"
```

3. Vérifiez le contenu (décodage) :

```bash
python3 -c "
import cv2
data, _, _ = cv2.QRCodeDetector().detectAndDecode(cv2.imread('qr/QR-site-web.png'))
print(data)
"
```

4. Imprimez : le PNG est en 518×692 px (échelle imprimable) ; agrandissez
   sans dépasser ~10×13 cm pour garder un contraste net.

## Variantes

* **Site hébergé en ligne** (si le site est publié sur Internet) :
  ```bash
  python3 build/make_qrcode.py "https://www.votresite.fr/" qr/QR-site-web.png
  ```
* **QR seul, sans légende** (pour impression sur support dédié) :
  `--no-caption`.
* **Résolution plus grande** pour l'impression : `--box 20`.

## Test conseillé

Après impression, scannez le QR avec un téléphone **en conditions réelles**
(salle éclairée, distance d'affichage) : le téléphone doit ouvrir le site
du restaurant. Si la lecture échoue, imprimez plus grand ou avec plus de
marge blanche.
