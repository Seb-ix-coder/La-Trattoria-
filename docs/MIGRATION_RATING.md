# Migration des achats et des notes de plats

## Pourquoi

L'ancien modèle pouvait stocker `achats.produits` comme texte libre. Une
recherche `LIKE` sur un nom n'est pas une preuve d'achat : le texte est
modifiable et deux plats peuvent avoir un libellé proche.

## Schéma v4

`communaute/serveur_communaute.py` ajoute de façon additive :

- `lignes_achat(id, achat_id, plat_id, nom, quantite, prix, cree_le)` ;
- `notes_plats(plat_id, user_id, achat_id, ligne_achat_id, note,
  commentaire, cree_le, modifie_le)` ;
- clé primaire `(plat_id, user_id)` et index sur `plat_id`.

Le flux caisse accepte désormais une liste JSON structurée contenant
`plat_id`, `qte` et `pv`. Le champ texte historique est conservé. Une ancienne
commande non structurée reçoit une ligne legacy avec `plat_id=''`, visible dans
l'historique mais volontairement inapte à autoriser une note.

## Sauvegarde et réversibilité

Au premier démarrage qui détecte l'ancien schéma, la base existante est copiée
vers `communaute.db.pre-migration-v4.bak` avant les changements. La copie n'est
jamais supprimée automatiquement. La migration ne supprime aucune donnée.

Pour revenir en arrière, arrêter le serveur, conserver la base migrée pour
archivage, puis restaurer la copie sur un environnement de test adapté. Ne
jamais écraser la base de production sans sauvegarde supplémentaire.

## Autorisation serveur

`POST /api/notes-plats` ou `/api/rating` exige :

1. une session valide ;
2. un `plat_id` stable et une note entière de 1 à 5 ;
3. une jointure SQL entre le téléphone du compte connecté, `achats`,
   `lignes_achat` et le même `plat_id` ;
4. un insert ou update sur la clé `(plat_id, user_id)`.

Le nom libre fourni par le navigateur n'est jamais utilisé pour prouver
l'achat. Les moyennes et compteurs publics excluent les notes orphelines ou
legacy. Un commentaire est limité à 500 caractères et échappé par le client.
