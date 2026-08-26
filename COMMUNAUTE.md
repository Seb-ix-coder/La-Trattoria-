# Communauté La Trattoria — réseau social local

Réseau social du restaurant : les **clients** et les **partenaires**
créent leur compte, partagent des photos, interagissent et les
partenaires proposent leurs **offres éphémères** sur leur page.
Tout reste sur le **Wi-Fi local du restaurant** — aucun hébergement
externe, aucune dépendance hors Python (stdlib).

## Démarrage

```bash
# sur la machine qui sert le réseau (tablette de caisse, PC, Raspberry Pi…)
python3 communaute/serveur_communaute.py            # port 8721
```

- Clients/partenaires : ouvrir `http://<ip-machine>:8721/` (ou scanner
  `qr/QR-communaute.png` — régénéré avec l'IP réelle :
  `python3 - <<EOF` voir ci-dessous).
- Installable comme une app : « Ajouter à l'écran d'accueil » (Android :
  menu ⋮ ; iPhone : Partager → Sur l'écran d'accueil).

```bash
# régénérer le QR avec la vraie IP de la machine :
node -e "require('qrcode').toFile('qr/QR-communaute.png','http://VRAIE_IP:8721/',{width:1024,margin:2,errorCorrectionLevel:'H'})"
```

## Comptes

- **Client** : inscription libre (nom + téléphone + code secret).
- **Partenaire** : cocher « Je suis partenaire » à l'inscription ;
  le statut est validé **sur place** par le personnel (un simple
  changement de `type` en base si besoin). Le partenaire obtient :
  - upload de son **logo**,
  - sa **page publique** (nom, logo, bio, offres, actualités),
  - l'écran « Proposer une offre éphémère ».
- Code secret stocké en SHA-256 salé ; session 30 jours (jeton + cookie).

## Fonctionnalités

| Fonction | Détails |
|---|---|
| **Fil d'actualité** | Posts texte + jusqu'à 4 photos, filtres *Tout le monde / Partenaires* |
| **J'aime / commentaires** | ♥ sur chaque post, fil de commentaires, compteur |
| **Messages privés** | Conversation 1 à 1 avec n'importe quel membre |
| **Avatar** | Photo de profil (recadrée 1000 px si Pillow est installé) |
| **Offres éphémères** | Titre, description, photo, code promo, durée (1 à 90 jours) — expirées automatiquement ; visibles dans l'onglet 🔥 *Offres du moment* et sur la page du partenaire |
| **Gamification** | Points : post +10, commentaire +5, offre +20 ; niveaux Bronze / Argent / Or affichés |
| **Pages partenaires** | Cliquer sur le nom/logo d'un partenaire ouvre sa page (logo, offres, posts) |

## Données

```
communaute/communaute.db   SQLite : comptes, posts, likes, commentaires,
                           messages, offres, sessions
communaute/photos/         photos des posts et des offres
communaute/avatars/        photos de profil
communaute/logos/          logos de partenaires
```

- Sauvegarde = copier ces 4 dossiers.
- Réinitialisation = les supprimer et relancer le serveur.
- Pillow (`pip install pillow`) est **optionnel** : s'il est présent,
  les images sont recadrées/comprimées (JPEG 800–1000 px, qualité 82).

## Sécurité

- Jeton de session aléatoire 32 octets, révocable (déconnexion).
- Uploads : types image uniquement (JPEG/PNG/WebP), taille plafonnée
  (4 Mo photos, 1 Mo avatars/logos), noms aléatoires (uuid),
  service des fichiers restreint aux patterns `[a-f0-9]{32}\.jpg`.
- Chemins de fichiers validés (pas de traversal), corps de requête
  plafonnés (8 Mo), texte plafonné (1000 car. post, 300 commentaire,
  500 message, 300 bio).
- Écoute en `0.0.0.0` sur le réseau local : ne pas exposer ce port sur
  Internet.

## Tester

```bash
# sur la machine qui sert le réseau :
curl -s http://127.0.0.1:8721/api/feed | head -c 300
# 25 vérifications de bout en bout (comptes, posts, offres, messages,
# points, sécurité) : voir les tests de développement — refaire avec
# une base vierge (supprimer communaute.db* avant de relancer).
```

## Intégration à l'application tablette

La barre sociale de l'app client (build 11.2+) proposera un bouton
« 👥 Communauté » pointant vers `http://<ip-machine>:8721/`
(build 11.4 à venir). En attendant, le QR `qr/QR-communaute.png`
affiche en salle suffit.
