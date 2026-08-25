# La Trattoria

Site et application de commande pour la pizzeria artisanale **La Trattoria** à Saintes (17100).

## Carte de visite

- `carte-de-visite.html` — la carte (recto/verso) au format standard **85 × 55 mm**,
  reprenant la charte graphique du site (rouge `#A51822`, rouge foncé `#7A1018`,
  olive `#8A8A55`, crème `#FDFAF3`, ardoise `#1C1C1A`, titres Georgia).
  Imprimable directement (Ctrl/Cmd+P) : une face par page, sans marge.
- `assets/logo-nouveau.png` — le nouveau logo (recto de la carte). Tant que la
  pièce jointe n'atteint pas l'espace de travail, déposez le fichier
  `logo_la_trattoria_saintes_transparent.png` à la racine du dépôt GitHub puis
  lancez `python3 recuperer-logo.py` : il est téléchargé, recadré et installé.
- `assets/qr-code.svg` / `.png` — QR code du lien de téléchargement direct GitHub
  de l'application (mode client, avec inscription sur le site en ligne) :
  `https://github.com/Seb-ix-coder/La-Trattoria-/raw/SEBIX/trato.apk`
- `generer-carte.py` — régénère le QR code : modifiez `URL_APPLI` puis lancez
  `python3 generer-carte.py` (le QR est réinjecté dans `carte-de-visite.html`).

## Application

`trato.apk` — application Android (commande + site local du restaurant).
