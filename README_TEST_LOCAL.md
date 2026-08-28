# Tester La Trattoria en local

## Page publique

Depuis ce dossier, lancez :

```bash
python3 carte/serveur_carte.py 4173
```

Puis ouvrez : http://localhost:4173/public.html

La page publique charge les plats sélectionnés dans `carte/donnees-serveur.json` quand ce fichier existe, sinon elle affiche une sélection de démonstration.

## Communauté

Dans un second terminal :

```bash
python3 communaute/serveur_communaute.py 8721
```

Puis ouvrez : http://localhost:8721/

Les données de test restent locales dans `communaute/communaute.db`.
