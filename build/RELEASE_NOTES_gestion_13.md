# 📣 App native « La Trattoria — Gestion » v1.3 — communication visuelle + accès au site

## Nouveautés v1.3

### 📣 Module « Communication » — l'espace de com visuelle
- Messages **éditables** : titre, message, **type** (📣 Annonce · 🔥 Promotion · 🆕 Nouveauté)
- Ajouter / modifier / supprimer autant de communications que voulu
- Elles s'affichent **en bannière mise en valeur en haut du site clients**
  (encadré craie dorée sur le site, icônes selon le type)

### 👁️ Accès au site — de partout
- Écran **Site en ligne** : bouton **« 👁️ Ouvrir le site (aperçu intégré) »**
  → le **vrai site** s'ouvre en plein écran dans l'application (panier,
  commande, communications) avec barre d'outils (partage, fermeture)
- Bouton **« 🔗 Partager l'adresse aux clients »** (message prêt à envoyer)
- Depuis l'écran **Communication** : « Visualiser le site (avec les communications) »
- L'URL réelle affichée en permanence (ex. `http://192.168.1.42:8721`)

### Le serveur s'ouvre aussi en un tap
Démarrer le serveur ouvre automatiquement la page clients — la boucle est
fermée : **éditer la com → visualiser → partager → recevoir les commandes**.

## Rappel des modules (v1.1/1.2 conservés)
🪑 Salle & commandes · 📈 Ventes du jour · 🧾 Cartes (84 produits + catégories
éditables, 6 cartes du moment craie/illustrées, HT, mentions, A4) ·
🌐 Site en ligne · 🎯 Objectifs · 📦 Stock & fournisseurs · 💼 Comptabilité
(TVA 10/5,5/20 %) · ♻️ Invendus · 👥 Personnel · ⚙️ Administration · 💾 Données

## Installation (mise à jour directe depuis 1.0–1.2)
**APK** : `trato-gestion-1.3.apk` — **263 735 octets** (0,25 Mo) · SHA-256
`3fca50dff7365f88def89ddec0d5ca70b89c3a337fb50f367a5d464855f24a0e`
https://raw.githubusercontent.com/Seb-ix-coder/La-Trattoria-/v1.3-gestion/trato-gestion-1.3.apk
(.zip : même URL en `.zip`)

## Vérifications
version 1.3 (vc 4) · signatures v1+v2 (clé commitée) · ZIP intègre ·
resources.arsc STORE+aligné · dex valide · **runtime validé** : page du site
générée avec communications + carte + badges, POST commande → 200
