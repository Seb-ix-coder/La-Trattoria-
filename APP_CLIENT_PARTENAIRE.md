# Application Client & Partenaire + carte de visite

## 📱 Application « client » et « partenaire » (sans installation d'APK)

L'application La Trattoria sert elle-même ses pages. En scannant un QR code,
le client/partenaire ouvre l'application dans son navigateur et peut
l'**ajouter à l'écran d'accueil** (Android : menu ⋮ → « Ajouter à l'écran
d'accueil » ; iPhone : Partager → « Sur l'écran d'accueil ») : elle se
comporte alors comme une application, sans passer par un magasin.

| Mode | URL | Contenu |
|---|---|---|
| **App Client** | `http://<tablette>:8720/?client` | **Menu**, **cartes spéciales du jour**, **fonctionnalités sociales** (avis Google/Facebook/Tripadvisor, appeler). La commande en ligne, la réservation web et les outils de gestion sont masqués. |
| **App Partenaire** | `http://<tablette>:8720/?partenaire` | Comme le client + **Espace Partenaires** : coordonnées, patron (Alex), et formulaire de message transmis au restaurant (route `/partenaire`, visible dans la Messagerie de l'application quand on est sur le réseau). |

> NB : les URL ci-dessus utilisent l'IP d'exemple `192.168.1.50` — remplacez
> par l'IP réelle de la tablette (voir `qr/README.md`).

## 📇 Fichiers livrés

| Fichier | Contenu |
|---|---|
| `qr/QR-app-client.png` | QR → `…/?client` (à afficher en salle / terrasse) |
| `qr/QR-app-partenaire.png` | QR → `…/?partenaire` (à partager aux établissements amis) |
| `qr/QR-carte-visite.png` | QR vers le site public `https://latrattoria-saintes.fr/`, inséré sur la carte de visite |
| `qr/carte-visite.png` | **Carte de visite** haute résolution (1505×863 px) |
| `qr/carte-visite.pdf` | Carte de visite **prête à imprimer** (A4, 2 cartes) |
| `qr/logo-trattoria.png` | Logo « La Trattoria » |

## 🪪 Carte de visite (recto)

- **Logo** La Trattoria
- **La Trattoria — Produits maisons, artisanaux**
- **Rue de la Liste, 17100 SAINTES**
- **Réservations : 06 27 21 31 90**
- **Alex — votre patron**
- **QR code** → application client (menu & avis)

> ⚠️ L'adresse « Rue de la Liste » est celle indiquée lors de la demande.
> Si c'est en réalité « Rue de la Poste » (adresse par défaut de
> l'application), dites-le-moi : je régénère la carte en une commande
> (`python3 build/carte_visite.py` après correction du script).

## 🔧 Régénérer (une seule commande)

```bash
# après avoir corrigé l'IP réelle de la tablette dans les QR :
python3 build/make_qrcode.py "http://<IP>:8720/?client" qr/QR-app-client.png --label "La Trattoria — Menu & avis" --box 16
python3 build/make_qrcode.py "http://<IP>:8720/?partenaire" qr/QR-app-partenaire.png --label "La Trattoria — Espace Partenaires" --box 16
python3 build/make_qrcode.py "https://latrattoria-saintes.fr/" qr/QR-carte-visite.png --label "La Trattoria — Site" --box 12
python3 build/carte_visite.py
```
