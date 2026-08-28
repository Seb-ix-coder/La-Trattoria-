# APK native unifiée 1.4

## Build

```bash
bash build/build_final_apk.sh build/out/trato-unifie-1.4-stable-unsigned.apk
python3 build/build_unified.py \
  --dex build/out/dex-final/classes.dex \
  --output build/out/trato-unifie-1.4-stable-unsigned.apk \
  --keystore build/keystore/trattoria-release.p12 --password 'MOT_DE_PASSE'
python3 build/verify_final_apk.py trato-unifie-1.4-stable.apk build/keystore/trattoria-release.p12
```

Le pipeline compile `MainActivity.java`, `Modules.java` et `ServeurSite.java`
avec ECJ puis D8. La base est `app-src/base.apk`, dérivée de
`trato-gestion-1.3.apk`; le DEX de `com.trattoria.commande` n'est jamais
injecté. Les assets du site sont ajoutés sans fusion de tables `R`.

## Contenu

- interface native : accueil, salle, commandes, ventes, tickets, cartes,
  cartes du jour, ardoise, QR, stock, objectifs, comptabilité, invendus,
  personnel, communication, administration, paramètres, import/export,
  impression PDF et synchronisation locale ;
- header natif compilé à deux niveaux avec logo LT, titre courant, recherche
  clavier des écrans/fonctions/produits et navigation tactile horizontale ;
- site public local : carte depuis l'administration, photos administrées en
  priorité, fallback clairement marqué, plats du jour, slider, réservation,
  commande, paiement prévu, pourboire, fidélité, conformité, modes client et
  partenaire ;
- serveur de notation avec connexion, achat et `plat_id` stable côté serveur.

## Validation

Le diagnostic initial a trouvé Java absent et aucun émulateur Android. Les
outils Python ont été installés dans un environnement isolé. La compilation
native doit être exécutée avec JDK 17+; `verify_final_apk.py` vérifie ensuite
AXML, DEX, ZIP, v1, v2, badging, assets et certificat. L'installation,
rotation et lancement sur appareil physique restent à valider sur une
petite tablette avant déploiement.
