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

- **Client** : inscription libre (nom + téléphone + code secret) ;
  sa carte fidélité est liée à son numéro de téléphone.
- **Partenaire** : cocher « Je suis partenaire » à l'inscription ;
  le statut est validé **sur place** par le personnel (un simple
  changement de `type` en base si besoin). Le partenaire obtient :
  - upload de son **logo**,
  - sa **page publique** (nom, logo, bio, offres, actualités),
  - l'écran « Proposer une offre éphémère »,
  - la **carte fidélité pro** et l'outil **« Envoyer un client »**.
- **Staff — « La Trattoria »** : compte système créé automatiquement
  à la première mise en route (téléphone `0000000000`, code
  `trattoria`). Il enregistre les achats (cartes fidélité clients),
  suit toutes les demandes de réservation entre partenaires et
  échange en temps réel avec les partenaires.
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

### Build 2 — Fidélité & Partenaires

| Fonction | Détails |
|---|---|
| **Carte fidélité virtuelle (clients)** | 1 point par euro acheté, **+20 pts au premier achat**, sur place **ou** à emporter ; carte visuelle (nom, niveau, progression, téléphone) ; niveaux Bronze / Argent (150) / Or (400) ; historique des achats. Le client la voit dans l'onglet ⭐ ; le staff l'enregistre (formulaire ou recherche par téléphone). |
| **Carte fidélité pro (partenaires)** | Même principe, récompense à chaque **envoi de client** : **+25 pts par envoi**, **+5 pts par demande acceptée** ; compteurs « clients envoyés / demandes acceptées ». |
| **Envoyer un client** | Un partenaire envoie un client à un autre partenaire (« la Trattoria ne fait pas de cocktails → chez le voisin »). **La demande de réservation part automatiquement dans l'appli du partenaire concerné**, avec le nom du client, les précisions et l'heure. |
| **Retours optiques & sonores puissants** | Chaque événement (demande reçue, acceptation, refus, nouveau message, points fidélité) déclenche : **bandeau clignotant plein large**, **son distinctif** (WebAudio, sans fichier), **vibration** sur mobile. |
| **Messagerie instantanée avec la Trattoria** | L'envoi de client **active immédiatement** la messagerie privée : message automatique dans la boîte du partenaire + préavis au staff ; échanges de courts messages en temps réel (rafraîchi toutes les 5 s) entre partenaires et La Trattoria. |
| **Suivi staff** | La Trattoria voit toutes les demandes (boîte globale), peut répondre, et est prévenue de chaque envoi/acceptation/refus. |

### Build 3 — Refonte pro, validation, consentement & gaming avancé

**Refonte professionnelle & ergonomique** : design system (couleurs, typographie
serif/sans, espacements, ombres, états chargement/vide/erreur), navigation basse
5 onglets (Accueil · Fidélité · Gaming · Messages · Profil), composants soignés,
installable comme une application.

**Inscription simple + validation systématique** :
- Inscription en 2 champs (nom + téléphone + code), **sans e-mail**, sans compte
  externe.
- Tout nouveau compte démarre **« en attente de validation »** : les services
  (publier, commenter, échanger, envoyer un client, échanger une récompense) sont
  **restreints** jusqu'à validation.
- **Rappel systématique par modale** : la modale de validation s'affiche à
  l'inscription puis **à chaque action bloquée**, + un bandeau permanent.
- Le **personnel valide au comptoir** (vue « Valider un membre » dans le profil
  staff, par id ou téléphone). La validation débloque instantanément le compte.

**Consentement (opt-in, respecté côté serveur)** :
- *Apparaître au classement* (off par défaut) — le membre figure au classement
  uniquement s'il l'a activé.
- *Être contacté (offres & mentions)* — les mentions/contacts ne sont notifiés
  que si le consentement est donné (staff & partenaires toujours notifiés).
- *Sons & vibrations* — les retours sonores peuvent être coupés.

**Gaming avancé** :
- **Niveaux** Bronze → Argent (150) → Or (400) → Platine (1000) avec barre de
  progression et célébration de palier.
- **Missions** (quêtes) : poster, photo, commenter, envoyer des clients (pro),
  achats — avec progression et gain de points.
- **Badges** (11) : Premier pas, Photographe, Causeur, Vedette, Ambassadeur,
  Maître du jeu, Habitué, niveaux Argent/Or/Platine, Générosité.
- **Récompenses** à échanger contre des points (boisson, café+pâtisserie, dessert
  offert, -10 %) — à présenter au comptoir (boucle de conversion).
- **Classement** des membres (volontaires uniquement, consentement).

**Interactions maximisées (utilisateurs / établissements / personnel)** :
- **Mentions** `@Nom` dans les posts/commentaires → notification (selon
  consentement) ; encadrées dans le texte.
- **Réactions** (❤️ 😍  🤝) en plus du like.
- **Suivre** un partenaire / membre.
- **« J'essaie cette offre »** : le client signale qu'il essaie l'offre d'un
  partenaire → points pour le client **+15** et le partenaire **+10**, et le
  partenaire est notifié (conversion croisée).
- **Envoi de client** (partenaire) : la demande de réservation part
  automatiquement dans l'appli du partenaire concerné, la Trattoria est prévenue,
  messagerie activée (points +25, +5 si accepté).
- **Retours optiques & sonores puissants** : bandeau clignotant + son distinctif
  (demande / acceptation / refus / message / badge / points) + vibration.

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

> Le compte staff « La Trattoria » est recréé automatiquement à
> chaque initialisation (INSERT OR IGNORE) : rien à faire.
> Pour changer son code, modifier l'utilisateur en base
> (table `users`, id = `trattoria`) puis vous reconnecter.

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
