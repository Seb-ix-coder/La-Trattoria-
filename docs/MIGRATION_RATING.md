# Migration des achats et des notes de plats

## Pourquoi

La version historique stockait parfois `achats.produits` comme texte libre.
Une recherche `LIKE` sur le nom d'un plat ne constitue pas une preuve d'achat
fiable : deux plats peuvent avoir un nom proche et le texte est modifiable.

## Schéma v4

`communaute/serveur_communaute.py` ajoute :

- `lignes_achat(id, achat_id, plat_id, nom, quantite, prix, cree_le)` ;
- `notes_plats(plat_id, user_id, achat_id, ligne_achat_id, note,
  commentaire, cree_le, modifie_le)` ;
- une clé primaire `(plat_id, user_id)` pour empêcher plusieurs notes
  indépendantes du même utilisateur sur le même plat ;
- des index sur `plat_id`.

Les nouvelles lignes de caisse acceptent une structure JSON avec `plat_id`.
L'ancien champ `achats.produits` est conservé. S'il ne contient pas de JSON
structuré, une ligne legacy avec `plat_id=''` est créée pour garder l'historique,
mais elle n'autorise volontairement aucune notation.

## Sauvegarde et réversibilité

Au premier démarrage qui détecte l'ancien schéma, le serveur copie la base
vers `communaute.db.pre-migration-v4.bak` avant de créer les nouvelles tables.
La copie n'est jamais effacée automatiquement. La migration est additive :
aucune table ni donnée historique n'est supprimée.

Pour revenir en arrière, arrêtez le serveur, conservez la base migrée pour
archivage et remettez une copie de sauvegarde après avoir vérifié la version du
serveur utilisée. Testez toujours sur une copie avant production.

## Autorisation d'une note

`POST /api/notes-plats` (ou `/api/rating`) exige :

1. une session valide ;
2. un `plat_id` stable et une note entière de 1 à 5 ;
3. une jointure SQL entre le téléphone du compte, `achats`, `lignes_achat` et
   le même `plat_id` ;
4. une insertion ou mise à jour dans la clé `(plat_id, user_id)`.

La preuve ne dépend jamais du nom libre envoyé par le navigateur. Les
moyennes et compteurs ne publient que les lignes ayant un achat et un plat
identifiés.
