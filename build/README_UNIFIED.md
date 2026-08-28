# APK native unifiée 1.4

## Commande

```bash
# JDK 17+, ECJ, D8 et les outils du dossier build/native-tools requis
bash build/build_final_apk.sh build/out/trato-unifie-1.4-stable-unsigned.apk

# signature locale avec la clé de la base native
python3 build/build_unified.py \
  --dex build/out/dex-final/classes.dex \
  --output build/out/trato-unifie-1.4-stable-unsigned.apk \
  --keystore build/keystore/trattoria-release.p12 \
  --password 'MOT_DE_PASSE'

python3 build/verify_final_apk.py \
  trato-unifie-1.4-stable.apk build/keystore/trattoria-release.p12
```

Le second exemple recompile l'APK dans un nom sans suffixe `-unsigned`.
Le mot de passe ne doit pas être commité. Les fichiers de sortie sont dans
`build/out/`.

## Pipeline CI

`.github/workflows/build-unified-apk.yml` compile la source avec Java 17 et
publie un artefact **non signé**. La signature de livraison doit être faite
avec le keystore officiel conservé hors GitHub Actions, puis le fichier final
doit passer `verify_final_apk.py`.

## Ce qui est embarqué

- interface native de gestion : accueil, salle, prise de commande, ventes,
  tickets, cartes, cartes du jour, ardoise, QR, stock, objectifs,
  comptabilité, invendus, personnel, communication, administration,
  paramètres, import/export JSON, impression PDF et serveur local ;
- header natif compilé à deux niveaux avec logo LT, titre courant, recherche
  clavier et navigation horizontale ;
- site public local : carte dynamique depuis l'administration, cartes du jour,
  photos administrées en priorité, fallback explicitement marqué, slider,
  réservation, panier, paiement prévu, pourboire, fidélité, conformité,
  mentions légales et modes client/partenaire ;
- notation : le serveur Python `communaute/` fournit la migration SQL complète
  et la route `/api/notes-plats`. Le serveur natif local fournit le même
  contrôle pour les commandes authentifiées et stocke `public-data.json`.

## Limites de validation

L'environnement Arena ne contient pas de JVM ni d'émulateur Android au
moment du diagnostic initial. La compilation native est donc exécutée par le
workflow CI avec JDK 17. Les tests statiques (ZIP, AXML, DEX, v1/v2, JS et
modèle SQL) sont reproductibles localement. Un test d'installation, de
rotation et de lancement sur un téléphone/tablette physique doit encore être
fait avant déploiement ; il ne faut pas le confondre avec une vérification
APK automatisée.
